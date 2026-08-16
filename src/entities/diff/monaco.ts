import * as monaco from 'monaco-editor';
import { toHex } from '@/shared/lib/colour';
import type { HiddenSpan } from './hunks';
import { readPref } from '@/shared/lib/prefs';
import {
  clampFontSize,
  clampTabSize,
  FONT_SIZE_LIMITS,
  SETTINGS,
  TAB_SIZE_LIMITS,
} from '@/shared/config/settingsModel';
import EditorWorker from './monaco.worker?worker';
import TypeScriptWorker from 'monaco-editor/language/typescript/ts.worker.js?worker';
import JsonWorker from 'monaco-editor/language/json/json.worker.js?worker';
import CssWorker from 'monaco-editor/language/css/css.worker.js?worker';
import HtmlWorker from 'monaco-editor/language/html/html.worker.js?worker';

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

let workerReady = false;
let paintedFor = '';

function workerFor(label: string): Worker {
  if (label === 'typescript' || label === 'javascript') return new TypeScriptWorker();
  if (label === 'json') return new JsonWorker();
  if (label === 'css' || label === 'scss' || label === 'less') return new CssWorker();
  if (label === 'html' || label === 'handlebars' || label === 'razor') return new HtmlWorker();
  return new EditorWorker();
}

export function setUpMonaco(): void {
  const appearance = document.documentElement.dataset.theme ?? '';
  if (paintedFor === appearance && workerReady) return;
  paintedFor = appearance;
  workerReady = true;

  if (!self.MonacoEnvironment) {
    self.MonacoEnvironment = { getWorker: (_id: string, label: string) => workerFor(label) };
  }

  const probe = document.createElement('span');
  probe.style.display = 'none';
  document.body.appendChild(probe);
  const token = (name: string) => hex(probe, `var(${name})`);

  monaco.editor.defineTheme(THEME, {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': token('--card'),
      'editor.foreground': token('--foreground'),
      'editorGutter.background': token('--card'),
      'editorLineNumber.foreground': token('--faint-foreground'),
      'editorLineNumber.activeForeground': token('--foreground'),
      'editor.lineHighlightBackground': token('--popover'),
      'editor.selectionBackground': `${token('--primary')}33`,
      'editorWidget.background': token('--popover'),
      'editorWidget.border': token('--border'),
      'diffEditor.insertedTextBackground': `${token('--status-added')}22`,
      'diffEditor.removedTextBackground': `${token('--status-deleted')}22`,
      'diffEditor.insertedLineBackground': `${token('--status-added')}14`,
      'diffEditor.removedLineBackground': `${token('--status-deleted')}14`,
      'diffEditor.border': token('--border'),
      'diffEditorOverview.insertedForeground': `${token('--status-added')}cc`,
      'diffEditorOverview.removedForeground': `${token('--status-deleted')}cc`,
      'scrollbarSlider.background': `${token('--muted-foreground')}44`,
      'scrollbarSlider.hoverBackground': `${token('--muted-foreground')}66`,
    },
  });

  probe.remove();
}

export const EDITOR_BASE = {
  theme: THEME,
  readOnly: true,
  automaticLayout: true,
  fontFamily: "'Geist Mono Variable', ui-monospace, Menlo, monospace",
  fontSize: 13,
  lineHeight: 20,
  minimap: { enabled: true },
  lineNumbersMinChars: 5,
  inlayHints: { enabled: 'off' },
  stickyScroll: { defaultModel: 'indentationModel' },
  scrollBeyondLastLine: false,
  lightbulb: { enabled: monaco.editor.ShowLightbulbIconMode.Off },
} as const;

export const DIFF_EDITOR_BASE = {
  ...EDITOR_BASE,
  renderOverviewRuler: true,
  stickyScroll: { enabled: false },
  hideUnchangedRegions: { enabled: false },
} as const;

export function userEditorOptions() {
  const family = readPref<string>(SETTINGS.editorFont, '').trim();
  const size = clampFontSize(readPref<number>(SETTINGS.editorFontSize, FONT_SIZE_LIMITS.fallback));
  return {
    fontFamily: family ? `'${family}', ui-monospace, Menlo, monospace` : EDITOR_BASE.fontFamily,
    fontSize: size,
    lineHeight: Math.round(size * 1.55),
    lineNumbers: (readPref<boolean>(SETTINGS.editorLineNumbers, true)
      ? 'on'
      : 'off') as monaco.editor.LineNumbersType,
    tabSize: clampTabSize(readPref<number>(SETTINGS.editorTabSize, TAB_SIZE_LIMITS.fallback)),
  };
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

const languageOfPath = (path: string): string => {
  const extension = path.split('.').pop()?.toLowerCase() ?? '';
  return BY_EXTENSION[extension] ?? 'plaintext';
};

export const languageOf = (path: string): string =>
  readPref<boolean>(SETTINGS.editorSyntax, true) ? languageOfPath(path) : 'plaintext';

export function setHiddenLineSpans(
  editor: monaco.editor.ICodeEditor,
  spans: readonly HiddenSpan[],
): void {
  const hiding = editor as monaco.editor.ICodeEditor & {
    setHiddenAreas(ranges: monaco.IRange[]): void;
  };
  hiding.setHiddenAreas(spans.map((span) => new monaco.Range(span.from, 1, span.to, 1)));
}

export { monaco };
