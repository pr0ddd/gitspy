# Единый источник состояния репо-операций — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Одна полоса работ на репозиторий: спиннеры, погашенные кнопки и тосты всех репо-мутаций питаются из одного стора вместо пяти независимых флагов.

**Architecture:** Vanilla-стор zustand в `entities/repo` (Map путь → работа), единственная обёртка `runRepoWork` в `features/repo`, через которую идут все мутации; виджеты подписываются хуком `useRepoWork(path)` вместо пропсов `busy`/`running`/`checkingOut`. Спека: `docs/superpowers/specs/2026-08-06-repo-work-store-design.md`.

**Tech Stack:** zustand (новая зависимость, `createStore` из `zustand/vanilla` + `useStore` из `zustand`), vitest, testing-library.

## Global Constraints

- Комментариев в коде нет — ни `//`, ни `/* */`; «почему» живёт в именах, тестах и коммитах.
- Идентификаторы английские, проза тестов (describe/it) русская.
- Коммиты целиком по-английски, **без трейлеров** (никаких Co-Authored-By).
- Строк для пользователя в коде нет; новые тосты не нужны — используются существующие `notifyError`/`notifyOperation`/`notifyOperationFailed` из `@/toast`.
- `invoke` — только в `src/ipc.ts`; компоненты зовут функции оттуда.
- Импорты FSD строго вниз: widgets → features → entities; между слайсами — через фасад `index.ts`.
- Прогон тестов: `npx vitest run` (все) или `npx vitest run <файл>`; полная сборка `npm run build`.

## Отклонение от спеки, принятое здесь

Спека говорит «обёртка запускает перечитывание». Перечитывание (`reload`) привязано к `useRepoLoading` в App и различается по вызывающим (commit дополнительно принимает дерево, pull checkout зовёт `onCheckedOut`), поэтому обёртка владеет полосой и **тостом об ошибке**, а перечитывание остаётся внутри `perform` каждого вызывающего. Успешный тост есть только у операций из списка `Operation` — он остаётся в `useOperations`. Итог по спеке держится: тосты репо-мутаций зовут только `features/repo`, компоненты — никогда.

---

### Task 1: Стор полосы работ

**Files:**
- Create: `src/entities/repo/work.ts`
- Test: `src/entities/repo/work.test.ts`
- Modify: `src/entities/repo/index.ts` (добавить `export * from './work';`)
- Modify: `package.json` (зависимость zustand)

**Interfaces:**
- Produces: `type RepoWork = { kind: string; target?: string }`; `workStore` (zustand vanilla store со состоянием `{ works: ReadonlyMap<string, RepoWork> }`); `beginWork(path: string, work: RepoWork): boolean`; `endWork(path: string): void`.

- [ ] **Step 1: Установить zustand**

Run: `npm i zustand`

- [ ] **Step 2: Написать падающий тест**

`src/entities/repo/work.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { beginWork, endWork, workStore } from './work';

beforeEach(() => workStore.setState({ works: new Map() }));

describe('полоса работ репозитория', () => {
  it('работы в разных репозиториях не мешают друг другу', () => {
    expect(beginWork('/a', { kind: 'push' })).toBe(true);
    expect(beginWork('/b', { kind: 'pull' })).toBe(true);
    expect(workStore.getState().works.get('/a')).toEqual({ kind: 'push' });
    expect(workStore.getState().works.get('/b')).toEqual({ kind: 'pull' });
  });

  it('двойной старт в одном репозитории отвергается и не затирает текущую работу', () => {
    beginWork('/a', { kind: 'push' });
    expect(beginWork('/a', { kind: 'pull' })).toBe(false);
    expect(workStore.getState().works.get('/a')).toEqual({ kind: 'push' });
  });

  it('после завершения полоса свободна для следующей работы', () => {
    beginWork('/a', { kind: 'push' });
    endWork('/a');
    expect(beginWork('/a', { kind: 'pull' })).toBe(true);
  });
});
```

- [ ] **Step 3: Убедиться, что тест падает**

Run: `npx vitest run src/entities/repo/work.test.ts`
Expected: FAIL — модуль `./work` не существует.

- [ ] **Step 4: Реализация**

`src/entities/repo/work.ts`:

```ts
import { createStore } from 'zustand/vanilla';

export type RepoWork = { kind: string; target?: string };

type WorkState = { works: ReadonlyMap<string, RepoWork> };

export const workStore = createStore<WorkState>(() => ({ works: new Map() }));

export const beginWork = (path: string, work: RepoWork): boolean => {
  const { works } = workStore.getState();
  if (works.has(path)) return false;
  const next = new Map(works);
  next.set(path, work);
  workStore.setState({ works: next });
  return true;
};

export const endWork = (path: string): void => {
  const works = new Map(workStore.getState().works);
  works.delete(path);
  workStore.setState({ works });
};
```

В `src/entities/repo/index.ts` добавить строку `export * from './work';`.

- [ ] **Step 5: Убедиться, что тесты зелёные**

Run: `npx vitest run src/entities/repo/work.test.ts`
Expected: PASS, 3 теста.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/entities/repo/work.ts src/entities/repo/work.test.ts src/entities/repo/index.ts
git commit -m "Repo work lane: one store keyed by path"
```

---

### Task 2: Обёртка runRepoWork и хук useRepoWork

**Files:**
- Create: `src/features/repo/repoWork.ts`
- Test: `src/features/repo/repoWork.test.ts`
- Modify: `src/features/repo/index.ts` (добавить `export * from './repoWork';`)

**Interfaces:**
- Consumes: `beginWork`, `endWork`, `workStore`, `RepoWork` из `@/entities/repo`; `notifyError` из `@/toast`.
- Produces: `runRepoWork(path: string, work: RepoWork, perform: () => Promise<void>): Promise<boolean>` — `true`, если работа выполнилась без ошибки; `false`, если полоса занята или работа упала (ошибка ушла в `notifyError`). `useRepoWork(path: string | null): RepoWork | null` — React-хук с селектором по пути.

- [ ] **Step 1: Написать падающий тест**

`src/features/repo/repoWork.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/toast', () => ({ notifyError: vi.fn() }));

import { notifyError } from '@/toast';
import { workStore } from '@/entities/repo';
import { runRepoWork } from './repoWork';

beforeEach(() => {
  workStore.setState({ works: new Map() });
  vi.mocked(notifyError).mockClear();
});

describe('обёртка работ репозитория', () => {
  it('на время работы полоса занята, после — свободна', async () => {
    let during = false;
    const ok = await runRepoWork('/a', { kind: 'push' }, async () => {
      during = workStore.getState().works.has('/a');
    });
    expect(ok).toBe(true);
    expect(during).toBe(true);
    expect(workStore.getState().works.has('/a')).toBe(false);
  });

  it('повторный старт по занятому пути не выполняет работу', async () => {
    void runRepoWork('/a', { kind: 'push' }, () => new Promise(() => {}));
    const performed = vi.fn(async () => {});
    expect(await runRepoWork('/a', { kind: 'pull' }, performed)).toBe(false);
    expect(performed).not.toHaveBeenCalled();
  });

  it('ошибка работы уходит в тост и освобождает полосу', async () => {
    const ok = await runRepoWork('/a', { kind: 'push' }, async () => {
      throw new Error('boom');
    });
    expect(ok).toBe(false);
    expect(notifyError).toHaveBeenCalledOnce();
    expect(workStore.getState().works.has('/a')).toBe(false);
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `npx vitest run src/features/repo/repoWork.test.ts`
Expected: FAIL — модуль `./repoWork` не существует.

- [ ] **Step 3: Реализация**

`src/features/repo/repoWork.ts`:

```ts
import { useStore } from 'zustand';
import { beginWork, endWork, workStore, type RepoWork } from '@/entities/repo';
import { notifyError } from '@/toast';

export async function runRepoWork(
  path: string,
  work: RepoWork,
  perform: () => Promise<void>,
): Promise<boolean> {
  if (!beginWork(path, work)) return false;
  try {
    await perform();
    return true;
  } catch (e) {
    notifyError(e);
    return false;
  } finally {
    endWork(path);
  }
}

export const useRepoWork = (path: string | null): RepoWork | null =>
  useStore(workStore, (s) => (path === null ? null : (s.works.get(path) ?? null)));
```

В `src/features/repo/index.ts` добавить строку `export * from './repoWork';`.

- [ ] **Step 4: Убедиться, что тесты зелёные**

Run: `npx vitest run src/features/repo/repoWork.test.ts`
Expected: PASS, 3 теста.

- [ ] **Step 5: Commit**

```bash
git add src/features/repo/repoWork.ts src/features/repo/repoWork.test.ts src/features/repo/index.ts
git commit -m "runRepoWork: single wrapper owning the lane and failure toast"
```

---

### Task 3: Операции и коммит переезжают на полосу

**Files:**
- Modify: `src/features/repo/repoActions.ts` (переписать `useOperations`)
- Modify: `src/features/repo/commitMessage.ts` (убрать `busyWhile` из `Wiring`, `commit` через `runRepoWork`)
- Modify: `src/app/App.tsx:197-212` (новая форма `useOperations`, производные `busy`/`checkingOut` из `useRepoWork`)

**Interfaces:**
- Consumes: `runRepoWork`, `useRepoWork` из Task 2.
- Produces: `useOperations(active: string | null, reload: (path: string) => Promise<void>)` теперь возвращает только `{ runOperation, checkoutRef }` (без `running`/`busy`/`checkingOut`/`busyWhile`). `useCommitDraft` теряет параметр `busyWhile`.

- [ ] **Step 1: Переписать useOperations**

В `src/features/repo/repoActions.ts` удалить `useState`, `busyWhile` и вернуть:

```ts
import { useCallback } from 'react';
import * as ipc from '@/ipc';
import {
  notifyCopied,
  notifyError,
  notifyOperation,
  notifyOperationFailed,
} from '@/toast';
import { runRepoWork } from './repoWork';
import type { Operation, RefView } from '@/types';

export function useOperations(active: string | null, reload: (path: string) => Promise<void>) {
  const runOperation = useCallback(
    (operation: Operation) => {
      if (!active) return;
      void runRepoWork(active, { kind: operation.kind }, async () => {
        try {
          await ipc.runOperation(active, operation, () => {});
        } catch (e) {
          notifyOperationFailed(operation, e);
          return;
        }
        notifyOperation(operation);
        void ipc.resolveAvatars(active).catch(() => undefined);
        await reload(active).catch(notifyError);
      });
    },
    [active, reload],
  );

  const checkoutRef = useCallback(
    (ref: RefView) => {
      if (!active) return;
      void runRepoWork(active, { kind: 'checkout', target: ref.name }, () =>
        ipc.checkoutRef(active, ref.name, ref.kind).then(() => reload(active)),
      );
    },
    [active, reload],
  );

  return { runOperation, checkoutRef };
}
```

`copyText` и `openExternalUrl` в файле не трогать. Обратить внимание: у `checkoutRef` пропадает собственный `.catch(notifyError)` — ошибку теперь показывает обёртка.

- [ ] **Step 2: Переписать commit в useCommitDraft**

В `src/features/repo/commitMessage.ts`: из типа `Wiring` удалить поле `busyWhile`, добавить импорт `runRepoWork` из `./repoWork`, убрать импорт `notifyError`, а `commit` заменить на:

```ts
const commit = useCallback(() => {
  if (!active || !message.trim()) return;
  void runRepoWork(active, { kind: 'commit' }, () =>
    ipc.commit(active, composeCommitMessage(message, description), amend).then((updated) => {
      adoptTree(updated);
      setMessage('');
      setDescription('');
      setAmend(false);
      return reload(active);
    }),
  ).then((committed) => {
    if (committed) onCommitted?.();
  });
}, [active, message, description, amend, reload, adoptTree, onCommitted]);
```

Смысловая тонкость, ради которой `runRepoWork` возвращает boolean: `onCommitted` зовёт автопуш (`runOperation({ kind: 'push' })`), и он обязан стартовать **после освобождения полосы коммита**, иначе `beginWork` его отвергнет. Поэтому `onCommitted` вызывается снаружи `perform`, по исходу.

- [ ] **Step 3: Перепаять App**

В `src/app/App.tsx`:

```ts
const { runOperation, checkoutRef } = useOperations(active, reload);
const work = useRepoWork(active);
const busy = work !== null;
const checkingOut = work?.kind === 'checkout' ? (work.target ?? null) : null;
```

Импортировать `useRepoWork` из `@/features/repo`. В вызове `useCommitDraft` удалить строку `busyWhile,`. В JSX заменить `running={running?.kind ?? null}` на `running={work?.kind ?? null}` (Toolbar) и `committing={running?.kind === 'commit'}` на `committing={work?.kind === 'commit'}` (WorkingTree). Остальные пропсы (`busy`, `checkingOut`) пока остаются — их снимут задачи 4–6.

- [ ] **Step 4: Полный прогон**

Run: `npx vitest run && npm run build`
Expected: все тесты зелёные, сборка проходит.

- [ ] **Step 5: Commit**

```bash
git add src/features/repo/repoActions.ts src/features/repo/commitMessage.ts src/app/App.tsx
git commit -m "Operations, checkout and commit run on the per-repo lane

busy is now derived per repository path, so a push in one tab no
longer disables buttons in another. Auto-push after commit starts
only after the commit releases the lane."
```

---

### Task 4: Toolbar и Sidebar подписываются сами

**Files:**
- Modify: `src/widgets/Toolbar.tsx` (проп `repo: string` вместо `busy`/`running`)
- Modify: `src/widgets/Sidebar.tsx` (убрать проп `checkingOut`)
- Modify: `src/app/App.tsx` (снять пропсы, передать `repo`)
- Test: `src/widgets/Sidebar.test.tsx` (убрать `checkingOut={null}`)

**Interfaces:**
- Consumes: `useRepoWork` из `@/features/repo`.
- Produces: `Toolbar` принимает `repo: string` и не принимает `busy`/`running`; `Sidebar` не принимает `checkingOut`.

- [ ] **Step 1: Toolbar**

В типе Props (`src/widgets/Toolbar.tsx:29-30`) заменить `busy: boolean; running: string | null;` на `repo: string;`. В начале компонента:

```ts
const work = useRepoWork(repo);
const busy = work !== null;
const running = work?.kind ?? null;
```

Внутренние использования `busy`/`running` (строки ~80–159) не меняются.

- [ ] **Step 2: Sidebar**

В `src/widgets/Sidebar.tsx` удалить `checkingOut` из Props верхнего компонента (строка 25) и из деструктуризации (строка 251); в начале компонента вычислить:

```ts
const work = useRepoWork(session.path);
const checkingOut = work?.kind === 'checkout' ? (work.target ?? null) : null;
```

Внутренний проброс `checkingOut` в дочерние части файла (строки 80–102, 396) оставить как есть.

- [ ] **Step 3: App и тест Sidebar**

В `App.tsx`: у `<Toolbar>` удалить `busy={busy}` и `running={work?.kind ?? null}`, добавить `repo={current.path}`; у `<Sidebar>` удалить `checkingOut={checkingOut}`. Локальную переменную `checkingOut` в App удалить — потребителей не осталось. В `src/widgets/Sidebar.test.tsx` удалить обе строки `checkingOut={null}` (74, 140).

- [ ] **Step 4: Прогон**

Run: `npx vitest run && npm run build`
Expected: зелёно; в `GraphView.test.tsx` тест «ни одного React-рендера при прокрутке» остался зелёным.

- [ ] **Step 5: Commit**

```bash
git add src/widgets/Toolbar.tsx src/widgets/Sidebar.tsx src/widgets/Sidebar.test.tsx src/app/App.tsx
git commit -m "Toolbar and Sidebar read the work lane themselves"
```

---

### Task 5: WorkingTree подписывается сам

**Files:**
- Modify: `src/widgets/WorkingTree.tsx` (убрать пропсы `busy`, `committing`)
- Modify: `src/app/App.tsx` (снять пропсы)
- Test: `src/widgets/WorkingTree.test.tsx` (убрать `busy={false}`/`committing={false}` в обоих местах: строки 60–61, 274–275)

**Interfaces:**
- Consumes: `useRepoWork` из `@/features/repo`; проп `repo: string` у WorkingTree уже есть.
- Produces: `WorkingTree` не принимает `busy` и `committing`.

- [ ] **Step 1: WorkingTree**

Удалить `busy` и `committing` из Props экспортируемого компонента и вычислить в его начале:

```ts
const work = useRepoWork(repo);
const busy = work !== null;
const committing = work?.kind === 'commit';
```

Внутренние подкомпоненты файла, принимающие `busy` пропсом (строки ~218–245, 419–530), не трогать — они получают значение из этих переменных, как и раньше.

- [ ] **Step 2: App и тест**

В `App.tsx` у `<WorkingTree>` удалить `busy={busy}` и `committing={work?.kind === 'commit'}`. В `WorkingTree.test.tsx` удалить четыре строки пропсов.

- [ ] **Step 3: Прогон**

Run: `npx vitest run src/widgets/WorkingTree.test.tsx && npx vitest run && npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/widgets/WorkingTree.tsx src/widgets/WorkingTree.test.tsx src/app/App.tsx
git commit -m "WorkingTree reads the work lane itself"
```

---

### Task 6: Checkout пулл-реквеста через полосу

**Files:**
- Modify: `src/widgets/PullPanel.tsx` (убрать проп `busy` и стейт `switching`)
- Modify: `src/app/App.tsx` (снять проп `busy` у PullPanel)

**Interfaces:**
- Consumes: `runRepoWork`, `useRepoWork` из `@/features/repo`.
- Produces: `PullPanel` не принимает `busy`.

- [ ] **Step 1: PullPanel**

В `src/widgets/PullPanel.tsx`: удалить `busy` из Props и деструктуризации, удалить `const [switching, setSwitching] = useState(false);`, импортировать `runRepoWork, useRepoWork` из `@/features/repo` и заменить `checkout`:

```ts
const work = useRepoWork(repo);

const checkout = () => {
  void runRepoWork(repo, { kind: 'checkout', target: pull.headBranch }, () =>
    ipc.checkoutPull(repo, pull.number, pull.headBranch, pull.fromFork).then(onCheckedOut),
  );
};
```

Кнопке — `disabled={work !== null}` вместо `disabled={busy || switching}`. Импорт `notifyError` удалить, если других использований в файле не осталось. Побочный выигрыш, его стоит проверить руками: у ветки `pull.headBranch` в сайдбаре на время checkout появляется тот же спиннер, что и у обычного checkout — маркер общий.

- [ ] **Step 2: App**

Удалить `busy={busy}` у `<PullPanel>`. Если после этого переменная `busy` в App не используется — удалить и её вместе с `const work = useRepoWork(active)`, если потребителей не осталось (после задач 4–5 `work` ещё нужен только для `busy`; проверить фактических потребителей на момент правки).

- [ ] **Step 3: Прогон**

Run: `npx vitest run && npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/widgets/PullPanel.tsx src/app/App.tsx
git commit -m "Pull checkout runs on the work lane with the shared checkout marker"
```

---

### Task 7: Сохранение конфликтов занимает полосу

**Files:**
- Modify: `src/widgets/ConflictView.tsx` (убрать `saving`, сохранять через `runRepoWork`)
- Test: Create `src/widgets/ConflictView.test.tsx`

**Interfaces:**
- Consumes: `runRepoWork`, `useRepoWork` из `@/features/repo`; `ConflictFileView = { base, ours, theirs, merged }` из `@/types`.

- [ ] **Step 1: Написать падающий тест**

Это тест на настоящий дефект: сегодня во время сохранения конфликта полоса репозитория свободна и любая операция может стартовать поверх записи в рабочее дерево. `src/widgets/ConflictView.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/ipc', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  conflictFile: vi.fn(() =>
    Promise.resolve({ base: '', ours: 'a', theirs: 'b', merged: 'a' }),
  ),
  resolveConflict: vi.fn(() => new Promise(() => {})),
}));

import '../i18n';
import { TooltipProvider } from '@/components/ui/tooltip';
import { workStore } from '@/entities/repo';
import { ConflictView } from './ConflictView';

describe('сохранение конфликта', () => {
  it('пока сохранение идёт, полоса репозитория занята', async () => {
    render(
      <TooltipProvider>
        <ConflictView
          repo="/r"
          path="a.txt"
          from="feature"
          into="main"
          onClose={() => {}}
          onResolved={() => {}}
        />
      </TooltipProvider>,
    );
    const save = await screen.findByRole('button', { name: 'Mark resolved' });
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);
    await waitFor(() =>
      expect(
        workStore.getState().works.get('/r'),
        'запись в рабочее дерево обязана занимать полосу репозитория',
      ).toEqual({ kind: 'resolveConflict', target: 'a.txt' }),
    );
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает по причине дефекта**

Run: `npx vitest run src/widgets/ConflictView.test.tsx`
Expected: FAIL — полоса `/r` пуста, `toEqual` не сходится. Именно эта причина, не ошибка рендера; если падает рендер — сначала чинить тест.

- [ ] **Step 3: Реализация**

В `src/widgets/ConflictView.tsx`: удалить `const [saving, setSaving] = useState(false);`, импортировать `runRepoWork, useRepoWork` из `@/features/repo`, заменить `save` (строки 228–235):

```ts
const work = useRepoWork(repo);

const save = () => {
  void runRepoWork(repo, { kind: 'resolveConflict', target: path }, () =>
    ipc.resolveConflict(repo, path, composeOutput(blocks, picks)).then(onResolved),
  );
};
```

Кнопке (строка 252) — `disabled={!file || work !== null}`. Импорт `notifyError` удалить, если других использований не осталось (загрузка `conflictFile` на строке 182 его использует — тогда оставить).

- [ ] **Step 4: Убедиться, что тест зелёный, прогнать всё**

Run: `npx vitest run src/widgets/ConflictView.test.tsx && npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/widgets/ConflictView.tsx src/widgets/ConflictView.test.tsx
git commit -m "Conflict save occupies the repo work lane

Saving a resolution writes to the working tree, but the repo stayed
idle for the rest of the UI: any operation could start on top of the
write. Guarded by a test that fails without the fix."
```

---

### Task 8: Финальная зачистка

**Files:**
- Modify: `src/app/App.tsx` (если остались мёртвые производные)

**Interfaces:** нет новых.

- [ ] **Step 1: Проверить, что старых источников не осталось**

Run: `rg -n "busyWhile|setSaving|setSwitching" src` — пусто. `rg -n "busy=\{|checkingOut=\{|committing=\{|running=\{" src/app src/widgets` — совпадений в JSX не осталось (внутренние пропсы подкомпонентов WorkingTree/Sidebar, получающие значение из стора через корневой компонент файла, — не в счёт; наружная граница виджетов чистая).

- [ ] **Step 2: Полная проверка**

Run: `npx vitest run && npm run build`
Expected: всё зелёное, включая тест «ни одного React-рендера при прокрутке» в `GraphView.test.tsx`.

- [ ] **Step 3: Прогнать приложение руками**

Run: `npm run app` — открыть два репозитория, запустить fetch в одном и убедиться, что кнопки второго живые; сделать checkout из сайдбара и увидеть спиннер у ветки.

- [ ] **Step 4: Commit (если были правки зачистки)**

```bash
git add -A src
git commit -m "Drop dead busy plumbing after the lane migration"
```
