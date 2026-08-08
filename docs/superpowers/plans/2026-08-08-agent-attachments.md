# Вложения в промпт агента — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Кнопка «+» у поля ввода: приложить файлы и картинки, приложить папку, открыть список слэш-команд — и всё это уходит агенту протокольными блоками, а не текстом.

**Architecture:** Форма вложения выбирается по тому, что агент объявил в `promptCapabilities` при `initialize`, и по типу файла. Чтение файлов и base64 живут в Rust — через границу едут пути, а не мегабайты. Фронт показывает чипы вложений над вводом.

**Факты, проверенные на живом `claude-agent-acp@0.66.0`:** `agentCapabilities.promptCapabilities = { image: true, embeddedContext: true }`, поля `audio` нет вовсе. Блоки промпта: `text`, `image {mimeType, data}`, `resource {resource:{uri, text, mimeType}}`, `resource_link {uri, name, mimeType, size}`; текст и `resource_link` обязаны поддерживать все агенты.

## Global Constraints

- **Коммитов и пушей нет.** `git checkout`/`restore`/`stash` по рабочему дереву запрещены полностью — дерево не закоммичено, откат сотрёт чужую работу; свою неудачную правку отменяй обратной правкой.
- **Комментариев в коде нет.** Идентификаторы английские, `assert`-сообщения русские.
- Строки UI — ключи i18n; `invoke` — только `src/ipc.ts`; FSD строго вниз.
- Возможности агента не хардкодить: что он объявил, то и предлагаем.
- TDD: тест падает до реализации. Ворота: `cargo test`, `cargo clippy --all-targets -- -D warnings`, `cargo fmt --all`, `npx tsc --noEmit`, `npx vitest run`, `npm run i18n:check`. `boundary:check` красен из-за untracked `src/generated/Acp*.ts` — известное исключение.
- У пользователя запущено приложение и dev-сервер на 5173 — его процессы не трогать.

---

### Task 1: Крейт — возможности промпта и блоки вложений

**Files:** `crates/gitspy-acp/src/lib.rs`, `src/wire.rs`, `tests/client.rs`, `tests/fixtures/mock-agent.mjs`

**Interfaces:**
- `pub struct PromptAbilities { pub image: bool, pub embedded_context: bool }` — читается из `result.promptCapabilities` **и** из `result.agentCapabilities.promptCapabilities` (живой адаптер кладёт их именно во вложенное поле); отсутствующее поле — `false`.
- `AcpClient::abilities(&self) -> PromptAbilities` — доступно после `initialize`.
- `pub enum Attachment { Image { mime: String, base64: String }, Embedded { uri: String, text: String, mime: Option<String> }, Link { uri: String, name: String, mime: Option<String>, size: Option<u64> } }`
- `AcpClient::prompt(&mut self, session: &str, text: &str, attach: &[Attachment])` — собирает массив `prompt` из блока `text` и блоков вложений в порядке: вложения, затем текст.

- [ ] **Step 1: Падающие тесты.** В мок-агенте сценарий `attach`: на `session/prompt` проверяет пришедшие блоки и эхом отдаёт их типы в `agent_message_chunk`. Тесты: `initialize` с `agentCapabilities.promptCapabilities` даёт `abilities().image == true`; `prompt` с картинкой шлёт блок `image` с mime и base64; с текстовым файлом — `resource` с `uri` и содержимым; ссылкой — `resource_link` с `name` и `size`; текст всегда идёт последним блоком.
- [ ] **Step 2: Прогнать — падают.**
- [ ] **Step 3: Реализация.**
- [ ] **Step 4: Ворота Rust.**

---

### Task 2: Граница — пути превращаются в блоки

**Files:** `src-tauri/src/acp.rs`, `src-tauri/src/acp_attach.rs` (создать), `src/generated`, `src/types.ts`, `src/ipc.ts`

**Interfaces:**
- Команда `acp_prompt(id: u32, text: String, paths: Vec<String>) -> Result<(), ErrorView>`; пустой `paths` — прежнее поведение.
- `acp_attach.rs`: `fn attachment_of(path: &Path, can: PromptAbilities) -> Result<Attachment, String>` — правило выбора формы, чистое и покрытое тестами:
  - каталог → `Link` (`file://` uri, имя каталога);
  - `image/*` по расширению и агент умеет `image` → `Image` (base64 содержимого);
  - `image/*`, но агент не умеет → `Link`;
  - текстовый файл (валидный UTF-8) и агент умеет `embedded_context` → `Embedded` с содержимым;
  - иначе → `Link`.
  - Файл больше 5 МиБ → всегда `Link` (не гоняем мегабайты в промпт).
- Событие `AcpEventView::Abilities { image: bool, embedded_context: bool }` шлётся сразу после `initialize`, чтобы фронт знал, что предлагать.
- Коды ошибок: `acp.attach` с `detail`.

- [ ] **Step 1: Падающие тесты** на `attachment_of`: каталог, png при `image: true` и при `image: false`, текстовый файл при `embedded_context: true/false`, файл 6 МиБ, двоичный не-image. Фикстуры — во временном каталоге.
- [ ] **Step 2: Прогнать — падают.** **Step 3: Реализация.** **Step 4:** `cargo test -p gitspy-app` (перегенерация типов), ворота Rust.

---

### Task 3: Фронт — меню «+», чипы вложений, ⌘U

**Files:** `src/entities/agent/attachments.ts` (+тест), `src/entities/agent/index.ts`, `src/features/agent/session.ts` (+тест), `src/widgets/agent/AgentComposer.tsx` (+тест), `src/locales/en/common.json`, `src/ipc.ts`

**Interfaces:**
- Модульный стор вложений на сессию по образцу черновика: `attachedTo(id): string[]`, `attach(id, paths)`, `detach(id, path)`, `onAttached(id, cb)`.
- `sendPrompt(id, text)` шлёт `acpPrompt(id, text, attachedTo(id))` и очищает вложения после отправки.
- В сессии хранится `abilities: { image: boolean; embeddedContext: boolean } | null` из события.
- `AgentComposer`: кнопка `+` слева от чипов открывает меню:
  - `Add files or photos` (`⌘U`) → `open({ multiple: true })` из `@tauri-apps/plugin-dialog`;
  - `Add folder` → `open({ directory: true })`;
  - `Slash commands` → ставит `/` в черновик и открывает список.
  Пунктов «Connectors» и «Plugins» **нет**: это внутренние возможности Claude, через ACP их у нас нет, и рисовать неработающее нельзя.
- Приложенные пути — чипы над полем ввода: имя файла, `title` с полным путём, крестик снимает.
- `⌘U` работает, когда фокус в поле ввода.

- [ ] **Step 1: Падающие тесты:** меню открывает диалог и кладёт выбранное в чипы; крестик снимает вложение; отправка передаёт пути в `acpPrompt` и очищает список; `Slash commands` открывает список команд; пункта `Connectors` в меню нет.
- [ ] **Step 2: Прогнать — падают.** **Step 3: Реализация.** **Step 4:** ворота фронта.

---

### Task 4: Ворота и живая проверка

- [ ] **Step 1:** Полные ворота обеих сторон.
- [ ] **Step 2:** Расширить `src/dev/acpProbe.ts`: после открытия сессии отправить промпт с приложенным существующим файлом репозитория (`README.md` или `package.json`) и записать в отчёт, дошёл ли ход до `end_turn` и упомянул ли агент содержимое файла. Запуск вторым экземпляром на порту 5183 (`--no-watch`, предварительно `cargo build`), ждать `/tmp/gitspy-acp-probe.log`, убить только свои процессы.
- [ ] **Step 3:** Числа и факты — в отчёт.
