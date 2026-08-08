# ACP: управление сессией, живая индикация, репо-скоуп — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Довести агентские сессии до рабочего состояния: свои сессии у каждого репозитория, чипы модели/эффорта/режима из протокола, живая индикация хода со стопом, слэш-команды, окно контекста; и вычистить хром дока.

**Architecture:** Всё управление приходит от агента данными — `configOptions` (категории `mode`/`model`/`model_config`/`thought_level`) в ответе `session/new`, метод `session/set_config_option`, нотификация `config_option_update`. Клиент ничего не хардкодит: один компонент чипов рисует то, что объявил агент. Индикация хода — `agent_thought_chunk`/`tool_call`/`plan`, отмена — `session/cancel`, расход — `usage_update`, команды — `available_commands_update`.

**Tech Stack:** `gitspy-acp` (JSON-RPC/stdio), Tauri `Channel` + ts-rs, zustand, shadcn (DropdownMenu, Popover, Command), Tailwind-токены.

## Global Constraints

- **Коммитов и пушей нет:** ни `git add`, ни `git commit`, ни `git push`. Незакоммиченные терминал v1 и ACP v2 в дереве нужны как есть.
- **Комментариев в коде нет** (ни `//`, ни `///`, ни `/* */`). Идентификаторы английские, `assert`-сообщения русские.
- Строки UI — только ключи i18n; `invoke` — только в `src/ipc.ts`; FSD строго вниз через фасады.
- Списки моделей, эффортов, режимов **не хардкодить**: они приходят от агента. Захардкоженный `if model == …` — дефект.
- Стили — токены и части `src/parts.tsx`; иконки — `src/icons.ts`.
- TDD: тест падает до реализации. Ворота: `cargo clippy --all-targets -- -D warnings`, `cargo fmt --all`, `npx tsc --noEmit`, `npx vitest run <файл>`.
- `npm run boundary:check` красен из-за untracked `src/generated/Acp*.ts` — это следствие запрета коммитов, не чинить; остальные ворота обязаны быть зелёными.
- Сеть и запуск настоящего адаптера разрешены только Task 1 (разведка) и Task 6 (проба).

---

### Task 1: Разведка живого адаптера + расширение событий протокола

**Files:**
- Create: `crates/gitspy-acp/examples/discover.rs`
- Modify: `crates/gitspy-acp/src/lib.rs`, `crates/gitspy-acp/src/wire.rs`
- Modify: `crates/gitspy-acp/tests/client.rs`, `crates/gitspy-acp/tests/fixtures/mock-agent.mjs`
- Modify: `src-tauri/src/acp.rs`, `src/types.ts`

**Interfaces:**
- Produces (крейт):
  - `pub struct SessionStart { pub session_id: String, pub config: Vec<ConfigOption> }`
  - `pub struct ConfigOption { pub id: String, pub name: String, pub description: Option<String>, pub category: String, pub current_value: String, pub choices: Vec<ConfigChoice>, pub via_set_mode: bool }`
  - `pub struct ConfigChoice { pub value: String, pub name: String }`
  - `AcpClient::new_session(&mut self, cwd: &Path) -> Result<SessionStart, String>` (было `String`)
  - `AcpClient::set_config(&mut self, session: &str, config_id: &str, value: &str, via_set_mode: bool) -> Result<(), String>`
  - Новые варианты `AgentEvent`: `Thought { text }`, `Plan { entries: Vec<PlanEntry> }`, `Config { options: Vec<ConfigOption> }`, `ConfigValue { config_id: String, value: String }`, `Commands { commands: Vec<CommandInfo> }`, `Usage { used: u64, size: u64, cost: Option<f64>, currency: Option<String> }`
  - `pub struct PlanEntry { pub content: String, pub status: String }`, `pub struct CommandInfo { pub name: String, pub description: String, pub hint: Option<String> }`
- Produces (граница): те же варианты в `AcpEventView` (`thought`, `plan`, `config`, `configValue`, `commands`, `usage`), типы `AcpConfigOptionView`, `AcpConfigChoiceView`, `AcpCommandView`, `AcpPlanEntryView`; команда `acp_set_config(id: u32, config_id: String, value: String) -> Result<(), ErrorView>`.
- Совместимость: если `session/new` вернул старую форму `modes { currentModeId, availableModes }` вместо `configOptions`, крейт синтезирует из неё `ConfigOption { id: "mode", category: "mode", via_set_mode: true }`; такой параметр переключается методом `session/set_mode`, остальные — `session/set_config_option`.

- [ ] **Step 1: Разведка на настоящем адаптере (факты вместо догадок)**

`crates/gitspy-acp/examples/discover.rs` — минимальный клиент **мимо** `AcpClient`: спавнит `npx -y @agentclientprotocol/claude-agent-acp` (env из `gitspy_acp::claude::claude_code_env()`), шлёт `initialize`, `session/new`, затем один промпт `«перечисли три файла в этом репозитории»` и печатает в stdout **сырые строки** stdout адаптера как есть, до отключения. Запуск:

```bash
cargo run -q -p gitspy-acp --example discover -- /Users/pavelerohovets/projects/gitspy > /tmp/acp-discovery.jsonl 2>/tmp/acp-discovery.err
```

Из дампа выписать в отчёт: какие поля реально вернул `session/new` (`configOptions`? `modes`? `models`?), какие `sessionUpdate` приходят (`agent_thought_chunk`, `plan`, `available_commands_update`, `usage_update`, `config_option_update`), и **есть ли что-нибудь про план-лимиты аккаунта** (5-hour/weekly) хоть в каком-то виде, включая `_meta`. Эти факты — основание для остальных шагов: **где дамп расходится с листингами плана, следовать дампу и записать расхождение в отчёт.**

- [ ] **Step 2: Падающие тесты крейта**

В `tests/fixtures/mock-agent.mjs` добавить сценарий `rich`: на `session/new` отвечать
`{ sessionId: 's1', configOptions: [ {id:'mode',name:'Mode',category:'mode',type:'select',currentValue:'ask',options:[{value:'ask',name:'Ask'},{value:'auto',name:'Auto'}]}, {id:'model',name:'Model',category:'model',type:'select',currentValue:'fable',options:[{value:'fable',name:'Fable 5'},{value:'opus',name:'Opus 5'}]} ] }`;
в сценарии `rich` слать по очереди `agent_thought_chunk {content:{type:'text',text:'думаю'}}`, `plan {entries:[{content:'шаг',priority:'high',status:'pending'}]}`, `available_commands_update {availableCommands:[{name:'usage',description:'Show usage'}]}`, `usage_update {used:1200,size:200000,cost:{amount:0.02,currency:'USD'}}`, затем ответ хода. На `session/set_config_option` отвечать полным списком опций с изменённым `currentValue` и слать `config_option_update`.

В `tests/client.rs`:

```rust
#[test]
fn session_start_carries_config_options() {
    let (mut client, _events, _) = start();
    let started = client.new_session(&PathBuf::from("/tmp")).expect("сессия создаётся");
    let ids: Vec<&str> = started.config.iter().map(|o| o.id.as_str()).collect();
    assert_eq!(ids, ["mode", "model"], "опции сессии приходят из session/new");
    let model = started.config.iter().find(|o| o.category == "model").expect("категория model объявлена");
    assert_eq!(model.current_value, "fable", "текущее значение читается");
    assert_eq!(model.choices.len(), 2, "варианты выбора читаются");
    client.kill();
}

#[test]
fn rich_turn_streams_thought_plan_commands_and_usage() {
    let (mut client, events, _) = start();
    let started = client.new_session(&PathBuf::from("/tmp")).expect("сессия создаётся");
    client.prompt(&started.session_id, "rich").expect("prompt уходит");
    let mut seen: Vec<&'static str> = Vec::new();
    loop {
        let ev = events.recv_timeout(Duration::from_secs(5)).expect("событие обязано прийти");
        match ev {
            AgentEvent::Thought { .. } => seen.push("thought"),
            AgentEvent::Plan { .. } => seen.push("plan"),
            AgentEvent::Commands { .. } => seen.push("commands"),
            AgentEvent::Usage { used, size, .. } => {
                assert_eq!((used, size), (1200, 200_000), "расход контекста читается как есть");
                seen.push("usage");
            }
            AgentEvent::TurnEnded { .. } => break,
            _ => {}
        }
    }
    assert_eq!(seen, ["thought", "plan", "commands", "usage"], "ход отдаёт все виды обновлений по порядку");
    client.kill();
}

#[test]
fn setting_a_config_option_reports_new_value() {
    let (mut client, events, _) = start();
    let started = client.new_session(&PathBuf::from("/tmp")).expect("сессия создаётся");
    client.set_config(&started.session_id, "model", "opus", false).expect("смена уходит");
    let value = loop {
        match events.recv_timeout(Duration::from_secs(5)).expect("событие обязано прийти") {
            AgentEvent::Config { options } => {
                break options.iter().find(|o| o.id == "model").expect("опция на месте").current_value.clone()
            }
            _ => continue,
        }
    };
    assert_eq!(value, "opus", "агент подтверждает новое значение опции");
    client.kill();
}
```

Существующие вызовы `new_session(...)` в тестах и `examples/smoke.rs` поправить на `started.session_id`.

- [ ] **Step 3: Прогнать — падают** (`cargo test -p gitspy-acp`)

- [ ] **Step 4: Реализация в крейте**

`wire.rs` — `set_config_params(session, config_id, value)` для `session/set_config_option`, `set_mode_params(session, mode_id)` для `session/set_mode`, разбор `configOptions`/`modes` в `Vec<ConfigOption>` (функция `config_options_of(value: &Value) -> Vec<ConfigOption>`, покрыта юнит-тестом на обе формы). `lib.rs` — новые ветки `sessionUpdate` → события; `new_session` собирает `SessionStart`; `set_config` выбирает метод по `via_set_mode`.

- [ ] **Step 5: Граница**

`src-tauri/src/acp.rs`: новые варианты `AcpEventView` + типы + команда `acp_set_config`, регистрация в `main.rs`, `src/types.ts` реэкспортирует новые типы. Прогнать `cargo test -p gitspy-app` (перегенерация `src/generated/`).

- [ ] **Step 6: Ворота Rust** — `cargo test -p gitspy-acp`, `cargo test -p gitspy-app`, clippy, fmt. Отчёт обязан содержать выжимку разведки из Step 1.

---

### Task 2: Док — свои сессии у каждого репозитория и чистый хром

**Files:**
- Modify: `src/entities/terminal/sessions.ts` + `sessions.test.ts`
- Modify: `src/entities/agent/sessions.ts` + `sessions.test.ts`
- Modify: `src/widgets/TerminalDock.tsx` + `TerminalDock.test.tsx`
- Create: `src/widgets/agent/AgentChips.tsx`, `src/widgets/agent/AgentFeed.tsx`, `src/widgets/agent/AgentComposer.tsx`
- Modify: `src/widgets/AgentSessionView.tsx` (композиция трёх частей), `AgentSessionView.test.tsx`
- Modify: `src/locales/en/common.json`

**Interfaces:**
- Consumes: `AcpEventView` (Task 1) — только типы.
- Produces:
  - `TermSession` и `AgentSession` получают поле `repo: string`; `useTermSessions.add` и `useAgentSessions.add` принимают его; селекторы `sessionsOfRepo(repo)` / `agentsOfRepo(repo)`; `activeId` становится `activeByRepo: Record<string, number | null>`, методы `setActive(repo, id)` и `activeOf(repo)`.
  - Оболочки: `<AgentChips id repo />`, `<AgentFeed id repo />`, `<AgentComposer id repo />` — в этой задаче рисуют минимум (чипы — пусто, лента — текущий рендер элементов, композер — текущий input+Send), их наполняют Task 3–5. Файлы обязаны существовать с этими сигнатурами до старта параллельных задач.

- [ ] **Step 1: Падающие тесты**

В `src/entities/terminal/sessions.test.ts`:

```ts
it('сессии разных репозиториев не смешиваются', () => {
  const s = fresh();
  s.add({ id: 1, title: 'zsh', command: null, cwd: '/a', repo: '/a', status: 'idle' });
  s.add({ id: 2, title: 'zsh', command: null, cwd: '/b', repo: '/b', status: 'idle' });
  expect(sessionsOfRepo(useTermSessions.getState(), '/a').map((x) => x.id)).toEqual([1]);
  expect(sessionsOfRepo(useTermSessions.getState(), '/b').map((x) => x.id)).toEqual([2]);
});

it('активная сессия своя у каждого репозитория', () => {
  const s = fresh();
  s.add({ id: 1, title: 'zsh', command: null, cwd: '/a', repo: '/a', status: 'idle' });
  s.add({ id: 2, title: 'zsh', command: null, cwd: '/b', repo: '/b', status: 'idle' });
  expect(activeOf(useTermSessions.getState(), '/a'), 'переключение вкладки не крадёт активную сессию').toBe(1);
  expect(activeOf(useTermSessions.getState(), '/b')).toBe(2);
});
```

Аналогично в `src/entities/agent/sessions.test.ts`.

В `src/widgets/TerminalDock.test.tsx`:

```tsx
it('док показывает только сессии своего репозитория', () => {
  useTermSessions.setState({
    sessions: [
      { id: 1, title: 'zsh гитспая', command: null, cwd: '/a', repo: '/a', status: 'idle' },
      { id: 2, title: 'zsh реакта', command: null, cwd: '/b', repo: '/b', status: 'idle' },
    ],
    activeByRepo: { '/a': 1, '/b': 2 },
  });
  render(<TerminalDock repo="/b" onFileLink={() => {}} onHashLink={() => {}} />);
  expect(screen.queryByText('zsh гитспая'), 'чужой репозиторий не приносит свои сессии').toBeNull();
  expect(screen.getByText('zsh реакта')).toBeTruthy();
});

it('свёрнутый список остаётся навигацией: иконки сессий и кнопка новой', () => {
  useTermSessions.setState({
    sessions: [{ id: 1, title: 'zsh', command: null, cwd: '/a', repo: '/a', status: 'idle' }],
    activeByRepo: { '/a': 1 },
  });
  render(<TerminalDock repo="/a" onFileLink={() => {}} onHashLink={() => {}} />);
  fireEvent.click(screen.getByLabelText('Collapse sessions'));
  expect(screen.getByLabelText('New terminal'), 'свёрнутая полоса не теряет кнопку новой сессии').toBeTruthy();
  expect(screen.getAllByRole('button', { name: 'zsh' }).length, 'сессии остаются кликабельными иконками').toBe(1);
});

it('шапки «Terminal» над доком нет', () => {
  render(<TerminalDock repo="/a" onFileLink={() => {}} onHashLink={() => {}} />);
  expect(screen.queryByText('Terminal'), 'полоса-заголовок только ела высоту').toBeNull();
});
```

- [ ] **Step 2: Прогнать — падают**

- [ ] **Step 3: Реализация**

Сторы: поле `repo`, `activeByRepo`, селекторы. Панели терминалов (`livePanes`) уже по id — видимость считать по активной записи **текущего репо**; сессии чужого репо просто скрыты и продолжают жить. `openSession`/`startAgent` передают `repo` в `add`.

Хром: убрать `<ViewBar>` с `GIT.terminal` целиком. Свёрнутая полоса (`w-12`) рисует: кнопку `+` (иконка), затем по строке на сессию — иконка (`Icon.terminal`/`Icon.sparkle`) с точкой статуса в углу и `aria-label`/`title` = заголовок сессии, активная подсвечена; снизу кнопка разворота. Кнопка `+` открывает `profiles[0]` немедленно; пункт меню — свой профиль немедленно; дублирующий пункт `agent.newAcp` из меню убрать, ACP живёт профилем `kind: 'acp'` (добавить его в дефолт `readProfiles`: `[{label:'zsh',command:null,kind:'term'},{label:'claude · ACP',command:null,kind:'acp'}]`, тест на дефолт поправить).

`AgentSessionView` распадается на три части: `AgentChips` (шапка сессии), `AgentFeed` (лента), `AgentComposer` (ввод); сам файл — только композиция и общий каркас колонки.

- [ ] **Step 4: Ключи i18n** — `term.collapse`/`term.expand` уже есть; добавить `term.sessionsCollapse: "Collapse sessions"`, `term.sessionsExpand: "Expand sessions"`.

- [ ] **Step 5: Зелёные** — `npx vitest run src/entities src/widgets`, `npx tsc --noEmit`, `npm run lint`, `npm run i18n:check`.

---

### Task 3: Чипы управления сессией и расход контекста

**Files:**
- Modify: `src/widgets/agent/AgentChips.tsx`, create `src/widgets/agent/AgentChips.test.tsx`
- Modify: `src/entities/agent/sessions.ts` (состояние конфигурации и расхода)
- Modify: `src/features/agent/session.ts` (действие смены значения)
- Modify: `src/ipc.ts`, `src/locales/en/common.json`

**Interfaces:**
- Consumes: события `config`, `configValue`, `usage` (Task 1); оболочка `AgentChips` (Task 2).
- Produces: в сторе агента на сессию — `config: AcpConfigOptionView[]`, `usage: { used: number; size: number; cost: number | null } | null`; действие `setConfigValue(id, configId, value)` → `acpSetConfig`; чипы рисуются **из данных**: по чипу на опцию в порядке категорий `model`, `model_config`/`thought_level`, `mode`, остальные — следом.

- [ ] **Step 1: Падающие тесты**

```tsx
const OPTIONS: AcpConfigOptionView[] = [
  { id: 'model', name: 'Model', description: null, category: 'model', currentValue: 'fable',
    choices: [{ value: 'fable', name: 'Fable 5' }, { value: 'opus', name: 'Opus 5' }] },
  { id: 'effort', name: 'Effort', description: null, category: 'thought_level', currentValue: 'high',
    choices: [{ value: 'low', name: 'Low' }, { value: 'high', name: 'High' }] },
  { id: 'mode', name: 'Mode', description: null, category: 'mode', currentValue: 'ask',
    choices: [{ value: 'ask', name: 'Ask' }, { value: 'auto', name: 'Auto' }] },
];

it('чипы рисуются из объявленных агентом опций, а не из своего списка', () => {
  useAgentSessions.setState({ sessions: [{ id: 1, repo: '/a', title: 'claude', status: 'ready', config: OPTIONS, usage: null }] });
  render(<AgentChips id={1} repo="/a" />);
  expect(screen.getByText('Fable 5')).toBeTruthy();
  expect(screen.getByText('High')).toBeTruthy();
  expect(screen.getByText('Ask')).toBeTruthy();
});

it('выбор в чипе уходит агенту как смена опции', async () => {
  useAgentSessions.setState({ sessions: [{ id: 1, repo: '/a', title: 'claude', status: 'ready', config: OPTIONS, usage: null }] });
  render(<AgentChips id={1} repo="/a" />);
  fireEvent.click(screen.getByText('Fable 5'));
  fireEvent.click(await screen.findByText('Opus 5'));
  expect(vi.mocked(acpSetConfig), 'смена модели — это протокольная опция, а не слэш-команда').toHaveBeenCalledWith(1, 'model', 'opus');
});

it('без объявленных опций чипов нет вовсе', () => {
  useAgentSessions.setState({ sessions: [{ id: 1, repo: '/a', title: 'claude', status: 'ready', config: [], usage: null }] });
  const { container } = render(<AgentChips id={1} repo="/a" />);
  expect(container.querySelectorAll('button').length, 'агент без опций не получает выдуманных чипов').toBe(0);
});

it('расход контекста показывается долей и числом', () => {
  useAgentSessions.setState({ sessions: [{ id: 1, repo: '/a', title: 'claude', status: 'ready', config: [], usage: { used: 40000, size: 200000, cost: null } }] });
  render(<AgentChips id={1} repo="/a" />);
  expect(screen.getByText('20%'), 'доля окна контекста считается из used и size').toBeTruthy();
});
```

- [ ] **Step 2: Прогнать — падают**
- [ ] **Step 3: Реализация** — чип = `DropdownMenu` (триггер `Button variant="outline" size="xs"` с именем текущего значения, галочка у выбранного); расход — кнопка с процентом, по клику `Popover` с полосой `used/size` и стоимостью, если пришла. Полоса — `div` с `w-[…]` через `style`, не через произвольный класс.
- [ ] **Step 4: Зелёные**, tsc, lint, i18n.

---

### Task 4: Жизненный цикл хода — мысли, таймер, стоп

**Files:**
- Modify: `src/widgets/agent/AgentFeed.tsx`, create `src/widgets/agent/AgentFeed.test.tsx`
- Modify: `src/widgets/agent/AgentComposer.tsx` (кнопка стоп вместо отправки во время хода)
- Modify: `src/entities/agent/feed.ts` + `feed.test.ts`
- Modify: `src/features/agent/session.ts` (`stopTurn`), `src/ipc.ts`
- Modify: `src/locales/en/common.json`

**Interfaces:**
- Consumes: события `thought`, `plan`, `toolCall`, `turnEnded`, `fatal`.
- Produces:
  - `FeedItem` пополняется `{ kind: 'thought'; text: string }` и `{ kind: 'plan'; entries: { content: string; status: string }[] }`; `applyEvent` для `turnEnded` со `stopReason === 'end_turn'` **не добавляет ничего** (тихий конец), для `cancelled`/`refusal`/`max_tokens` — `{ kind: 'ended', reason }`.
  - `stopTurn(id: number): Promise<void>` → `acpCancel`; статус сессии `stopping` (новый в `AgentStatus`) до прихода `turnEnded`.
  - `<AgentFeed>` во время хода показывает строку активности: точка + слово состояния + **счётчик секунд** от начала хода (`useEffect` с интервалом 1 с; при `stopping` — слово «Stopping…»).

- [ ] **Step 1: Падающие тесты**

```ts
it('обычный конец хода не оставляет мусора в ленте', () => {
  const items = applyEvent([{ kind: 'agent', text: 'готово' }], { kind: 'turnEnded', stopReason: 'end_turn' });
  expect(items, 'end_turn — это не сообщение пользователю').toEqual([{ kind: 'agent', text: 'готово' }]);
});

it('отмена и отказ остаются видимыми', () => {
  expect(applyEvent([], { kind: 'turnEnded', stopReason: 'cancelled' }).at(-1)).toEqual({ kind: 'ended', reason: 'cancelled' });
});

it('мысли агента копятся отдельно от ответа', () => {
  let items = applyEvent([], { kind: 'thought', text: 'ду' });
  items = applyEvent(items, { kind: 'thought', text: 'маю' });
  items = applyEvent(items, { kind: 'messageChunk', text: 'ответ' });
  expect(items).toEqual([{ kind: 'thought', text: 'думаю' }, { kind: 'agent', text: 'ответ' }]);
});
```

```tsx
it('пока агент работает, видно состояние и счётчик времени', () => {
  vi.useFakeTimers();
  useAgentSessions.setState({ sessions: [{ id: 1, repo: '/a', title: 'claude', status: 'working', config: [], usage: null }] });
  render(<AgentFeed id={1} repo="/a" />);
  act(() => { vi.advanceTimersByTime(3000); });
  expect(screen.getByText('3s'), 'молчащий экран во время хода — это сломанный экран').toBeTruthy();
  vi.useRealTimers();
});

it('во время хода кнопка отправки становится кнопкой стоп', () => {
  useAgentSessions.setState({ sessions: [{ id: 1, repo: '/a', title: 'claude', status: 'working', config: [], usage: null }] });
  render(<AgentComposer id={1} repo="/a" />);
  fireEvent.click(screen.getByLabelText('Stop'));
  expect(vi.mocked(acpCancel)).toHaveBeenCalledWith(1);
  expect(useAgentSessions.getState().sessions[0].status, 'нажатый стоп виден сразу, не дожидаясь агента').toBe('stopping');
});
```

- [ ] **Step 2: Прогнать — падают**
- [ ] **Step 3: Реализация** — мысли рисовать приглушённо (`text-muted-foreground`), план — списком со статусами, активность — строка с пульсирующей точкой и `tabular-nums` секундами.
- [ ] **Step 4: Зелёные**, tsc, lint, i18n.

---

### Task 5: Слэш-команды

**Files:**
- Modify: `src/widgets/agent/AgentComposer.tsx`, create `src/widgets/agent/AgentComposer.test.tsx`
- Modify: `src/entities/agent/sessions.ts` (список команд на сессию)
- Modify: `src/locales/en/common.json`

**Interfaces:**
- Consumes: событие `commands` (Task 1).
- Produces: в сессии `commands: AcpCommandView[]`; ввод, начинающийся с `/`, открывает список над полем: фильтрация по подстроке, ↑/↓ и Enter выбирают, Esc закрывает; выбор подставляет `/<name> ` в поле (не отправляет). Отправка — обычный `sendPrompt` с текстом команды.

- [ ] **Step 1: Падающие тесты**

```tsx
const COMMANDS = [
  { name: 'usage', description: 'Show plan usage', hint: null },
  { name: 'compact', description: 'Compact the conversation', hint: null },
];

it('слэш открывает список команд агента с описаниями', async () => {
  useAgentSessions.setState({ sessions: [{ id: 1, repo: '/a', title: 'claude', status: 'ready', config: [], usage: null, commands: COMMANDS }] });
  render(<AgentComposer id={1} repo="/a" />);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '/' } });
  expect(await screen.findByText('Show plan usage'), 'команды приходят от агента, а не выдуманы нами').toBeTruthy();
});

it('фильтр сужает список, выбор подставляет команду в поле', async () => {
  useAgentSessions.setState({ sessions: [{ id: 1, repo: '/a', title: 'claude', status: 'ready', config: [], usage: null, commands: COMMANDS }] });
  render(<AgentComposer id={1} repo="/a" />);
  const input = screen.getByRole('textbox');
  fireEvent.change(input, { target: { value: '/comp' } });
  expect(screen.queryByText('Show plan usage')).toBeNull();
  fireEvent.click(await screen.findByText('compact'));
  expect((input as HTMLInputElement).value, 'команда подставляется, отправку решает человек').toBe('/compact ');
});
```

- [ ] **Step 2: Прогнать — падают**
- [ ] **Step 3: Реализация** — список поверх поля (`absolute bottom-full`), строки — `ListRow`; клавиатура: ↑/↓/Enter/Esc.
- [ ] **Step 4: Зелёные**, tsc, lint, i18n.

---

### Task 6: Ворота и живая проба через границу приложения

**Files:** Modify: `src/dev/acpProbe.ts`

- [ ] **Step 1:** Ворота: `npm run i18n:check`, `npm run lint`, `npx tsc --noEmit`, `npx vitest run`, `npx vite build`, `cargo test` по workspace, clippy, fmt. `boundary:check` — известное исключение (untracked `src/generated/Acp*.ts`), не чинить.
- [ ] **Step 2:** Расширить `src/dev/acpProbe.ts`: после открытия сессии печатать в отчёт число объявленных `configOptions` с категориями, число слэш-команд, приход `usage` и факт `thought`; промпт — `«перечисли три файла в этом репозитории»` (вызывает инструменты и мысли). Запуск вторым экземпляром:

```bash
rm -f /tmp/gitspy-acp-probe.log
VITE_SPIKE=acp npx tauri dev --config '{"build":{"beforeDevCommand":"npm run dev -- --port 5183","devUrl":"http://localhost:5183"}}'
```

ждать строк в `/tmp/gitspy-acp-probe.log` (`until`-цикл, таймаут 240 с), затем убить **только свои** процессы; порт 5173 — пользовательский dev-сервер, не трогать.

- [ ] **Step 3:** В отчёт: категории опций и их значения, число команд, `used/size`, наличие мыслей — то есть чем именно наполнятся чипы у живого Claude Code.
