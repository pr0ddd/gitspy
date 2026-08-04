import { describe, expect, it } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import '../i18n';
import { TooltipProvider } from '@/components/ui/tooltip';
import { WorkingTree } from './WorkingTree';
import type { WorkingTreeView } from '../types';

const treeWith = (staged: number): WorkingTreeView => ({
  branch: 'branches',
  upstream: null,
  remotes: ['origin'],
  ahead: 0,
  behind: 0,
  staged,
  unstaged: 0,
  conflicts: 0,
  inProgress: null,
  merging: null,
  entries: Array.from({ length: staged }, (_, i) => ({
    staged: true,
    letter: 'M',
    path: `src/file-${i}.ts`,
    oldPath: null,
  })),
});

type Extra = Partial<{
  description: string;
  amend: boolean;
  onAmend: (next: boolean) => void;
  onMessage: (text: string) => void;
  onDescription: (text: string) => void;
  previous: { subject: string; body: string } | null;
}>;

const draw = (tree: WorkingTreeView, message: string, onCommit: () => void, extra: Extra = {}) =>
  render(
    <TooltipProvider>
      <WorkingTree
        tree={tree}
        busy={false}
        message={message}
        description={extra.description ?? ''}
        amend={extra.amend ?? false}
        previous={extra.previous ?? null}
        onMessage={extra.onMessage ?? (() => {})}
        onDescription={extra.onDescription ?? (() => {})}
        onAmend={extra.onAmend ?? (() => {})}
        onCommit={onCommit}
        onRun={() => {}}
        onOperation={() => {}}
        onOpen={() => {}}
      />
    </TooltipProvider>,
  );

describe('коммит из панели рабочего дерева', () => {
  it('кнопка мертва, пока сообщение пустое', () => {
    const { getByRole } = draw(treeWith(2), '   ', () => {});
    expect((getByRole('button', { name: /commit/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('с сообщением и стейджем клик создаёт коммит', () => {
    let committed = 0;
    const { getByRole } = draw(treeWith(2), 'fix: thing', () => (committed += 1));
    const button = getByRole('button', { name: /commit/i }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    expect(committed).toBe(1);
  });

  it('без единого файла в индексе коммитить нечего', () => {
    const { getByRole } = draw(treeWith(0), 'fix: thing', () => {});
    expect((getByRole('button', { name: /commit/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('Cmd+Enter в поле сообщения — тот же коммит, что и кнопка', () => {
    let committed = 0;
    const { getByPlaceholderText } = draw(treeWith(1), 'fix', () => (committed += 1));
    fireEvent.keyDown(getByPlaceholderText(/commit message/i), { key: 'Enter', metaKey: true });
    expect(committed).toBe(1);
  });

  it('описание печатается в своём поле и уходит наружу', () => {
    let described = '';
    const { getByPlaceholderText } = draw(treeWith(1), 'fix', () => {}, {
      onDescription: (text) => (described = text),
    });
    fireEvent.change(getByPlaceholderText(/description/i), { target: { value: 'почему так' } });
    expect(described).toBe('почему так');
  });

  it('amend оживляет кнопку даже с пустым индексом', () => {
    const { getByRole } = draw(treeWith(0), 'better words', () => {}, {
      amend: true,
      previous: { subject: 'old', body: '' },
    });
    expect(
      (getByRole('button', { name: /commit/i }) as HTMLButtonElement).disabled,
      'amend меняет сообщение прошлого коммита, индекс может быть пуст',
    ).toBe(false);
  });

  it('включение amend при пустых полях подставляет прошлое сообщение', () => {
    let message = '';
    let description = '';
    const { getByRole } = draw(treeWith(0), '', () => {}, {
      previous: { subject: 'старая тема', body: 'старое тело' },
      onMessage: (text) => (message = text),
      onDescription: (text) => (description = text),
    });
    fireEvent.click(getByRole('checkbox'));
    expect(message, 'заголовок прошлого коммита переехал в поле').toBe('старая тема');
    expect(description, 'тело прошлого коммита переехало в описание').toBe('старое тело');
  });

  it('без прошлого коммита amend недоступен', () => {
    const { getByRole } = draw(treeWith(1), 'fix', () => {}, { previous: null });
    expect((getByRole('checkbox') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('панель во время слияния', () => {
  const mergingTree = (conflicts: number, resolved: number): WorkingTreeView => ({
    ...treeWith(0),
    branch: 'main',
    conflicts,
    inProgress: 'merge',
    merging: { from: 'feature', subject: "Merge branch 'feature'" },
    unstaged: conflicts,
    staged: resolved,
    entries: [
      ...Array.from({ length: conflicts }, (_, i) => ({
        staged: false,
        letter: 'U',
        path: `clash-${i}.ts`,
        oldPath: null,
      })),
      ...Array.from({ length: resolved }, (_, i) => ({
        staged: true,
        letter: 'M',
        path: `done-${i}.ts`,
        oldPath: null,
      })),
    ],
  });

  const drawMerging = (
    tree: WorkingTreeView,
    over: {
      message?: string;
      onCommit?: () => void;
      onRun?: (operation: unknown) => void;
      onOperation?: (operation: { kind: string }) => void;
    } = {},
  ) =>
    render(
      <TooltipProvider>
        <WorkingTree
          tree={tree}
          busy={false}
          message={over.message ?? ''}
          description=""
          amend={false}
          previous={null}
          onMessage={() => {}}
          onDescription={() => {}}
          onAmend={() => {}}
          onCommit={over.onCommit ?? (() => {})}
          onRun={(operation) => over.onRun?.(operation)}
          onOperation={(operation) => over.onOperation?.(operation)}
          onOpen={() => {}}
        />
      </TooltipProvider>,
    );

  it('секции называются конфликтами и разрешёнными, а шапка называет ветки', () => {
    const { getByText } = drawMerging(mergingTree(2, 1));
    expect(getByText(/conflicted files/i)).toBeTruthy();
    expect(getByText(/resolved files/i)).toBeTruthy();
    expect(getByText('feature')).toBeTruthy();
    expect(getByText('main', { exact: true })).toBeTruthy();
  });

  it('mark all resolved стейджит все конфликтные пути разом', () => {
    let ran: { kind: string; paths?: string[] } | null = null;
    const { getByRole } = drawMerging(mergingTree(2, 0), {
      onRun: (operation) => (ran = operation as { kind: string; paths?: string[] }),
    });
    fireEvent.click(getByRole('button', { name: /mark all resolved/i }));
    expect(ran, 'пометить разрешённым — это git add, других значений у кнопки нет').toEqual({
      kind: 'stage',
      paths: ['clash-0.ts', 'clash-1.ts'],
    });
  });

  it('commit and merge мёртв при конфликтах и жив после', () => {
    const dead = drawMerging(mergingTree(2, 0), { message: 'Merge!' });
    expect(
      (dead.getByRole('button', { name: /commit and merge/i }) as HTMLButtonElement).disabled,
      'git commit при неразрешённых конфликтах упадёт — кнопка знает это раньше',
    ).toBe(true);
    dead.unmount();

    let committed = 0;
    const alive = drawMerging(mergingTree(0, 2), {
      message: 'Merge!',
      onCommit: () => (committed += 1),
    });
    fireEvent.click(alive.getByRole('button', { name: /commit and merge/i }));
    expect(committed).toBe(1);
  });

  it('слияние без конфликтов — обычная панель стейджа с парой кнопок внизу', () => {
    const view = drawMerging(mergingTree(0, 2), { message: 'Merge!' });
    expect(view.getByText(/unstaged/i), 'секции обычные, как вне слияния').toBeTruthy();
    expect(view.getByText(/^staged/i)).toBeTruthy();
    expect(view.queryByText(/conflicted files/i), 'конфликтов нет — конфликтной панели нет').toBeNull();
    expect(view.queryByText(/resolved files/i)).toBeNull();
    expect(view.getByRole('button', { name: /commit and merge/i })).toBeTruthy();
    expect(view.getByRole('button', { name: /abort merge/i })).toBeTruthy();
    expect(view.queryByRole('checkbox'), 'амендить посреди слияния нельзя').toBeNull();
  });

  it('снятие разрешённого файла возвращает конфликт, а не голый reset', () => {
    let ran: { kind: string; paths?: string[] } | null = null;
    const { getByRole } = drawMerging(mergingTree(1, 1), {
      onRun: (operation) => (ran = operation as { kind: string; paths?: string[] }),
    });
    fireEvent.click(getByRole('button', { name: /^unresolve$/i }));
    expect(ran, 'git reset стирает стадии слияния навсегда, checkout -m их возвращает').toEqual({
      kind: 'unresolve',
      paths: ['done-0.ts'],
    });
  });

  it('abort merge зовёт операцию из закрытого списка', () => {
    let ran: string | null = null;
    const { getByRole } = drawMerging(mergingTree(2, 0), {
      onOperation: (operation) => (ran = operation.kind),
    });
    fireEvent.click(getByRole('button', { name: /abort merge/i }));
    expect(ran).toBe('mergeAbort');
  });

  it('амендить посреди слияния нельзя — чекбокса нет', () => {
    const { queryByRole } = drawMerging(mergingTree(1, 0));
    expect(queryByRole('checkbox'), 'git commit --amend при MERGE_HEAD отказывает').toBeNull();
  });
});
