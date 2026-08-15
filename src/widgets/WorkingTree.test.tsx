import { beforeEach, describe, expect, it } from 'vitest';

beforeEach(() => localStorage.clear());
import { useState } from 'react';
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
import type { Operation, PathOperation, WorkingTreeView } from '@/types';
import type { Picked } from '@/entities/repo';
import { useKeyboard } from '@/features/keyboard';

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
  onRun: (operation: PathOperation) => Promise<WorkingTreeView | null> | void;
  description: string;
  amend: boolean;
  onAmend: (next: boolean) => void;
  onMessage: (text: string) => void;
  onDescription: (text: string) => void;
  previous: { subject: string; body: string } | null;
  picked: Picked | null;
  diffOpen: boolean;
  onPick: (picked: Picked | null) => void;
  onOpen: (path: string, status: string, staged: boolean) => void;
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
        picked={extra.picked ?? null}
        diffOpen={extra.diffOpen ?? false}
        onPick={extra.onPick ?? (() => {})}
        onMessage={extra.onMessage ?? (() => {})}
        onDescription={extra.onDescription ?? (() => {})}
        onAmend={extra.onAmend ?? (() => {})}
        onCommit={onCommit}
        onRun={(operation) => Promise.resolve(extra.onRun?.(operation) ?? null)}
        onOperation={() => {}}
        onConfirm={extra.onConfirm ?? (() => {})}
        onOpen={extra.onOpen ?? (() => {})}
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
      onRun: () => {
        ranStraightAway += 1;
      },
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

  it('вид «дерево» собирает файлы под каталог и держит его закрытым, пока не откроют', () => {
    const { getByRole, queryByText } = draw(treeWith(2), '', () => {});

    expect(queryByText('src'), 'в плоском виде каталог отдельной строкой не стоит').toBeNull();

    fireEvent.click(getByRole('radio', { name: /tree/i }));

    expect(queryByText('src'), 'в дереве каталог становится строкой').toBeTruthy();
    expect(
      queryByText('file-0.ts'),
      'закрытый каталог не вываливает содержимое: сотня файлов не должна распахиваться сама',
    ).toBeNull();

    fireEvent.click(getByRole('button', { name: /expand all/i }));

    expect(
      queryByText('file-0.ts'),
      'открытый каталог показывает файл без пути в имени',
    ).toBeTruthy();
  });

  it('щелчок по каталогу открывает и снова закрывает его', () => {
    const { getByRole, getByText, queryByText } = draw(treeWith(2), '', () => {});

    fireEvent.click(getByRole('radio', { name: /tree/i }));
    fireEvent.click(getByText('src'));

    expect(queryByText('file-0.ts'), 'первый щелчок открывает').toBeTruthy();

    fireEvent.click(getByText('src'));

    expect(queryByText('file-0.ts'), 'второй закрывает').toBeNull();
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
          picked={null}
          diffOpen={false}
          onPick={() => {}}
          onMessage={() => {}}
          onDescription={() => {}}
          onAmend={() => {}}
          onCommit={over.onCommit ?? (() => {})}
          onRun={(operation) => Promise.resolve(over.onRun?.(operation) ?? null)}
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
    expect(
      view.queryByText(/conflicted files/i),
      'конфликтов нет — конфликтной панели нет',
    ).toBeNull();
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

const unstagedTree = (paths: string[]): WorkingTreeView => ({
  ...treeWith(0),
  unstaged: paths.length,
  entries: paths.map((path) => ({ staged: false, letter: 'M', path, oldPath: null })),
});

const gitThatMoves =
  (tree: WorkingTreeView) =>
  (operation: PathOperation): Promise<WorkingTreeView | null> => {
    if (!('paths' in operation)) return Promise.resolve(tree);
    const staged = operation.kind === 'stage';
    return Promise.resolve({
      ...tree,
      entries: tree.entries.map((entry) =>
        operation.paths.includes(entry.path) ? { ...entry, staged } : entry,
      ),
    });
  };

function Keyboard({ children }: { children: React.ReactNode }) {
  useKeyboard('files');
  return <>{children}</>;
}

const drawWithKeys = (tree: WorkingTreeView, extra: Extra = {}) =>
  render(
    <TooltipProvider>
      <Keyboard>
        <WorkingTree
          repo="/repo"
          tree={tree}
          message=""
          description=""
          amend={false}
          previous={null}
          picked={extra.picked ?? null}
          diffOpen={extra.diffOpen ?? false}
          onPick={extra.onPick ?? (() => {})}
          onMessage={() => {}}
          onDescription={() => {}}
          onAmend={() => {}}
          onCommit={() => {}}
          onRun={(operation) => Promise.resolve(extra.onRun?.(operation) ?? null)}
          onOperation={() => {}}
          onConfirm={() => {}}
          onOpen={extra.onOpen ?? (() => {})}
          onCopy={() => {}}
          onHistory={() => {}}
        />
      </Keyboard>
    </TooltipProvider>,
  );

const press = (key: string) => fireEvent.keyDown(window, { key });

describe('выбранный файл', () => {
  it('подсвечен, а не только обведён при наведении', () => {
    drawWithKeys(unstagedTree(['a.ts', 'b.ts']), { picked: { path: 'b.ts', staged: false } });

    const rows = screen.getAllByRole('option');
    expect(
      rows.map((row) => row.getAttribute('aria-selected')),
      'выбран ровно один файл',
    ).toEqual(['false', 'true']);
  });

  it('стрелка вниз ведёт к следующему файлу', () => {
    const onPick = vi.fn();
    drawWithKeys(unstagedTree(['a.ts', 'b.ts', 'c.ts']), {
      picked: { path: 'a.ts', staged: false },
      onPick,
    });

    press('ArrowDown');
    expect(onPick, 'вниз — следующий по списку').toHaveBeenLastCalledWith({
      path: 'b.ts',
      staged: false,
    });
  });

  it('с последнего файла стрелка вниз уходит на первый', () => {
    const onPick = vi.fn();
    drawWithKeys(unstagedTree(['a.ts', 'b.ts']), {
      picked: { path: 'b.ts', staged: false },
      onPick,
    });

    press('ArrowDown');
    expect(onPick, 'список листается по кругу, а не упирается в край').toHaveBeenLastCalledWith({
      path: 'a.ts',
      staged: false,
    });
  });

  it('буква S стейджит выбранный файл, а выбор переставляется только после ответа git', async () => {
    const tree = unstagedTree(['a.ts', 'b.ts', 'c.ts']);
    const onRun = vi.fn(gitThatMoves(tree));
    const onPick = vi.fn();
    drawWithKeys(tree, { picked: { path: 'b.ts', staged: false }, onRun, onPick });

    press('s');

    expect(onRun, 'стейджится именно выбранный файл').toHaveBeenCalledWith({
      kind: 'stage',
      paths: ['b.ts'],
    });
    expect(
      onPick,
      'до ответа git выбор не трогается — иначе строка мигает дважды',
    ).not.toHaveBeenCalled();

    await vi.waitFor(() =>
      expect(
        onPick,
        'после ответа выбор едет на следующий файл секции: S жмут подряд',
      ).toHaveBeenLastCalledWith({
        path: 'c.ts',
        staged: false,
      }),
    );
  });

  it('при открытом диффе следующий файл ещё и открывается', async () => {
    const tree = unstagedTree(['a.ts', 'b.ts', 'c.ts']);
    const onOpen = vi.fn();
    drawWithKeys(tree, {
      picked: { path: 'b.ts', staged: false },
      diffOpen: true,
      onRun: gitThatMoves(tree),
      onOpen,
    });

    press('s');

    await vi.waitFor(() =>
      expect(onOpen, 'дифф показывает уже следующий файл').toHaveBeenLastCalledWith(
        'c.ts',
        'M',
        false,
      ),
    );
  });

  it('последний файл секции догоняет себя в соседней: выбор не пропадает', async () => {
    const tree = unstagedTree(['a.ts']);
    const onPick = vi.fn();
    drawWithKeys(tree, {
      picked: { path: 'a.ts', staged: false },
      onRun: gitThatMoves(tree),
      onPick,
    });

    press('s');

    await vi.waitFor(() => expect(onPick).toHaveBeenLastCalledWith({ path: 'a.ts', staged: true }));
  });

  it('если git ответил ошибкой, выбор остаётся где был', async () => {
    const onPick = vi.fn();
    drawWithKeys(unstagedTree(['a.ts', 'b.ts']), {
      picked: { path: 'a.ts', staged: false },
      onRun: () => Promise.resolve(null),
      onPick,
    });

    press('s');
    await Promise.resolve();

    expect(onPick, 'нет свежего дерева — нечего и переставлять').not.toHaveBeenCalled();
  });

  it('кнопка Stage в строке ведёт себя так же, как клавиша', async () => {
    const tree = unstagedTree(['a.ts', 'b.ts']);
    const onPick = vi.fn();
    drawWithKeys(tree, {
      picked: { path: 'a.ts', staged: false },
      onRun: gitThatMoves(tree),
      onPick,
    });

    fireEvent.click(screen.getAllByRole('button', { name: 'Stage file' })[0]);

    await vi.waitFor(() =>
      expect(onPick, 'мышь и клавиатура двигают выбор одинаково').toHaveBeenLastCalledWith({
        path: 'b.ts',
        staged: false,
      }),
    );
  });

  it('пока дифф закрыт, стрелка не открывает его сама', () => {
    const onOpen = vi.fn();
    drawWithKeys(unstagedTree(['a.ts', 'b.ts']), {
      picked: { path: 'a.ts', staged: false },
      onOpen,
    });

    press('ArrowDown');
    expect(onOpen, 'иначе стрелка по списку дёргала бы главный вид').not.toHaveBeenCalled();
  });

  it('при открытом диффе стрелка ведёт и его', () => {
    const onOpen = vi.fn();
    drawWithKeys(unstagedTree(['a.ts', 'b.ts']), {
      picked: { path: 'a.ts', staged: false },
      diffOpen: true,
      onOpen,
    });

    press('ArrowDown');
    expect(onOpen, 'дифф следует за выбором').toHaveBeenCalledWith('b.ts', 'M', false);
  });
});

describe('S подряд', () => {
  it('три нажатия стейджат три файла: выбор и дерево идут по кругу через ответ git', async () => {
    let tree = unstagedTree(['a.ts', 'b.ts', 'c.ts', 'd.ts']);
    let picked: Picked | null = { path: 'a.ts', staged: false };
    const staged: string[] = [];

    function Harness() {
      const [shownTree, setShownTree] = useState(tree);
      const [shownPick, setShownPick] = useState<Picked | null>(picked);
      return (
        <TooltipProvider>
          <Keyboard>
            <WorkingTree
              repo="/repo"
              tree={shownTree}
              message=""
              description=""
              amend={false}
              previous={null}
              picked={shownPick}
              diffOpen={false}
              onPick={(next) => {
                picked = next;
                setShownPick(next);
              }}
              onMessage={() => {}}
              onDescription={() => {}}
              onAmend={() => {}}
              onCommit={() => {}}
              onRun={(operation) => {
                if ('paths' in operation) staged.push(...operation.paths);
                return gitThatMoves(tree)(operation).then((fresh) => {
                  if (fresh) {
                    tree = fresh;
                    setShownTree(fresh);
                  }
                  return fresh;
                });
              }}
              onOperation={() => {}}
              onConfirm={() => {}}
              onOpen={() => {}}
              onCopy={() => {}}
              onHistory={() => {}}
            />
          </Keyboard>
        </TooltipProvider>
      );
    }
    render(<Harness />);

    press('s');
    await vi.waitFor(() => expect(picked).toEqual({ path: 'b.ts', staged: false }));
    press('s');
    await vi.waitFor(() => expect(picked).toEqual({ path: 'c.ts', staged: false }));
    press('s');
    await vi.waitFor(() => expect(picked).toEqual({ path: 'd.ts', staged: false }));

    expect(staged, 'каждое нажатие стейджит ровно тот файл, что выбран').toEqual(['a.ts', 'b.ts', 'c.ts']);
  });
});
