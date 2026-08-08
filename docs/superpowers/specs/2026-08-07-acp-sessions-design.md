# ACP-сессии: детальный дизайн v2

**Дата:** 2026-08-07
**Статус:** принято
**Родитель:** `2026-08-07-terminal-acp-design.md` (раздел «Агентские сессии»).
Здесь — уровень исполнения: провод, типы, границы, чекпоинты, скоуп первого захода.

## 1. Скоуп первого захода

Входит: клиент ACP на Rust, спавн адаптера на сессию, лента сессии
(сообщения, вызовы инструментов, разрешения, чекпоинты, поле ввода),
чекпоинты на `fs/write`, профиль «claude · ACP» в меню «+», смоук с
настоящим `claude-agent-acp`.

Сознательно отложено (следующие заходы, не делать сейчас):
- **terminal capability клиента** — объявляем `terminal: false`, адаптер
  гоняет команды внутри своего SDK; встраивание наших xterm в карточки —
  отдельный заход поверх готового дока;
- карточка плана, вложенные стенограммы субагентов, чипы модели/режима —
  после дизайнера;
- `session/list` / `resume`, правила «всегда разрешать», GC чекпоинтов.

## 2. Провод

JSON-RPC 2.0, по строке на сообщение (ndjson) через stdio дочернего
процесса-адаптера. Клиент — мы: шлём `initialize`, `session/new`,
`session/prompt`; принимаем нотификации `session/update` и встречные
запросы `session/request_permission`, `fs/read_text_file`,
`fs/write_text_file`. Формы сообщений фиксируются мок-агентом в тестах
(наш пол), а перед смоуком сверяются с agentclientprotocol.com — протокол
версионирован, расхождение ловит смоук, а не пользователь.

Крейт `crates/gitspy-acp`: свой разбор JSON-RPC на serde поверх stdio.
Официальный растовый крейт протокола можно подключить позже, когда его
поверхность осядет; наш фасад от этого не меняется — он и есть граница.

## 3. Фасад крейта

- `AcpClient::spawn(command, cwd, on_event, fs_bridge) -> Result<AcpClient, String>`
- `initialize()`, `new_session(cwd) -> session_id`, `prompt(session_id, text)`,
  `respond_permission(request_id, option_id)`, `cancel(session_id)`, `kill()`
- События наружу (`AgentEvent`): `MessageChunk{text}`,
  `ToolCall{id, title, status}`, `ToolCallUpdate{id, status}`,
  `PermissionRequest{request_id, title, options: [{id, label}]}`,
  `Checkpoint{oid, path}`, `TurnEnded{stop_reason}`, `Fatal{detail}`.
- `FsBridge` — читает и пишет файлы по запросам агента; перед первой
  записью хода зовёт чекпоинт.

## 4. Чекпоинты

Снапшот — `git stash create` через `gitspy-exec` (обезвреженное окружение,
как у всех записей): oid коммита без записи в stash list. Ссылка —
`refs/gitspy/checkpoints/<session>/<n>` через `git update-ref`; в графе
не видна (не в `for-each-ref` паттернах приложения). Один чекпоинт на ход
(`session/prompt` → первая запись), к нему копится список записанных путей.
Откат — `git restore --source=<oid> --worktree -- <paths>` для путей,
существовавших в снапшоте; созданные агентом файлы просто удаляются.
Инвалидация — штатный watcher `.git`/дерева, ничего звать не надо.
Пустое дерево (`stash create` вернул пусто) — чекпоинт `None`, откат
означает удаление записанных файлов.

## 5. Граница Tauri

`src-tauri/src/acp.rs`: `acp_open(repo, command, on_event: Channel<AcpEventView>) -> u32`,
`acp_prompt(id, text)`, `acp_permission(id, request_id, option_id)`,
`acp_cancel(id)`, `acp_kill(id)`, `acp_rollback(repo, oid, paths)`.
`AcpEventView` — `#[derive(TS)]`, попадает в `src/generated/` и
пересобирается `boundary:check`. Ошибки — коды `acp.spawn`, `acp.gone`,
`acp.rollback` с `detail`.

## 6. Фронт

- `entities/agent`: стор сессий агента (`id, title, status: 'working' | 'waiting' | 'ready' | 'dead'`)
  и лента: `FeedItem = user | agent | tool | permission | checkpoint | ended`;
  чистый редьюсер `applyEvent(items, event)` (склейка чанков в последний
  `agent`-элемент, обновление статусов tool по id, резолв permission).
- `features/agent`: действия — prompt, ответ на разрешение, откат чекпоинта;
  маппинг `AcpEventView → FeedItem` чистый и под тестами.
- `widgets/AgentSessionView`: шапка (имя, статус), лента из частей
  словаря, карточка разрешения с кнопками, поле ввода. Живёт в доке:
  список сессий показывает терминальные и агентские вперемешку,
  `kind` решает, какая панель рендерится.
- Профиль в «+»: `TermProfile` получает `kind: 'term' | 'acp'`; пункт
  «claude · ACP» спавнит `npx @agentclientprotocol/claude-agent-acp`.

Статусы: `PermissionRequest` → `waiting` (плюс янтарная точка в списке),
`TurnEnded` → `ready`, иначе `working`; `Fatal`/смерть процесса → `dead`.

## 7. Проверка

Мок-агент — Node-скрипт в фикстурах крейта, говорит по проводу раздела 2:
сценарии «эхо», «запись с разрешением», «отказ». Все тесты крейта — против
него, без сети. Смоук с настоящим адаптером — отдельная задача: короткий
промпт без инструментов; отсутствие бинаря или авторизации — честный
репорт, а не зелёный тест.
