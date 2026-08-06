# Провайдеры, фаза A: рельсы + GitLab.com — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Трейт-поверхность Host без единого `if host == github`, полный стек GitLab.com (PKCE-вход, аккаунт, репы, MR, аватарки, кред-хелпер) на общих рельсах.

**Architecture:** `enum Host { GitHub, GitLab }` в gitspy-hosts с полной таблицей методов; подключения-список в storage; вход через единый `ConnectStart`; loopback 127.0.0.1:53682 для PKCE; склейка Tauri и фронт работают только через Host/ConnectStart.

**Tech Stack:** Rust (reqwest, sha2/base64 для PKCE, std TcpListener), ts-rs, React data-driven HostCard.

## Global Constraints

- Ни одного `if host == "github"` по завершении; `preferred_github_remote`, `GITHUB_URL`, проверка id в start_connect — удалены.
- Каждая клетка таблицы поверхности заполнена для GitHub и GitLab; contract-тесты одинаковым списком.
- Канон парсеров: чистые `parse_*` + фикстуры реальных ответов; комментариев в коде нет; проза тестов русская.
- Порт loopback фиксированный 53682; занят → `hosts.portBusy`.
- Карточек в Integrations в фазе A две (GitHub, GitLab): провайдер без работающего connect не рисуется.
- После каждой задачи: cargo test + clippy + vitest + tsc + boundary зелёные, коммит.

---

### Task 1: matches_remote

**Files:** Modify `crates/gitspy-hosts/src/remote.rs` (+тесты в нём же).

**Produces:** `pub fn matches_remote(remotes: &[(String, String)], base_url: &str) -> Option<(String, String)>` — (owner, name) первого remote, чей хост совпадает с хостом base_url; понимает https и ssh (`git@host:owner/name.git`). `preferred_github_remote` пока остаётся (умрёт в Task 8).

- [ ] Тест: https/ssh формы, self-hosted хост `https://git.corp.dev`, чужой хост → None, `origin` предпочтительнее прочих.
- [ ] Реализация; `cargo test -p gitspy-hosts` PASS; commit `"matches_remote: one host-matching function for every provider"`.

### Task 2: Подключения-список в storage

**Files:** Modify `src-tauri/src/hosts/storage.rs`.

**Produces:** `Connection { id: String, kind: HostKind, base_url: String, login: String }`, `HostKind { GitHub, GitLab }` (+serde); `load_connections(dir) -> Vec<Connection>`, `save_connections`, миграция: старый одиночный github-аккаунт читается как `Connection{id:"github", kind:GitHub, base_url:"https://github.com", ...}`.

- [ ] Тест миграции старого формата + roundtrip нового.
- [ ] Реализация; commit `"Connections become a list with kind and base_url"`.

### Task 3: PKCE и authorize-URL

**Files:** Create `crates/gitspy-hosts/src/pkce.rs`; deps `sha2`, `rand` уже? — добавить в Cargo.toml gitspy-hosts (`sha2`, base64 уже есть через reqwest? нет — добавить `base64`).

**Produces:** `pub fn verifier() -> String` (43–128 url-safe), `pub fn challenge(verifier: &str) -> String` (S256), `pub fn authorize_url(base_url, client_id, redirect, challenge, state) -> String`.

- [ ] Тест: challenge на векторе RFC 7636 (`dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk` для известного verifier), verifier в допустимом алфавите/длине, authorize_url содержит response_type=code и code_challenge_method=S256.
- [ ] Реализация; commit `"PKCE primitives with the RFC 7636 vector"`.

### Task 4: gitlab.rs — парсеры и клиент

**Files:** Create `crates/gitspy-hosts/src/gitlab.rs`, фикстуры в `crates/gitspy-hosts/tests/fixtures/gitlab/*.json`, contract-тесты `crates/gitspy-hosts/tests/gitlab.rs`.

**Produces:** `pub const ID: &str = "gitlab"`, `GitLab::new(base_url)`, методы: `authorize(verifier→url)`, `exchange_code(code, verifier, redirect) -> Token{access, refresh}` (эндпоинт `/oauth/token`, PKCE без секрета), `account(token)`, `repos(token, pages)` (`/api/v4/projects?membership=true&order_by=last_activity_at`), `pulls(token, owner, name)` (MR API, маппинг в PullSummary: iid→number, source_branch→head_branch, author.username), `pull_detail`, `pull_comments` (notes, системные отфильтрованы), `commit_author(token, owner, name, hash)` (`/repository/commits/:sha` → email + `/avatar?email=` → url), `commit_avatars(...)` (страница коммитов + avatar-эндпоинт), `classify` статусов (401→unauthorized, 429→rateLimited c Retry-After).

- [ ] Contract-тесты тем же списком, что github (см. tests/github-фикстуры): parse_account, parse_repos, parse_pulls, parse_pull_detail, parse_comments, parse_avatar, classify 401/403/429. Фикстуры — реальные формы ответов GitLab v4.
- [ ] Реализация парсеров и клиента; commit `"GitLab provider: parsers and client on the github canon"`.

### Task 5: enum Host — общая поверхность

**Files:** Create `crates/gitspy-hosts/src/host.rs`; Modify `lib.rs` (реэкспорт), `github.rs` (метод credential()).

**Produces:**

```rust
pub enum Host { GitHub(github::GitHub), GitLab(gitlab::GitLab) }
pub struct HostCredential { pub url: String, pub username: &'static str }
pub enum ConnectStart {
  DeviceCode { user_code: String, verification_uri: String },
  BrowserAuth { url: String },
  TokenForm { needs_base_url: bool },
}
impl Host {
  pub fn for_connection(kind, base_url) -> Result<Host, Error>;
  pub async fn account(&self, token) -> Result<Account, Error>;
  pub async fn repos(&self, token, pages) -> Result<Vec<Repo>, Error>;
  pub async fn pulls/pull_detail/pull_comments(...);
  pub async fn commit_author/commit_avatars(...);
  pub fn credential(&self) -> HostCredential;   // github: x-access-token@base, gitlab: oauth2@base
}
```

- [ ] Тест: `credential()` обеих веток; `for_connection` строит правильный вариант по kind+base_url.
- [ ] Реализация делегирующего impl; commit `"Host enum: the one surface every provider fills"`.

### Task 6: loopback-слушатель

**Files:** Create `src-tauri/src/hosts/loopback.rs`.

**Produces:** `pub fn parse_callback(request_line: &str) -> Option<(String, String)>` (code, state из `GET /callback?code=..&state=.. HTTP/1.1`) — чистая, с тестами; `pub fn listen_once(state: String) -> Result<Receiver<String>, Error>` — TcpListener 127.0.0.1:53682, один запрос: state совпал → отдать HTML «можно закрыть вкладку» (i18n не нужен — страница техническая, текст английский в константе допустим? НЕТ: строк пользователю в коде нет — HTML-страница браузера не наш UI-каталог, это ответ сервера; текст английский константой, вне i18n-правила приложения), вернуть code через канал; порт занят → `hosts.portBusy`.

- [ ] Тест parse_callback: валидный, без code, чужой путь, битый percent-encoding.
- [ ] Реализация; commit `"Loopback listener for the PKCE redirect"`.

### Task 7: склейка Tauri через Host

**Files:** Modify `src-tauri/src/hosts/mod.rs`, `src-tauri/src/avatars.rs`, `src-tauri/src/repo_commands.rs` (run_operation), `src-tauri/src/views.rs` (+ConnectionView, ConnectStartView с TS-экспортом), main.rs (новые команды).

**Produces:** команды `connections() -> Vec<ConnectionView>`, `start_connect(host)` → ConnectStartView (github: device как сейчас; gitlab: verifier+state в state-мапе, loopback, browser url; по приходу кода — exchange, save token+connection, событие hostConnected); `disconnect_host(host)` для любого id; `host_account/host_repos/pull_requests/pull_card` через Host; `hosts::credential_for(app, remotes) -> Option<gitspy_exec::Credential-подобного>` по matches_remote; avatars.rs через Host. Удаляются: `GITHUB_URL`, `preferred_github_remote`, проверка `host != github`.

- [ ] Существующие тесты hosts/mod.rs (waiting) адаптируются; новый тест credential_for: remote github → github-подключение, gitlab-remote → gitlab, чужой → None (на подставном списке подключений).
- [ ] `git grep -n "preferred_github_remote\|GITHUB_URL\|!= github"` — пусто.
- [ ] commit `"Tauri glue speaks Host: no provider ifs left"`.

### Task 8: client_id GitLab

Регистрация приложения на gitlab.com — действие пользователя (Redirect URI `http://127.0.0.1:53682/callback`, scopes `api`, Confidential выкл). До получения id: `pub const CLIENT_ID: &str = ""` в gitlab.rs; `start_connect("gitlab")` при пустом id возвращает ошибку `hosts.notConfigured` — карточка честно показывает «требуется настройка сборки». Получив id — вписать, проверить живой вход.

### Task 9: фронтенд — HostCard и источники

**Files:** Modify `src/ipc.ts` (connections, generic connect), `src/types.ts`, `src/widgets/Settings.tsx` (GitHubSection → универсальный HostCard×2), `src/widgets/StartPage.tsx` (источники из connections), `src/app/App.tsx` (account-состояние → по подключениям), локали.

**Produces:** `HostCard {kind, connection | null, onConnect, onDisconnect}` рендерит DeviceCode (код+ссылка, как сейчас), BrowserAuth (кнопка «Открыть браузер» + ожидание), TokenForm (поля по needs_base_url — задел фазы C, рендер есть, для gitlab.com не показывается); тест: все три вида из данных.

- [ ] vitest на HostCard三 вида; Settings-тест обновлён; StartPage источники по подключениям (github + gitlab).
- [ ] commit `"Integrations render provider cards from data"`.

### Task 10: финал фазы

- [ ] `npm run build`, `cargo test`, `cargo clippy -- -D warnings` зелёные; `git grep` по спецслучаям пуст; CLAUDE.md — абзац про Host-рельсы в разделе операций/хостов.
- [ ] Пуш ветки; тег не резать.
