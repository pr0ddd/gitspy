import * as monaco from 'monaco-editor';
import { toHex } from './colour';
import EditorWorker from './monaco.worker?worker';

export const THEME = 'gitspy';

const hex = (probe: HTMLElement, value: string): string => {
  probe.style.color = value;
  const computed = getComputedStyle(probe).color;

  const surface = document.createElement('canvas');
  surface.width = 1;
  surface.height = 1;
  const ctx = surface.getContext('2d', { willReadFrequently: true });
  if (!ctx) return '#000000';

  ctx.fillStyle = '#000000';
  ctx.fillStyle = computed;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return toHex(r, g, b);
};

let ready = false;

export function setUpMonaco(): void {
  if (ready) return;
  ready = true;

  self.MonacoEnvironment = { getWorker: () => new EditorWorker() };

  const probe = document.createElement('span');
  probe.style.display = 'none';
  document.body.appendChild(probe);
  const token = (name: string) => hex(probe, `var(${name})`);

  monaco.editor.defineTheme(THEME, {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': token('--surface'),
      'editor.foreground': token('--foreground'),
      'editorGutter.background': token('--surface'),
      'editorLineNumber.foreground': token('--muted-foreground'),
      'editorLineNumber.activeForeground': token('--foreground'),
      'editor.lineHighlightBackground': token('--surface-raised'),
      'editor.selectionBackground': token('--surface-hover'),
      'editorWidget.background': token('--popover'),
      'editorWidget.border': token('--border'),
      'diffEditor.insertedTextBackground': `${token('--status-added')}22`,
      'diffEditor.removedTextBackground': `${token('--status-deleted')}22`,
      'diffEditor.insertedLineBackground': `${token('--status-added')}14`,
      'diffEditor.removedLineBackground': `${token('--status-deleted')}14`,
      'diffEditor.border': token('--border'),
      'scrollbarSlider.background': `${token('--muted-foreground')}44`,
      'scrollbarSlider.hoverBackground': `${token('--muted-foreground')}66`,
    },
  });

  probe.remove();
}

const BY_EXTENSION: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  rs: 'rust',
  json: 'json',
  css: 'css',
  html: 'html',
  md: 'markdown',
  py: 'python',
  go: 'go',
  sh: 'shell',
  yml: 'yaml',
  yaml: 'yaml',
  toml: 'ini',
  sql: 'sql',
};

export const languageOf = (path: string): string => {
  const extension = path.split('.').pop()?.toLowerCase() ?? '';
  return BY_EXTENSION[extension] ?? 'plaintext';
};

export { monaco };
