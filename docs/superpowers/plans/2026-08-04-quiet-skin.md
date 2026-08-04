# Quiet Skin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Приложение выглядит как карточка «Gitspy — тихий»: заливки вместо рамок, три ступени текста, индиго только на активном, Geist, граф с подложкой дорожки и кольцом выделения.

**Architecture:** Токены сперва: `theme.css` — единственный источник значений, поэтому первый же коммит перекрашивает всё разом. Дальше словарь `parts.tsx` и варианты `cva`, затем точечные правки экранов, затем canvas-граф (`scene.ts` — геометрия, `render.ts` — краска, `theme.ts` — мост к токенам).

**Tech Stack:** Tailwind v4 (`@theme inline`), shadcn/cva, fontsource Geist, canvas 2D.

## Global Constraints

- Комментариев в коде нет — ни одного вида.
- Строк для пользователя в коде нет — только ключи i18n (новых строк в этой ветке не появляется).
- Произвольных значений в `className` нет (`p-[7px]` запрещён); всё из токенов темы. В Tailwind v4 числовая шкала спейсинга динамическая, `h-6.5` — легальна.
- Все значения живут в `src/theme.css`; canvas берёт цвета через `theme.ts` (`getComputedStyle`).
- `invoke` только в `src/ipc.ts` (эта ветка его не трогает).
- Rust не меняется ни в одном файле.
- Коммиты по-английски, без трейлеров.
- После каждой задачи `npm run test` зелёный; в конце — `npm run build` целиком.

---

### Task 1: Шрифты и токены

**Files:**
- Modify: `package.json` (зависимости)
- Modify: `src/index.css`
- Modify: `src/theme.css`

**Interfaces:**
- Produces: токены `--fill-1/2/3`, `--faint-foreground`, `--primary-hover`, `--ref-worktree`, `--bar-height`; классы `bg-fill-1/2/3`, `text-faint`, `h-bar`, `bg-primary-hover`. Все последующие задачи пишут только эти классы.

- [ ] **Step 1: Поставить Geist, убрать JetBrains Mono**

```bash
npm uninstall @fontsource-variable/jetbrains-mono
npm install @fontsource-variable/geist @fontsource-variable/geist-mono
```

- [ ] **Step 2: `src/index.css` — импорты шрифтов**

```css
@import '@fontsource-variable/geist';
@import '@fontsource-variable/geist-mono';
@import 'tailwindcss';
@import 'tw-animate-css';
@import './theme.css';
```

- [ ] **Step 3: `src/theme.css` — новые значения**

Блок `:root` заменяется целиком:

```css
:root {
  --radius: 0.4375rem;

  --fill-1: oklch(1 0 0 / 0.035);
  --fill-2: oklch(1 0 0 / 0.07);
  --fill-3: oklch(1 0 0 / 0.11);

  --background: oklch(0.147 0.004 265);
  --foreground: oklch(0.965 0.002 265);

  --card: oklch(0.172 0.004 265);
  --card-foreground: oklch(0.965 0.002 265);

  --popover: oklch(0.205 0.005 265);
  --popover-foreground: oklch(0.965 0.002 265);

  --primary: oklch(0.575 0.16 277);
  --primary-hover: oklch(0.64 0.16 277);
  --primary-foreground: oklch(0.99 0.002 277);

  --secondary: var(--fill-2);
  --secondary-foreground: oklch(0.965 0.002 265);

  --muted: var(--fill-1);
  --muted-foreground: oklch(0.735 0.008 265);
  --faint-foreground: oklch(0.575 0.01 265);

  --accent: var(--fill-2);
  --accent-foreground: oklch(0.965 0.002 265);

  --destructive: oklch(0.66 0.19 25);
  --destructive-foreground: oklch(0.99 0.002 25);

  --border: var(--fill-2);
  --input: var(--fill-2);
  --ring: oklch(0.64 0.16 277);

  --surface: oklch(0.147 0.004 265);
  --surface-raised: oklch(0.205 0.005 265);
  --surface-hover: var(--fill-2);

  --status-added: oklch(0.74 0.16 150);
  --status-deleted: oklch(0.66 0.19 25);
  --status-modified: oklch(0.79 0.14 82);
  --status-renamed: oklch(0.69 0.14 250);
  --status-conflict: oklch(0.68 0.15 52);
  --status-ahead: oklch(0.74 0.16 150);
  --status-behind: oklch(0.79 0.14 82);

  --ref-local: oklch(0.62 0.13 265);
  --ref-remote: oklch(0.575 0.01 265);
  --ref-tag: oklch(0.7 0.11 90);
  --ref-stash: oklch(0.6 0.12 320);
  --ref-worktree: oklch(0.72 0.14 195);

  --graph-1: oklch(0.66 0.17 268);
  --graph-2: oklch(0.64 0.19 325);
  --graph-3: oklch(0.72 0.14 195);
  --graph-4: oklch(0.76 0.15 92);
  --graph-5: oklch(0.7 0.16 20);
  --graph-6: oklch(0.72 0.15 150);
  --graph-7: oklch(0.68 0.14 220);
  --graph-8: oklch(0.75 0.15 55);
  --graph-9: oklch(0.66 0.16 300);
  --graph-10: oklch(0.74 0.14 120);
  --graph-11: oklch(0.68 0.17 350);
  --graph-12: oklch(0.64 0.15 245);

  --row-height: 28px;
  --row-height-graph: 36px;
  --bar-height: 52px;
}
```

В `@theme inline` добавляются строки (остальное не трогается):

```css
  --color-fill-1: var(--fill-1);
  --color-fill-2: var(--fill-2);
  --color-fill-3: var(--fill-3);
  --color-faint: var(--faint-foreground);
  --color-primary-hover: var(--primary-hover);
  --color-ref-worktree: var(--ref-worktree);
  --spacing-bar: var(--bar-height);
```

И заменяются шрифты:

```css
  --font-sans: 'Geist Variable', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
  --font-mono: 'Geist Mono Variable', ui-monospace, SFMono-Regular, Menlo, monospace;
```

- [ ] **Step 4: Проверить и закоммитить**

Run: `npm run test` — упавшие тесты чинятся только если падение от токенов (ожидаемых нет: тесты не читают значения цветов).
Commit: `Quiet tokens: fills, hairline border, three text tiers, Geist`

---

### Task 2: Словарь parts.tsx и варианты cva

**Files:**
- Modify: `src/shell/parts.tsx`
- Modify: `src/components/ui/button.tsx`
- Modify: `src/components/ui/input.tsx`
- Test: существующие `src/shell/*.test.tsx` (прогон, правка только упавших селекторов)

**Interfaces:**
- Produces: `ListRow` (28px, скругление, `current` = `bg-fill-2 font-medium`), `SectionHeader` (без капители и рамки), `ViewBar` (`h-bar`), `PanelBar` (волосяная линия сверху), кнопки `default|secondary|ghost`, инпут «filled» по умолчанию.

- [ ] **Step 1: `parts.tsx` — тихие части**

`ListRow`, строка 47-53, класс меняется на:

```tsx
'hover:bg-fill-1 flex h-7 w-full items-center gap-1.5 rounded-md pr-2 text-left text-xs transition-colors',
indentAt(depth),
as === 'div' && 'group cursor-pointer',
current && 'bg-fill-2 font-medium',
```

`SectionHeader`, класс:

```tsx
'text-muted-foreground flex h-7 w-full shrink-0 items-center gap-1.5 rounded-md px-2 text-xs transition-colors',
onClick && 'hover:bg-fill-1',
```

Проп `border` у `SectionHeader` удаляется вместе с использованием (grep по `border=` в `src/shell`).

`ViewBar`:

```tsx
'flex h-bar shrink-0 items-center gap-2 px-5',
```

`PanelBar`:

```tsx
'border-t flex h-8 shrink-0 items-center gap-2 px-3 text-xs',
```

- [ ] **Step 2: `button.tsx` — варианты**

В `cva`: `default: 'bg-primary text-primary-foreground hover:bg-primary-hover'`, `secondary: 'bg-fill-2 hover:bg-fill-3'`, `ghost: 'text-muted-foreground hover:bg-fill-1 hover:text-foreground'`; размер `2xs` — `h-6.5`, `xs` — `h-7`; `rounded-md` во всех размерах.

- [ ] **Step 3: `input.tsx` — filled по умолчанию**

Базовый класс: `border-0 bg-fill-1 focus-visible:bg-fill-2` вместо рамочного; кольцо фокуса не убирается (`focus-visible:ring-*` остаётся как есть).

- [ ] **Step 4: Прогнать тесты, поправить упавшие селекторы, закоммитить**

Run: `npm run test`
Commit: `Quiet parts: no caps, no frames, fills and rounding`

---

### Task 3: Каркас — лист, вкладки, тулбар

**Files:**
- Modify: `src/App.tsx` (композиция центра)
- Modify: `src/shell/RepoTabs.tsx`
- Modify: `src/shell/Toolbar.tsx`

**Interfaces:**
- Consumes: классы задачи 1, части задачи 2.

- [ ] **Step 1: Лист.** Контейнер центрального вида в `App.tsx` получает `bg-card rounded-l-lg border-l` (фон остальной рамы — `bg-background` у корня вместо `bg-surface`, если стоит иное). Никаких новых обёрток — правится класс существующего контейнера.

- [ ] **Step 2: Вкладки.** Строка вкладки: `h-7 rounded-md px-2 gap-2`, активная `bg-fill-2 text-foreground`, неактивная `text-muted-foreground hover:bg-fill-1`; точка репозитория `size-1.75 rounded-full`; счётчик грязных файлов `text-modified text-2xs tabular-nums`; крестик `opacity-0 group-hover:opacity-100` у неактивных.

- [ ] **Step 3: Тулбар.** Все действия — `variant="ghost" size="xs"` с иконкой `size-3.5`; Push — `variant="default"` с числом ahead `tabular-nums`; разделитель — `<Separator orientation="vertical" />` (цвет уже волосяной от токена `--border`).

- [ ] **Step 4: Прогнать тесты и закоммитить**

Run: `npm run test`
Commit: `Quiet shell: card sheet, pill tabs, ghost toolbar`

---

### Task 4: Сайдбар и правая панель

**Files:**
- Modify: `src/shell/Sidebar.tsx`
- Modify: `src/shell/Details.tsx`
- Modify: `src/shell/WorkingTree.tsx`
- Modify: `src/shell/PullPanel.tsx`
- Modify: `src/shell/HostRepos.tsx`

Механическая замена по словарю — построчно, без скриптов и регулярок:

| Было | Стало |
|---|---|
| `hover:bg-surface-hover` | `hover:bg-fill-1` |
| `bg-ahead/15` (текущая строка) | уже заменено в `ListRow` |
| `uppercase tracking-wide` | убрать |
| приглушённые даты/счётчики/sha `text-muted-foreground` | `text-faint tabular-nums` (числа) |
| чипы `bg-secondary`, `bg-*/α` | `bg-fill-1`, точка цветом вида |
| `border-b` у секционных шапок | убрать (secция без рамки) или `border-t` по карточке |
| `rounded`/`rounded-sm` на пилюлях | `rounded-md` |

- [ ] **Step 1: Sidebar** — группы через обновлённый `SectionHeader` с шевроном и счётчиком `text-faint tabular-nums`; точки видов ссылок: `rounded-full`, у тегов и worktree `rounded-xs`; хвосты `↑2`/`gone` — `text-ahead`/`text-behind`/`text-deleted`.
- [ ] **Step 2: Details** — чипы-пилюли `bg-fill-1 rounded-md px-2 py-1`, кнопки `secondary`, статистика `+/−` цветами `text-added`/`text-deleted` `tabular-nums`, квадрат статуса файла `size-1.75 rounded-xs`.
- [ ] **Step 3: WorkingTree, PullPanel, HostRepos** — тот же словарь.
- [ ] **Step 4: Тесты и коммит**

Run: `npm run test`
Commit: `Quiet sidebar and panels`

---

### Task 5: Виды, модальные, тосты, Monaco

**Files:**
- Modify: `src/shell/DiffView.tsx`, `ConflictView.tsx`, `FileHistoryView.tsx`, `StartPage.tsx`, `Settings.tsx`, `CloneDialog.tsx`, `AskDialog.tsx`
- Modify: `src/monaco.ts` (фон редактора = `--card`, шрифт `--font-mono`)
- Modify: `src/components/ui/sonner.tsx` при наличии зашитых цветов

- [ ] **Step 1: Применить словарь задачи 4 ко всем перечисленным файлам.**
- [ ] **Step 2: Monaco** — фон и цвета берёт из тех же переменных, что уже читает (`getComputedStyle`); проверить, что фон стал `--card`, гаттер без рамки.
- [ ] **Step 3: Тесты и коммит**

Run: `npm run test`
Commit: `Quiet views and dialogs`

---

### Task 6: Граф — чистая часть

**Files:**
- Modify: `src/scene.ts`
- Modify: `src/theme.ts`
- Test: `src/scene.test.ts`, `src/render.test.ts`

**Interfaces:**
- Produces: `METRICS_AVATARS = { rowH: 36, laneW: 28, nodeR: 8, avatars: true }`, `HEADER_H = 28`; `theme()` дополнительно отдаёт `panel`, `primary`, `fill1`, `fill2`, `fill3`; `laneSoft(index)` в `theme.ts`.

- [ ] **Step 1: Обновить ожидания тестов сцены под новые метрики** (36/28/8, `HEADER_H` 28) — тесты падают.
- [ ] **Step 2: `scene.ts`** —

```ts
const SANS = `'Geist Variable', ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`;
```

```ts
export const METRICS_AVATARS: Metrics = {
  rowH: 36,
  laneW: 28,
  nodeR: 8,
  avatars: true,
  ...fonts(13, 11),
};
```

`HEADER_H = 28`. `METRICS_COMPACT` не меняется.

- [ ] **Step 3: `theme.ts`** — в `Theme` и `build()`:

```ts
panel: token('--card'),
primary: token('--primary'),
primarySoft: mix('--primary', 25),
fill1: token('--fill-1'),
fill2: token('--fill-2'),
fill3: token('--fill-3'),
faint: token('--faint-foreground'),
```

(`faint` перестаёт быть `mix`.) И экспорт:

```ts
export const laneSoft = (index: number): string => laneColourAlpha(index, 30);
```

- [ ] **Step 4: Тесты зелёные, коммит**

Run: `npm run test`
Commit: `Quiet graph metrics: 36px rows, Geist on canvas, theme fills`

---

### Task 7: Граф — краска

**Files:**
- Modify: `src/render.ts`
- Modify: `src/shell/GraphView.tsx` (классы WIP-инпута)

Все правки в `drawFrame` и соседях; координатная сетка не меняется.

- [ ] **Step 1: Шрифты канваса** — `FONT_CHIP = '11px …'`, `FONT_HEAD = '12px …'` со стеком Geist (тот же, что в `scene.ts`).

- [ ] **Step 2: Фон и лист** — заливка канваса `t.panel` вместо `t.surface` (строка 162); то же в ореоле прижатого узла и заливке WIP-узла; мини-карта — фон `t.panel`, кромка `t.border`.

- [ ] **Step 3: Подложка дорожки** (строки 204-211) — градиент вместо плоского прямоугольника:

```ts
const x = g.nodeX(row.lane) - m.nodeR - 2;
const grad = ctx.createLinearGradient(x, 0, g.gRight, 0);
grad.addColorStop(0, laneColourAlpha(row.colour, 16));
grad.addColorStop(0.78, 'rgba(0,0,0,0)');
ctx.fillStyle = grad;
roundRect(ctx, x, y + 2, Math.max(0, g.gRight - x), m.rowH - 4, 7);
ctx.fill();
```

- [ ] **Step 4: Строки hover и selected** (строки 184-193) — скруглённая полная строка вместо арки:

```ts
ctx.fillStyle = i === selected ? t.fill2 : t.fill1;
roundRect(ctx, 4, y + 1, listW - 8, m.rowH - 2, 7);
ctx.fill();
```

Линия между строками `t.rowLine` остаётся.

- [ ] **Step 5: Узел** (строки 332-360) — вместо аватара в узле:

```ts
ctx.beginPath();
ctx.arc(x, y, m.nodeR, 0, Math.PI * 2);
ctx.fillStyle = laneSoft(row.colour);
ctx.fill();
ctx.strokeStyle = colour;
ctx.lineWidth = 2;
ctx.stroke();
```

Кольцо выделения (строки 362-368):

```ts
if (i === selected) {
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = t.primary;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, m.nodeR + 3.5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}
```

- [ ] **Step 6: Аватар в колонке сообщения** — в текстовом цикле для коммитов перед сюжетом:

```ts
const av = 9;
ctx.save();
ctx.beginPath();
ctx.arc(msgX + av, yc, av, 0, Math.PI * 2);
ctx.clip();
const look = frame.avatars?.lookOf(row.email) ?? { kind: 'identicon' as const };
ctx.drawImage(
  look.kind === 'image' ? look.image : identicon(avatarKey(row, i), av * 2),
  msgX, yc - av, av * 2, av * 2,
);
ctx.restore();
```

Текст сюжета начинается с `msgX + av * 2 + 8`, `subjMax` уменьшается на то же.

- [ ] **Step 7: Чипы** (`drawChip`) — пилюля `t.fill1` (HEAD — `resolve` от `color-mix(in oklab, var(--primary) 25%, transparent)` через новый вход в `theme.ts`: `primarySoft`), точка `size 6` цветом `t.ref[kind]` слева, текст `t.muted` (HEAD — `t.foreground`), скругление пилюли `(chipH)/2` нет — по карточке 6: `roundRect(..., 6)`. Существующие метки local/remote остаются после текста.

- [ ] **Step 8: Шапка колонок** (`drawHeader`) — фон `t.panel`, текст `t.faint`, линия низа `t.border`, разделители `t.border`.

- [ ] **Step 9: Полосы прокрутки** — hscroll: дорожка `t.fill1`, бегунок `t.fill3`; мини-карта: окно `t.fill2` с обводкой `t.fill3`.

- [ ] **Step 10: WIP-инпут в `GraphView.tsx`** — классы поля на filled-инпут (`bg-fill-1 focus-visible:bg-fill-2 rounded-md h-6`), кнопка `size="2xs"`.

- [ ] **Step 11: Тесты, включая «ноль React-рендеров при прокрутке», коммит**

Run: `npm run test`
Commit: `Quiet graph paint: lane wash, tone nodes, indigo ring, message avatars`

---

### Task 8: Полная проверка

- [ ] **Step 1:** `npm run build` — i18n, boundary, tsc, vitest, сборка. Всё зелёное.
- [ ] **Step 2:** `cargo test -p gitspy-app` не запускается — Rust не менялся; `git diff master --stat` подтверждает отсутствие правок вне `src/`, `docs/`, `package*.json`.
- [ ] **Step 3:** Прогон приложения `npm run app` заказчиком; расхождения с карточкой собираются списком и правятся точечно.

## Self-review

- Покрытие спеки: токены — задача 1; словарь — 2; экраны — 3-5; граф — 6-7; «чего нет» — не появляется нигде; готовность — 8. Пробелов нет.
- Заглушек нет; каждая правка с кодом или словарём замены.
- Типы: `laneSoft` объявлен в задаче 6, используется в 7; `t.panel/primary/primarySoft/fill*` объявлены в 6, используются в 7.
