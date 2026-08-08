# ACP: терминалы агента, диф в сессию, субагенты, CSP — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Закрыть обещанное спекой и отложенное: команды агента идут в наш xterm внутри карточки, ханк из дифа уходит в сессию, субагенты видны вложенной стенограммой, CSP закрыт.

**Architecture:** Клиент объявляет `terminal: true` и реализует `terminal/create|output|wait_for_exit|kill|release` поверх уже готового `gitspy-term`; карточка инструмента с `content: [{type:'terminal', terminalId}]` показывает живую панель. Диф→сессия — черновик ввода в сторе агента. CSP закрывается и проверяется пробой на `securitypolicyviolation`, а не верой.

**Tech Stack:** `gitspy-term` (PTY), `gitspy-acp` (JSON-RPC), Tauri `Channel`, xterm.js, zustand.

**Стоит на:** `docs/superpowers/specs/2026-08-07-acp-sessions-design.md` (§1 «Сознательно отложено») и плане `2026-08-07-acp-controls.md` — начинать только после того, как тот прогон приземлился.

## Global Constraints

- **Коммитов и пушей нет.** Незакоммиченная работа в дереве нужна как есть.
- **Комментариев в коде нет.** Идентификаторы английские, `assert`-сообщения русские.
- Строки UI — ключи i18n; `invoke` — только `src/ipc.ts`; FSD строго вниз.
- Ничего не хардкодить из того, что объявляет агент.
- TDD: тест падает до реализации. Ворота: `cargo clippy --all-targets -- -D warnings`, `cargo fmt --all`, `npx tsc --noEmit`, `npx vitest run`.
- `boundary:check` красен из-за untracked `src/generated/Acp*.ts` — известное исключение, не чинить.

---

### Task 1: Ханк и файл из дифа уходят в сессию агента

**Files:**
- Create: `src/entities/agent/draft.ts` + `draft.test.ts`
- Modify: `src/entities/agent/index.ts`, `src/features/agent/session.ts`, `src/features/agent/index.ts`
- Modify: `src/widgets/agent/AgentComposer.tsx`
- Modify: `src/widgets/DiffView.tsx` (или файл, где рисуется шапка ханка — найти по `Stage hunk`), `src/widgets/Details.tsx`
- Modify: `src/locales/en/common.json`

**Interfaces:**
- Produces:
  - `draftOf(id: number): string`, `setDraft(id: number, text: string): void`, `onDraft(id: number, cb: () => void): () => void` — модульный стор черновика (форма под `useSyncExternalStore`, как `feedOf`/`onFeed`).
  - `askAgentAbout(repo: string, mention: string): Promise<number>` в `features/agent`: берёт активную агентскую сессию репозитория, если её нет — открывает; дописывает `mention` в черновик через пробел и возвращает id сессии.
  - Формат упоминания: `@<путь>:<от>-<до>` для ханка, `@<путь>` для файла — путь относительный от корня репозитория.

- [ ] **Step 1: Падающие тесты**

`src/entities/agent/draft.test.ts`:

```ts
it('черновик копится по сессиям и не течёт между ними', () => {
  setDraft(1, '@a.ts:1-5');
  setDraft(2, '@b.ts');
  expect(draftOf(1)).toBe('@a.ts:1-5');
  expect(draftOf(2)).toBe('@b.ts');
});

it('подписка узнаёт о новом черновике', () => {
  const seen = vi.fn();
  const stop = onDraft(3, seen);
  setDraft(3, '@c.ts');
  expect(seen, 'без уведомления поле ввода осталось бы пустым').toHaveBeenCalledTimes(1);
  stop();
  setDraft(3, '@d.ts');
  expect(seen).toHaveBeenCalledTimes(1);
});
```

`src/features/agent/session.test.ts` (дописать):

```ts
it('вопрос по ханку идёт в живую сессию репозитория, новую не плодит', async () => {
  const { id } = await opened(41);
  useAgentSessions.getState().setActive('/r', id);
  const asked = await askAgentAbout('/r', '@src/a.ts:10-20');
  expect(asked, 'у репозитория уже есть сессия — вторая не нужна').toBe(id);
  expect(draftOf(id)).toBe('@src/a.ts:10-20');
  expect(vi.mocked(acpOpen), 'лишняя сессия агента — лишний процесс').toHaveBeenCalledTimes(1);
});

it('без сессии вопрос по ханку её открывает', async () => {
  vi.mocked(acpOpen).mockImplementation(async () => 42);
  const asked = await askAgentAbout('/r', '@src/a.ts:1-2');
  expect(asked).toBe(42);
  expect(draftOf(42)).toBe('@src/a.ts:1-2');
});

it('второе упоминание дописывается к первому', async () => {
  const { id } = await opened(43);
  useAgentSessions.getState().setActive('/r', id);
  await askAgentAbout('/r', '@a.ts:1-2');
  await askAgentAbout('/r', '@b.ts');
  expect(draftOf(id), 'человек собирает контекст из нескольких мест').toBe('@a.ts:1-2 @b.ts');
});
```

- [ ] **Step 2: Прогнать — падают**
- [ ] **Step 3: Реализация** — `AgentComposer` читает черновик через `useSyncExternalStore(onDraft, draftOf)` как начальное значение поля и очищает его при отправке; кнопка в шапке ханка (`Icon.sparkle`, `variant="ghost" size="2xs"`, `aria-label` из i18n `agent.ask`) зовёт `askAgentAbout(repo, mention)`, открывает док (`writePref('term.dock.open', true)`) и делает сессию активной. Диапазон строк ханка брать из уже посчитанной модели ханков (`src/entities/diff`), не парсить заново.
- [ ] **Step 4: Зелёные**, tsc, lint, i18n.

---

### Task 2: Терминалы агента внутри карточки инструмента

**Files:**
- Modify: `crates/gitspy-acp/src/lib.rs`, `wire.rs`, `tests/client.rs`, `tests/fixtures/mock-agent.mjs`
- Create: `src-tauri/src/acp_terminal.rs`
- Modify: `src-tauri/src/acp.rs`, `src-tauri/src/main.rs`, `src/types.ts`
- Modify: `src/entities/agent/feed.ts` + `feed.test.ts`, `src/widgets/agent/AgentFeed.tsx`
- Modify: `src/entities/terminal/xtermHost.ts` (режим «только чтение» без PTY-ввода)

**Interfaces:**
- Крейт: `initialize` объявляет `terminal: true`; новый трейт `TerminalBridge: Send` с методами `create(&mut self, command: &str, args: &[String], cwd: Option<&str>, env: &[(String,String)], limit: Option<u64>) -> Result<String, String>`, `output(&mut self, id: &str) -> Result<TerminalOutput, String>`, `wait(&mut self, id: &str) -> Result<TerminalExit, String>`, `kill(&mut self, id: &str) -> Result<(), String>`, `release(&mut self, id: &str) -> Result<(), String>`; `AcpClient::spawn` принимает его рядом с `FsBridge`.
- `TerminalOutput { output: String, truncated: bool, exit: Option<TerminalExit> }`, `TerminalExit { code: Option<i32>, signal: Option<String> }`.
- Граница: `acp_terminal.rs` реализует мост поверх `gitspy_term::PtySession` — своя таблица `HashMap<String, LiveTerminal>`, накопление вывода в кольцевой буфер с лимитом (по умолчанию 1 МиБ), поток чтения шлёт байты в тот же `Channel` сессии событием `AcpEventView::TerminalOutput { terminal_id, bytes }`, событие `TerminalExit { terminal_id, code, signal }`.
- Событие `toolCall`/`toolCallUpdate` получает поле `terminal_id: Option<String>` (из `content[].type == "terminal"`).
- `FeedItem` вида `tool` получает `terminalId: string | null`; `AgentFeed` под такой карточкой монтирует панель xterm в режиме только для чтения и кормит её байтами события.

- [ ] **Step 1: Падающие тесты крейта**

Сценарий `shell` в мок-агенте: на `session/prompt` шлёт `tool_call` с `content:[{type:'terminal',terminalId:'t1'}]`, зовёт `terminal/create` (`command:'echo', args:['ok']`), затем `terminal/wait_for_exit`, затем `terminal/output`, затем завершает ход. Тест: мост получил `create` с этими аргументами, `wait` вернул код 0, событие `ToolCall` донесло `terminal_id`.

```rust
#[test]
fn agent_runs_its_command_through_the_client_terminal() {
    let (mut client, events, terminals) = start_with_terminals();
    let started = client.new_session(&PathBuf::from("/tmp")).expect("сессия создаётся");
    client.prompt(&started.session_id, "shell").expect("prompt уходит");
    let created = terminals.recv_timeout(Duration::from_secs(5)).expect("агент обязан просить терминал у клиента");
    assert_eq!(created, ("echo".to_owned(), vec!["ok".to_owned()]), "команда и аргументы доходят без искажений");
    let with_terminal = drain_until(&events, |e| match e {
        AgentEvent::ToolCall { terminal_id: Some(id), .. } => Some(id.clone()),
        _ => None,
    });
    assert_eq!(with_terminal, "t1", "карточка инструмента знает свой терминал");
    client.kill();
}
```

- [ ] **Step 2: Прогнать — падают**
- [ ] **Step 3: Реализация крейта** — ветки встречных запросов `terminal/*` → `TerminalBridge`, ответы по формам из документации (`{terminalId}`, `{output, truncated, exitStatus}`, `{exitCode, signal}`).
- [ ] **Step 4: Граница** — `acp_terminal.rs` поверх `gitspy_term`; `cwd` по умолчанию — корень репозитория сессии; лимит вывода уважается (тест: 100 байт лимита, вывод длиннее → `truncated: true`).
- [ ] **Step 5: Фронт** — карточка с `terminalId` монтирует хост xterm только для чтения (`disableStdin: true`), байты пишутся из события; по `TerminalExit` — статус в шапке карточки. Тест: карточка с `terminalId` рендерит контейнер панели, без него — нет.
- [ ] **Step 6: Ворота** обеих сторон.

---

### Task 3: Вложенные стенограммы субагентов

**Files:** `src/entities/agent/feed.ts` + тесты, `src/widgets/agent/AgentFeed.tsx`

- Из `tool_call` с признаком субагента (по `kind`/`title` — форму взять из дампа разведки `/tmp/acp-discovery.jsonl`) строится сворачиваемый элемент `{ kind: 'subagent'; id; title; items: FeedItem[]; done: boolean }`; вложенные события кладутся внутрь, а не в корень ленты.
- [ ] Тест: события субагента не засоряют корень ленты и видны внутри свёрнутого элемента; счётчик вызовов совпадает с числом вложенных `tool`.
- [ ] Реализация, ворота.

---

### Task 4: Закрыть CSP с проверкой пробой

**Files:** `src-tauri/tauri.conf.json`, create `src/dev/cspProbe.ts`, modify `src/app/main.tsx`

**Interfaces:** `VITE_SPIKE=csp` монтирует пробу: она вешает слушатель `securitypolicyviolation` на `document`, затем поднимает то, что может нарушить политику, — Monaco (worker и inline-стили), шрифты, xterm с WebGL, картинку через `convertFileSrc`, — и через 5 с пишет отчёт тем же приёмом, что `acpProbe` (сессия `cat >> /tmp/gitspy-csp-probe.log`): либо `CSP clean`, либо по строке на нарушение с `violatedDirective` и `blockedURI`.

- [x] **Step 1:** Написать пробу и прогнать её **на текущем `"csp": null`** — базовая линия обязана быть `CSP clean` (иначе проба врёт).

Проба живёт в `src/dev/cspProbe.ts`, чистая часть отчёта — в `src/dev/csp.ts` под тестами
`src/dev/csp.test.ts`. Политику Tauri отдаёт заголовком, а не `<meta>`, поэтому странице
неоткуда узнать, действует ли она: у пробы есть канарейка (`https://gitspy.invalid/canary.png`),
и строка `CSP policy enforced=yes|no` отделяет чистый прогон под политикой от чистого прогона
без неё. Базовая линия на `csp: null` — `enforced=no`, все подопытные `ok`, `CSP clean`.

Политика доезжает только до окна, которому страницу отдаёт протокол `tauri://`
(`AppManager::get_asset`), а `PROXY_DEV_SERVER = cfg!(all(dev, mobile))` на десктопе ложь —
значит с `devUrl` окно грузится мимо неё. Поэтому проба гоняется на собранном фронтенде:
`npx tauri dev --no-watch --no-dev-server --config …` с убранным `devUrl` и `frontendDist`
на отдельную сборку.

- [x] **Step 2:** Поставить политику в `tauri.conf.json`:
  `"csp": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: asset: http://asset.localhost; worker-src 'self'; connect-src 'self' ipc: http://ipc.localhost; frame-src 'none'; object-src 'none'"`
- [x] **Step 3:** Прогнать пробу снова. Каждое нарушение — либо законная нужда (тогда точечно расширить директиву и записать чем именно), либо настоящая находка. Отчёт: список директив и почему каждая нужна.

Каждое послабление проверено снятием: убираем токен, гоняем пробу, смотрим, что ломается.

| Директива | Чем доказана |
|---|---|
| `style-src 'unsafe-inline'` | без него 74 нарушения `style-src-attr`/`style-src-elem`, стили monaco мертвы |
| `img-src data:` | без него гаснет identicon из `toDataURL` |
| `img-src asset:` | без него гаснет аватарка из `convertFileSrc` |
| `connect-src ipc:` | без него `ipc://localhost/recent_repos` заблокирован, весь IPC уходит в запасной `postMessage` |
| `font-src data:` | **не нужен:** Geist приезжает woff2-файлами, снят |
| `worker-src blob:` | **не нужен:** vite отдаёт воркер monaco файлом того же источника, снят |
| `http://asset.localhost`, `http://ipc.localhost` | формы этих же схем на Windows, на macOS не проверить |

- [x] **Step 4:** Проверить, что в dev-режиме HMR жив (`devUrl` и ws-соединение Vite): если политика ломает разработку — использовать `app.security.devCsp` для dev и строгую для сборки, а не ослаблять боевую.

`devCsp` не нужен: в окне `tauri dev` с `devUrl` проба говорит `enforced=no` — политика туда не
доезжает вовсе. HMR жив, `[vite] (client) page reload src/dev/cspProbe.ts` приходит от
подключённого клиента.

- [x] **Step 5:** Ворота проекта.
