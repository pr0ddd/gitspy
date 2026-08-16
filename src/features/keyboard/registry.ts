import { useEffect, useRef } from 'react';
import { onApple } from '@/shared/lib/keys';
import { commandFor, type Area, type CommandId } from './commands';

export type Scope = Area | 'app';

export type Handlers = Partial<Record<CommandId, () => void>>;

const bound = new Map<string, () => void>();

const slot = (scope: Scope, id: CommandId): string => `${scope}:${id}`;

export function bindCommands(scope: Scope, handlers: Handlers): () => void {
  const taken: string[] = [];
  for (const [id, run] of Object.entries(handlers) as [CommandId, () => void][]) {
    bound.set(slot(scope, id), run);
    taken.push(slot(scope, id));
  }
  return () => taken.forEach((key) => bound.delete(key));
}

const TEXT_FIELDS = 'input, textarea, [contenteditable="true"]';
const EDITED_MONACO = '.monaco-editor[data-editing="true"]';
const OVERLAYS =
  '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"][data-radix-collection-item], [data-radix-popper-content-wrapper]';

export const insideOverlay = (node: Element | null): boolean =>
  node !== null && node.closest(OVERLAYS) !== null;

export function areaOf(node: Element | null): Area | null {
  if (!node) return null;
  const monaco = node.closest('.monaco-editor');
  if (monaco) {
    if (monaco.matches(EDITED_MONACO)) return 'text';
  } else if (node.closest(TEXT_FIELDS)) {
    return 'text';
  }
  const named = node.closest('[data-area]')?.getAttribute('data-area');
  return named === 'files' || named === 'refs' || named === 'graph' ? named : null;
}

export function focusArea(area: Area): void {
  const host = document.querySelector<HTMLElement>(`[data-area="${area}"]`);
  if (!host) return;
  const stop = host.matches('[tabindex]')
    ? host
    : host.querySelector<HTMLElement>('[tabindex="0"]');
  stop?.focus();
}

export function useCommands(scope: Scope, handlers: Handlers): void {
  const live = useRef(handlers);
  live.current = handlers;
  const ids = (Object.keys(handlers) as CommandId[]).sort();
  const shape = ids.join(',');

  useEffect(() => {
    const forwarding: Handlers = {};
    for (const id of shape.split(',').filter(Boolean) as CommandId[]) {
      forwarding[id] = () => live.current[id]?.();
    }
    return bindCommands(scope, forwarding);
  }, [scope, shape]);
}

export function useKeyboard(fallback: Area | null): void {
  const at = useRef(fallback);
  at.current = fallback;

  useEffect(() => {
    const apple = onApple();
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (insideOverlay(document.activeElement)) return;
      const area = areaOf(document.activeElement) ?? at.current;
      const command = commandFor(event, area, apple);
      if (!command) return;
      const run = area
        ? (bound.get(slot(area, command.id)) ?? bound.get(slot('app', command.id)))
        : bound.get(slot('app', command.id));
      if (!run) return;
      event.preventDefault();
      event.stopPropagation();
      run();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);
}
