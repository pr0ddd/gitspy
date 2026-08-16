import { Terminal } from '@xterm/xterm';
import type { IDisposable, ILink } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { SerializeAddon } from '@xterm/addon-serialize';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { WebglAddon } from '@xterm/addon-webgl';
import '@xterm/xterm/css/xterm.css';
import { openUrl, termAck, termInput, termKill, termOpen, termResize } from '@/shared/api/ipc';
import { readTermThemeFromDom } from './theme';

export type TermLinkTarget = {
  kind: 'file' | 'hash';
  text: string;
  path?: string;
  line?: number;
};

export type TermLinkHit = { start: number; end: number; link: TermLinkTarget };

export type TermHooks = {
  onTitle(title: string): void;
  onFileLink(path: string, line?: number): void;
  onHashLink(oid: string): void;
};

export type TermHostOptions = {
  cwd: string;
  command: string | null;
  detect: (line: string) => TermLinkHit[];
  hooks: TermHooks;
};

export type TermHost = {
  id: number;
  fit(): void;
  focus(): void;
  dispose(): void;
};

const SCROLLBACK = 5000;
const FONT_SIZE = 13;
const FONT_FAMILY = "'Geist Mono Variable', Menlo, monospace";

const screensLeftByDisposedHosts = new Map<number, string>();

const acceleratedRendererOrPlainCanvas = (term: Terminal): WebglAddon | null => {
  try {
    const webgl = new WebglAddon();
    term.loadAddon(webgl);
    return webgl;
  } catch {
    return null;
  }
};

const followLink = (hooks: TermHooks, link: TermLinkTarget): void => {
  if (link.kind === 'file') hooks.onFileLink(link.path ?? link.text, link.line);
  else hooks.onHashLink(link.text);
};

export const createTermHost = async (el: HTMLElement, opts: TermHostOptions): Promise<TermHost> => {
  const term = new Terminal({
    fontFamily: FONT_FAMILY,
    fontSize: FONT_SIZE,
    theme: readTermThemeFromDom(),
    scrollback: SCROLLBACK,
  });
  const fit = new FitAddon();
  const serialize = new SerializeAddon();
  const search = new SearchAddon();
  const webLinks = new WebLinksAddon((_event, uri) => void openUrl(uri));
  term.loadAddon(fit);
  term.loadAddon(serialize);
  term.loadAddon(search);
  term.loadAddon(webLinks);
  term.open(el);
  fit.fit();
  const webgl = acceleratedRendererOrPlainCanvas(term);

  let sessionId: number | null = null;
  let owedBytes = 0;
  const ackOnceSessionIsKnown = (bytes: number): void => {
    owedBytes += bytes;
    if (sessionId === null || owedBytes === 0) return;
    const settled = owedBytes;
    owedBytes = 0;
    void termAck(sessionId, settled);
  };

  const id = await termOpen(opts.cwd, opts.command, (bytes) => {
    term.write(bytes, () => ackOnceSessionIsKnown(bytes.length));
  });
  sessionId = id;
  ackOnceSessionIsKnown(0);

  const restored = screensLeftByDisposedHosts.get(id);
  if (restored !== undefined) {
    screensLeftByDisposedHosts.delete(id);
    term.write(restored);
  }

  const linksOnLine = (bufferLineNumber: number): ILink[] => {
    const line = term.buffer.active.getLine(bufferLineNumber - 1);
    if (!line) return [];
    return opts.detect(line.translateToString(true)).map((hit) => ({
      range: {
        start: { x: hit.start + 1, y: bufferLineNumber },
        end: { x: hit.end, y: bufferLineNumber },
      },
      text: hit.link.text,
      activate: () => followLink(opts.hooks, hit.link),
    }));
  };

  const wiring: IDisposable[] = [
    term.onTitleChange((title) => opts.hooks.onTitle(title)),
    term.onData((data) => void termInput(id, data)),
    term.onResize(({ cols, rows }) => void termResize(id, cols, rows)),
    term.registerLinkProvider({
      provideLinks: (bufferLineNumber, done) => done(linksOnLine(bufferLineNumber)),
    }),
  ];

  return {
    id,
    fit: () => fit.fit(),
    focus: () => term.focus(),
    dispose: () => {
      screensLeftByDisposedHosts.set(id, serialize.serialize());
      for (const part of wiring) part.dispose();
      webgl?.dispose();
      term.dispose();
      void termKill(id);
    },
  };
};
