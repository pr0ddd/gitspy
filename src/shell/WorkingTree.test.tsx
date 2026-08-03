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
