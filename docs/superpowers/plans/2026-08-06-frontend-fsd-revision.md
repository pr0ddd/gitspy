# Ревизия фронтенда: словарь, FSD, линт — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Словарь частей вместо рукописных стилей, слои FSD с App-композицией ≤300 строк, ESLint с направлением импортов, стражи против рецидива — без старых концов.

**Architecture:** Сначала словарь (Tab, NavItem, ListRow tall, Button field) и перевод шести файлов на него; затем разбор App.tsx на хуки/виджеты и послойный `git mv` в `entities/features/widgets/app` (фундамент остаётся в корне src); затем flat-ESLint с двумя своими правилами; затем стражи стилей в boundary:check. Каждый шаг — зелёные tsc + vitest + boundary:check.

**Tech Stack:** React 19, Tailwind токены, cva, vitest, ESLint 9 flat + typescript-eslint + react-hooks, свои правила CommonJS в `eslint-rules/`.

## Global Constraints

- Комментариев в коде нет (никаких `//`, `///`, `/* */`); в `eslint-rules/*.js` — можно (мета-код, как в quesk).
- Проза тестов и assert — русская; идентификаторы английские; коммиты английские без трейлеров.
- Никаких массовых правок регулярками по исходникам: переносы — `git mv`, импорты правятся по списку ошибок tsc.
- Частные значения классов запрещены; только токены и словарь.
- Поведение бит-в-бит: существующие тесты меняют только пути импорта.
- После каждой задачи: `npx tsc --noEmit && npx vitest run && npm run boundary:check` зелёные, коммит.

---

### Task 1: Button variant `field` и часть `Tab`; RepoTabs на них

**Files:**
- Modify: `src/components/ui/button.tsx` (вариант), `src/shell/parts.tsx` (Tab), `src/shell/RepoTabs.tsx`, `src/shell/Sidebar.tsx` (кнопка collapse на `field`)
- Test: `src/shell/parts.test.tsx` (создать)

**Interfaces:**
- Produces: `Tab({icon, label, current, title?, closeLabel, onSelect, onClose})`; Button `variant="field"`.

- [ ] **Step 1: Падающий тест**

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Tab } from './parts';

describe('таб верхней полосы', () => {
  it('клик по табу выбирает его, крестик закрывает и не выбирает', () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(
      <Tab icon="folder" label="react" current={false} closeLabel="Close"
        onSelect={onSelect} onClose={onClose} />,
    );
    fireEvent.click(screen.getByText('react'));
    expect(onSelect).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onSelect, 'крестик не должен заодно активировать таб').toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2:** `npx vitest run src/shell/parts.test.tsx` → FAIL (нет Tab).

- [ ] **Step 3: Реализация**

В `button.tsx` variants: `field: 'bg-fill-1 hover:bg-fill-2 text-faint hover:text-foreground'`.

В `parts.tsx` (импорт `Button` из ui, `Icon, type IconName` из icons):

```tsx
type TabProps = {
  icon: IconName;
  label: string;
  current: boolean;
  title?: string;
  closeLabel: string;
  onSelect: () => void;
  onClose: () => void;
};

export function Tab({ icon, label, current, title, closeLabel, onSelect, onClose }: TabProps) {
  const Glyph = Icon[icon];
  return (
    <div
      title={title}
      onClick={onSelect}
      className={cn(
        'group flex h-7.5 max-w-56 cursor-pointer items-center gap-2 rounded-md pr-1.5 pl-3 text-xs whitespace-nowrap transition-colors',
        current ? 'bg-fill-2 text-foreground' : 'text-muted-foreground hover:bg-fill-1',
      )}
    >
      <Glyph className={cn('size-3.5 shrink-0', !current && 'opacity-75')} />
      <span className="min-w-0 truncate">{label}</span>
      <Button
        variant="muted"
        size="icon-2xs"
        reveal
        className={cn(current && 'opacity-100')}
        aria-label={closeLabel}
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      >
        <Icon.close />
      </Button>
    </div>
  );
}
```

RepoTabs: оба таба (репозитории и настройки) собираются из `Tab` (host-иконка через `hostOf`, у настроек `icon="settings"`); рукописная разметка удаляется. Sidebar: кнопка сворачивания — `<Button variant="field" size="icon-sm" aria-label=…>` вместо классов.

- [ ] **Step 4:** `npx vitest run && npx tsc --noEmit` → PASS.
- [ ] **Step 5:** `git add -A && git commit -m "Tab joins the vocabulary; both tab kinds build from it"`

---

### Task 2: Часть `NavItem`; рейл, Settings-секции и StartPage-источники на ней

**Files:**
- Modify: `src/shell/parts.tsx`, `src/shell/Sidebar.tsx` (рейл), `src/shell/Settings.tsx` (секции), `src/shell/StartPage.tsx` (SourceRow)
- Test: `src/shell/parts.test.tsx`

**Interfaces:**
- Produces: `NavItem({icon, label?, active?, hint?, hintSide?, end?, onClick})` — без label квадрат `size-8` (рейл), с label строка `h-8 w-full` (секции), `end` — хвост строки (счётчик источника).

- [ ] **Step 1: Падающий тест**

```tsx
describe('кнопка навигации', () => {
  it('активная несёт заливку, покойная — нет', () => {
    const { rerender } = render(<NavItem icon="branch" label="Local" onClick={() => {}} />);
    const idle = screen.getByRole('button', { name: 'Local' });
    expect(idle.className).not.toContain('bg-fill-2');
    rerender(<NavItem icon="branch" label="Local" active onClick={() => {}} />);
    expect(screen.getByRole('button', { name: 'Local' }).className).toContain('bg-fill-2');
  });
});
```

- [ ] **Step 2:** FAIL. **Step 3: Реализация**

```tsx
type NavItemProps = {
  icon: IconName;
  label?: string;
  active?: boolean;
  hint?: string;
  hintSide?: React.ComponentProps<typeof Hint>['side'];
  end?: React.ReactNode;
  onClick: () => void;
};

export function NavItem({ icon, label, active, hint, hintSide, end, onClick }: NavItemProps) {
  const Glyph = Icon[icon];
  const button = (
    <button
      aria-label={label ?? hint}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'flex shrink-0 items-center rounded-md transition-colors',
        label ? 'h-8 w-full gap-2.5 px-2 text-sm' : 'size-8 justify-center',
        active
          ? 'bg-fill-2 text-foreground'
          : 'text-muted-foreground hover:bg-fill-1 hover:text-foreground',
      )}
    >
      <Glyph className="size-4 opacity-75" />
      {label ? <span className="min-w-0 flex-1 truncate text-left">{label}</span> : null}
      {end}
    </button>
  );
  return hint ? <Hint text={hint} side={hintSide}>{button}</Hint> : button;
}
```

Рейл Sidebar: expand-кнопка и 5 видов — `NavItem` без label с `hint`/`hintSide="right"`. Settings-секции — `NavItem` с label. StartPage `SourceRow` — `NavItem` с label и `end` (badge+счётчик); высота источника h-9→h-8 допускается (унификация словаря).

- [ ] **Step 4:** vitest+tsc PASS. **Step 5:** commit `"NavItem joins the vocabulary; rail, settings and sources build from it"`

---

### Task 3: `ListRow` tall; FileHistoryView на нём; Boundary на Button

**Files:**
- Modify: `src/shell/parts.tsx` (проп `tall`), `src/shell/FileHistoryView.tsx`, `src/shell/Boundary.tsx`
- Test: `src/shell/parts.test.tsx`

- [ ] **Step 1: Тест** — `ListRow tall` даёт `h-11`, обычный — `h-8`:

```tsx
describe('высокая строка списка', () => {
  it('tall двухстрочная, обычная нет', () => {
    const { rerender } = render(<ListRow onClick={() => {}}>x</ListRow>);
    expect(screen.getByRole('button').className).toContain('h-8');
    rerender(<ListRow tall onClick={() => {}}>x</ListRow>);
    expect(screen.getByRole('button').className).toContain('h-11');
  });
});
```

- [ ] **Step 2:** FAIL. **Step 3:** в ListRow: `tall?: boolean`, класс `tall ? 'h-11' : 'h-8'` вместо жёсткого `h-8`. FileHistoryView список коммитов — `ListRow tall` (аватар — gutter? нет: аватар в children, selected через `current`). Голый `<button>` в Boundary — `<Button variant="outline" size="sm">`.
- [ ] **Step 4:** PASS. **Step 5:** commit `"ListRow grows a tall variant; file history and boundary use the vocabulary"`

---

### Task 4: Settings по каркасу приложения

**Files:**
- Modify: `src/shell/Settings.tsx`, `src/App.tsx` (обёртка настроек: слева навигация вне карточки)
- Test: `src/shell/Settings.test.tsx` (обновить: секции — NavItem)

- [ ] **Step 1:** Settings рендерит: `<aside>` шириной как левый сайдбар (w-68/272px) на подложке с `NavItem`-секциями; облачко-карточка с `ViewBar`-шапкой (`Icon.settings` + Settings · <секция>), контент `SettingRow`-ами. Никаких границ/бордеров внутри aside.
- [ ] **Step 2:** тест: шапка ViewBar присутствует (`Settings`), переключение секции меняет и шапку.
- [ ] **Step 3:** vitest+tsc PASS. Скриншот-сверка глазами в dev.
- [ ] **Step 4:** commit `"Settings wears the app skeleton: nav rail outside, ViewBar over the sheet"`

---

### Task 5: Разбор App.tsx (все ещё старые пути)

**Files:**
- Create: `src/sessionActions.ts` (open/clone/recent/forget/create), `src/shell/DetailsPane.tsx` (aside+ResizeGrip+Details/WorkingTree switch), `src/shell/Workspace.tsx` (sidebar+card+main композиция репозитория)
- Modify: `src/updater.ts` (`useReadyUpdate`), `src/zoom.ts` (`useZoom` с хоткеями), `src/App.tsx`

**Interfaces:**
- Produces: `useReadyUpdate(): {ready: string|null, restart: () => void}`; `useZoom(): {zoom, setZoom}`; `Workspace` принимает session+обработчики; `DetailsPane` принимает panel-props.

- [ ] **Step 1:** Существующие тесты (BottomBar, GraphView no-rerender, Sidebar…) — сторожа поведения; новых тестов не требуется, но `App` после разбора обязан пройти их без правок.
- [ ] **Step 2:** Вынести хуки по одному, каждый раз vitest+tsc. Порядок: useReadyUpdate → useZoom → sessionActions → DetailsPane → Workspace.
- [ ] **Step 3:** `wc -l src/App.tsx` ≤ 300; в App остаются: sessions reducer, main-view роутинг, settings-таб, композиция.
- [ ] **Step 4:** commit по одному на вынос (5 коммитов), сообщение вида `"App sheds X into Y"`.

---

### Task 6: FSD-переезд

**Files:** послойные `git mv` + `index.ts` фасады; правки импортов по ошибкам tsc.

Манифест переезда (из спеки):

```
entities/graph/  <- scene.ts render.ts rows.ts chips.ts chipLayout.ts glyphs.ts columns.ts wip.ts view.ts refTree.ts (+их тесты)
entities/repo/   <- session.ts repoData.ts panel.ts
entities/diff/   <- diff.ts monaco.ts
features/search/ <- search.ts
features/updater/<- updater.ts
features/menus/  <- menuItems.ts nativeMenu.ts
features/fileTree/<- fileTree.ts
widgets/         <- shell/*.tsx (все, включая тесты)
app/             <- App.tsx main.tsx
src/parts.tsx    <- shell/parts.tsx
```

- [ ] **Step 1:** слой за слоем: `git mv` файлов слоя → `npx tsc --noEmit` → правка путей по списку ошибок → фасад `index.ts` слайса (реэкспорт публичного) → vitest+boundary PASS → commit `"FSD: <layer> moves into place"`. Пять коммитов (entities, features, widgets+parts, app, зачистка).
- [ ] **Step 2 (зачистка старых концов):** `rmdir src/shell`; grep по репо на `shell/` (docs, CLAUDE.md, vite.config, скрипты) — обновить; `vitest.config` include уже `src/**` — ок; CLAUDE.md раздел «Интерфейс» переписать: слои вместо `src/shell/`, правило словаря, правило направлений импорта.
- [ ] **Step 3:** commit `"FSD: no loose ends - docs and configs follow the layers"`.

---

### Task 7: ESLint flat + fsd-boundaries

**Files:**
- Create: `eslint.config.mjs`, `eslint-rules/fsd-boundaries.js`, `eslint-rules/fsd-boundaries.test.mjs`
- Modify: `package.json` (deps: eslint, @eslint/js, typescript-eslint, eslint-plugin-react-hooks; script `lint`; `build` += `npm run lint`)

Ранжирование в правиле: путь → ранг: фундамент (`components/ui`, `generated`, `locales`, любой файл прямо в `src/` кроме App) = 0, `entities/*` = 1, `features/*` = 2, `widgets/*` = 3, `app/*` = 4. Импорт разрешён строго вниз или внутри своего слайса. Сообщение называет оба слоя.

- [ ] **Step 1:** RuleTester-тест (запуск `node --test eslint-rules/fsd-boundaries.test.mjs`, вешается в `npm run lint` первым): валиден `widgets/X -> entities/graph`, невалиден `entities/graph -> widgets/X` и `features/a -> features/b` (вбок нельзя, только вниз).
- [ ] **Step 2:** FAIL → реализация по образцу quesk `fsd-boundaries.js` (упрощённая: одна ось, классификация путей выше) → PASS.
- [ ] **Step 3:** `npx eslint src` на живом коде → чинить находки (не отключать правила).
- [ ] **Step 4:** commit `"ESLint guards the FSD direction"`.

---

### Task 8: fsd-public-api

**Files:**
- Create: `eslint-rules/fsd-public-api.js` (+тест)

Между слайсами `entities/*|features/*` — импорт только корня слайса (`@/entities/graph`);深 путь (`@/entities/graph/scene`) — ошибка с автофиксом на корень; `import type` — свободен; внутри своего слайса — свободно.

- [ ] **Step 1:** RuleTester: валиден `widgets -> @/entities/graph`, невалиден `widgets -> @/entities/graph/scene`, валиден `import type {X} from '@/entities/graph/scene'`.
- [ ] **Step 2:** реализация (по образцу quesk, упрощённая: без family-вложенности). **Step 3:** прогон, починка живых нарушений. **Step 4:** commit `"ESLint guards slice facades"`.

---

### Task 9: Стражи стилей в boundary:check

**Files:**
- Modify: `scripts/check-boundary.mjs`

- [ ] **Step 1:** два прохода по `src/widgets/**/*.tsx`: `<button` → «собери из Button/ListRow/NavItem/Tab (src/parts.tsx)»; `hover:bg-fill-` → «стили наведения живут в словаре». Исключений нет: словарь и сплит-Pull/ViewSwitch к этому моменту либо в parts, либо без голых паттернов (сплит-Pull держит hover на span — перенести обёртку в parts как `SplitButton`? Нет: у span нет `<button`-нарушения, а `hover:bg-fill-1` на нём — перенести в cva-вариант `actionGroup` в button.tsx, чтобы страж прошёл честно).
- [ ] **Step 2:** самопроверка стража: временный файл с нарушением валит скрипт (руками, не коммитится).
- [ ] **Step 3:** `npm run build` целиком зелёный. commit `"boundary:check guards the vocabulary"`.

---

### Task 10: Финал

- [ ] `npm run build` (i18n, boundary+lint, tsc, vitest, vite) и `cargo test` зелёные.
- [ ] `git grep -n "shell/"` — ноль упоминаний вне истории.
- [ ] CLAUDE.md отражает слои и словарь.
- [ ] Пуш ветки. Тег не резать (правило релизов).
