import { beforeEach, describe, expect, it } from 'vitest';

beforeEach(() => localStorage.clear());
import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { showNativeMenu } from '@/features/menus';

vi.mock('@/features/menus', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  showNativeMenu: vi.fn(() => Promise.resolve()),
}));
vi.mock('@tauri-apps/plugin-dialog', () => ({ ask: vi.fn(() => Promise.resolve(false)) }));
vi.mock('@/ipc', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  aiGenerateCommit: vi.fn(() =>
    Promise.resolve({ summary: 'Add parser', description: 'Covers fences.' }),
  ),
}));
import '../i18n';
import { TooltipProvider } from '@/components/ui/tooltip';
import { WorkingTree } from './WorkingTree';
import type { Operation, WorkingTreeView } from '@/types';

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
  onConfirm: (operation: Operation) => void;
  onRun: () => void;
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
        repo="/repo"
        tree={tree}
        message={message}
        description={extra.description ?? ''}
        amend={extra.amend ?? false}
        previous={extra.previous ?? null}
        onMessage={extra.onMessage ?? (() => {})}
        onDescription={extra.onDescription ?? (() => {})}
        onAmend={extra.onAmend ?? (() => {})}
        onCommit={onCommit}
        onRun={extra.onRun ?? (() => {})}
        onOperation={() => {}}
        onConfirm={extra.onConfirm ?? (() => {})}
        onOpen={() => {}}
        onCopy={() => {}}
        onHistory={() => {}}
      />
    </TooltipProvider>,
  );

describe('кнопка генерации сообщения', () => {
  it('без staged-файлов кнопка неактивна', () => {
    localStorage.setItem('gitspy.ai.model', '"qwen2.5-coder"');
    draw(treeWith(0), '', () => {});
    const generate = screen.getByLabelText('Generate commit message') as HTMLButtonElement;
    expect(generate.disabled, 'нечего описывать — нечего и генерировать').toBe(true);
  });

  it('без выбранной модели кнопка неактивна', () => {
    draw(treeWith(1), '', () => {});
    const generate = screen.getByLabelText('Generate commit message') as HTMLButtonElement;
    expect(generate.disabled, 'без настроенной модели запрос отправлять некуда').toBe(true);
  });

  it('ответ модели заполняет оба поля черновика', async () => {
    localStorage.setItem('gitspy.ai.model', '"qwen2.5-coder"');
    const onMessage = vi.fn();
    const onDescription = vi.fn();
    draw(treeWith(1), '', () => {}, { onMessage, onDescription });

    fireEvent.click(screen.getByLabelText('Generate commit message'));

    await vi.waitFor(() =>
      expect(onMessage, 'заголовок приходит из ответа модели').toHaveBeenCalledWith('Add parser'),
    );
    expect(onDescription, 'описание приходит тем же ответом').toHaveBeenCalledWith(
      'Covers fences.',
    );
  });
});

describe('шапка панели рабочего дерева', () => {
  it('корзина не выбрасывает изменения сама, а просит подтверждения', () => {
    const asked: Operation[] = [];
    let ranStraightAway = 0;
    const { getByRole } = draw(treeWith(2), '', () => {}, {
      onConfirm: (operation) => asked.push(operation),
      onRun: () => (ranStraightAway += 1),
    });

    fireEvent.click(getByRole('button', { name: /discard all changes/i }));

    expect(asked, 'нажатие корзины отдаёт операцию на подтверждение').toEqual([
      { kind: 'discardAll' },
    ]);
    expect(ranStraightAway, 'без подтверждения ничего не выполняется').toBe(0);
  });

  it('считает все изменения и называет ветку, на которой они лежат', () => {
    const { getByText } = draw(treeWith(3), '', () => {});

    expect(getByText('3 file changes on')).toBeTruthy();
    expect(getByText('branches')).toBeTruthy();
  });

  it('единственное изменение считается в единственном числе', () => {
    const { getByText } = draw(treeWith(1), '', () => {});

    expect(getByText('1 file change on')).toBeTruthy();
  });

  it('вид «дерево» собирает файлы под каталог, вид «путь» держит их плоско', () => {
    const { getByRole, queryByText } = draw(treeWith(2), '', () => {});

    expect(queryByText('src'), 'в плоском виде каталог отдельной строкой не стоит').toBeNull();

    fireEvent.click(getByRole('button', { name: /tree/i }));

    expect(queryByText('src'), 'в дереве каталог становится строкой').toBeTruthy();
    expect(queryByText('file-0.ts'), 'а файл под ним теряет путь из имени').toBeTruthy();
  });
});

describe('контекстное меню файла', () => {
  it('правый клик по строке открывает меню с файловыми действиями', () => {
    vi.mocked(showNativeMenu).mockClear();
    draw(treeWith(2), '', () => {});

    fireEvent.contextMenu(screen.getByText('file-0.ts'));

    expect(showNativeMenu).toHaveBeenCalledTimes(1);
    const [sections] = vi.mocked(showNativeMenu).mock.calls[0];
    expect(sections.flat().map((item) => item.id)).toContain('unstage');
    expect(sections.flat().map((item) => item.id)).toContain('ignore');
  });
});

describe('коммит из панели рабочего дерева', () => {
  it('кнопка мертва, пока сообщение пустое', () => {
    const { getByRole } = draw(treeWith(2), '   ', () => {});
    expect((getByRole('button', { name: /^commit$/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('с сообщением и стейджем клик создаёт коммит', () => {
    let committed = 0;
    const { getByRole } = draw(treeWith(2), 'fix: thing', () => (committed += 1));
    const button = getByRole('button', { name: /^commit$/i }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    expect(committed).toBe(1);
  });

  it('без единого файла в индексе коммитить нечего', () => {
    const { getByRole } = draw(treeWith(0), 'fix: thing', () => {});
    expect((getByRole('button', { name: /^commit$/i }) as HTMLButtonElement).disabled).toBe(true);
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
      (getByRole('button', { name: /^commit$/i }) as HTMLButtonElement).disabled,
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
    fireEvent.click(getByRole('checkbox', { name: 'Amend previous commit' }));
    expect(message, 'заголовок прошлого коммита переехал в поле').toBe('старая тема');
    expect(description, 'тело прошлого коммита переехало в описание').toBe('старое тело');
  });

  it('без прошлого коммита amend недоступен', () => {
    const { getByRole } = draw(treeWith(1), 'fix', () => {}, { previous: null });
    expect(
      (getByRole('checkbox', { name: 'Amend previous commit' }) as HTMLButtonElement).disabled,
    ).toBe(true);
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
          repo="/repo"
          tree={tree}
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
          onConfirm={() => {}}
          onOpen={() => {}}
          onCopy={() => {}}
          onHistory={() => {}}
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
    expect(
      view.queryByRole('checkbox', { name: 'Amend previous commit' }),
      'амендить посреди слияния нельзя',
    ).toBeNull();
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
    expect(
      queryByRole('checkbox', { name: 'Amend previous commit' }),
      'git commit --amend при MERGE_HEAD отказывает',
    ).toBeNull();
  });
});
