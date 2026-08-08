import { convertFileSrc } from '@tauri-apps/api/core';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker';
import { identicon } from '@/avatar';
import { avatarPaths, openRepo, recentRepos, termInput, termKill, termOpen } from '@/ipc';
import { reportOf, type CspSubject, type CspViolation } from './csp';

const REPORT_CWD = '/tmp';
const REPORT = 'cat >> /tmp/gitspy-csp-probe.log';
const CANARY_HOST = 'gitspy.invalid';
const CANARY = `https://${CANARY_HOST}/canary.png`;
const SETTLE_MS = 5000;
const FLUSH_MS = 500;
const DIFF_LIMIT_MS = 15000;
const WORKER_GRACE_MS = 700;
const REPOS_TRIED = 4;
const IDENTICON_SIZE = 36;
const SANS_FAMILY = "'Geist Variable'";
const MONO_FAMILY = "'Geist Mono Variable', Menlo, monospace";
const PROBE_SIZE = 13;
const ORIGINAL = 'const a = 1;\nconst b = 2;\nconst c = 3;\n';
const MODIFIED = 'const a = 1;\nconst b = 20;\nconst c = 3;\n';
const INLINE_COLOUR = 'rgb(1, 2, 3)';

const rest = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const waitFor = (ready: () => boolean, limitMs: number): Promise<boolean> =>
  new Promise((resolve) => {
    const from = Date.now();
    const tick = () => {
      if (ready()) return resolve(true);
      if (Date.now() - from > limitMs) return resolve(false);
      setTimeout(tick, 30);
    };
    tick();
  });

const panel = (left: string, width: string): HTMLElement => {
  const host = document.createElement('div');
  host.style.position = 'fixed';
  host.style.top = '0';
  host.style.height = '100%';
  host.style.left = left;
  host.style.width = width;
  document.body.append(host);
  return host;
};

const linkedStylesheetSubject = (): CspSubject => {
  const family = getComputedStyle(document.body).fontFamily;
  return { name: 'linked_stylesheet', ok: family.includes('Geist'), detail: `body_font=${family}` };
};

const styleAttributeSubject = (): CspSubject => {
  const painted = document.createElement('div');
  painted.setAttribute('style', `color: ${INLINE_COLOUR}`);
  document.body.append(painted);
  const colour = getComputedStyle(painted).color;
  painted.remove();
  return { name: 'style_attribute', ok: colour === INLINE_COLOUR, detail: `colour=${colour}` };
};

const liveSheets = (): number =>
  [...document.querySelectorAll('style')].filter((node) => {
    try {
      return (node.sheet?.cssRules.length ?? 0) > 0;
    } catch {
      return false;
    }
  }).length;

const monacoSubjects = async (host: HTMLElement): Promise<CspSubject[]> => {
  let asked = 0;
  let broken = 0;
  self.MonacoEnvironment = {
    getWorker: () => {
      asked += 1;
      const worker = new EditorWorker();
      worker.addEventListener('error', () => {
        broken += 1;
      });
      return worker;
    },
  };

  const sheetsBefore = liveSheets();
  const editor = monaco.editor.createDiffEditor(host, { automaticLayout: false, readOnly: true });
  let updated = false;
  editor.onDidUpdateDiff(() => {
    updated = true;
  });
  editor.setModel({
    original: monaco.editor.createModel(ORIGINAL, 'typescript'),
    modified: monaco.editor.createModel(MODIFIED, 'typescript'),
  });

  const diffed = await waitFor(() => updated, DIFF_LIMIT_MS);
  await rest(WORKER_GRACE_MS);
  const changes = editor.getLineChanges()?.length ?? 0;
  const sheetsAfter = liveSheets();

  return [
    {
      name: 'monaco_worker',
      ok: asked > 0 && broken === 0 && diffed && changes > 0,
      detail: `asked=${asked} broken=${broken} updated=${diffed} changes=${changes}`,
    },
    {
      name: 'monaco_styles',
      ok: sheetsAfter > sheetsBefore,
      detail: `sheets=${sheetsBefore}->${sheetsAfter}`,
    },
  ];
};

const facesLoaded = async (font: string): Promise<number> => {
  const faces = await document.fonts.load(font).catch((): FontFace[] => []);
  return faces.filter((face) => face.status === 'loaded').length;
};

const fontSubject = async (): Promise<CspSubject> => {
  const sans = await facesLoaded(`${PROBE_SIZE}px ${SANS_FAMILY}`);
  const mono = await facesLoaded(`${PROBE_SIZE}px ${MONO_FAMILY}`);
  return { name: 'fonts', ok: sans > 0 && mono > 0, detail: `sans=${sans} mono=${mono}` };
};

const xtermSubject = (host: HTMLElement): CspSubject => {
  const term = new Terminal({ fontFamily: MONO_FAMILY, fontSize: PROBE_SIZE });
  const fit = new FitAddon();
  term.loadAddon(fit);
  term.open(host);
  fit.fit();
  let webgl = 'ok';
  try {
    term.loadAddon(new WebglAddon());
  } catch (failure) {
    webgl = failure instanceof Error ? failure.message : String(failure);
  }
  term.write('csp probe\r\n');
  return { name: 'xterm_webgl', ok: webgl === 'ok', detail: webgl };
};

const assetSubject = async (): Promise<CspSubject> => {
  const recents = await recentRepos();
  for (const recent of recents.slice(0, REPOS_TRIED)) {
    if (!recent.exists) continue;
    try {
      await openRepo(recent.path);
      const cached = Object.values(await avatarPaths(recent.path));
      if (cached.length === 0) continue;
      const src = convertFileSrc(cached[0]);
      const image = new Image();
      image.src = src;
      return { name: 'asset_image', ok: await shown(image), detail: `src=${src}` };
    } catch (failure) {
      return {
        name: 'asset_image',
        ok: false,
        detail: failure instanceof Error ? failure.message : JSON.stringify(failure),
      };
    }
  }
  return { name: 'asset_image', ok: false, detail: 'no cached avatar in recent repos' };
};

const shown = (image: HTMLImageElement): Promise<boolean> =>
  image.decode().then(
    () => true,
    () => false,
  );

const dataImageSubject = async (): Promise<CspSubject> => {
  const drawn = new Image();
  drawn.src = identicon('csp probe', IDENTICON_SIZE).toDataURL();
  return { name: 'data_image', ok: await shown(drawn), detail: `bytes=${drawn.src.length}` };
};

const raiseCanary = (): void => {
  const canary = new Image();
  canary.style.display = 'none';
  canary.src = CANARY;
  document.body.append(canary);
};

export const mountProbe = async (): Promise<void> => {
  document.getElementById('root')?.remove();

  const violations: CspViolation[] = [];
  document.addEventListener('securitypolicyviolation', (event) => {
    violations.push({
      directive: event.violatedDirective,
      blocked: event.blockedURI || 'none',
      source: `${event.sourceFile || 'none'}:${event.lineNumber}`,
    });
  });

  const subjects: CspSubject[] = [];
  try {
    raiseCanary();
    subjects.push(linkedStylesheetSubject(), styleAttributeSubject());
    subjects.push(...(await monacoSubjects(panel('0', '60%'))));
    subjects.push(xtermSubject(panel('60%', '40%')));
    subjects.push(await fontSubject());
    subjects.push(await dataImageSubject());
    subjects.push(await assetSubject());
  } catch (failure) {
    subjects.push({
      name: 'probe',
      ok: false,
      detail: failure instanceof Error ? failure.message : JSON.stringify(failure),
    });
  }

  await rest(SETTLE_MS);

  const fromCanary = (violation: CspViolation) => violation.blocked.includes(CANARY_HOST);
  const lines = reportOf({
    enforced: violations.some(fromCanary),
    subjects,
    violations: violations.filter((violation) => !fromCanary(violation)),
  });

  const reporter = await termOpen(REPORT_CWD, REPORT, false, () => {});
  await termInput(reporter, lines.join('\n') + '\n');
  await rest(FLUSH_MS);
  await termKill(reporter);
};
