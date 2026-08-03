# Интеграции с хостами: план работ

> Спека: `docs/superpowers/specs/2026-08-02-host-integrations-design.md`.
> Шаги отмечаются чекбоксами по мере выполнения.

**Цель:** подключение GitHub доводится до конца независимо от фронтенда, аккаунт
живёт в одном месте, команды хостов и клонирования вынесены из `main.rs`.

**Подход:** ожидание подтверждения — фоновая задача Rust с событиями наружу;
состояние хостов — своя структура под `manage`; во фронтенде аккаунт хранит
`App` и раздаёт свойствами.

**Стек:** Rust (tauri 2, reqwest), TypeScript (React 19, shadcn).

## Уже стоит и не переделывается

- `crates/gitspy-hosts`: device flow, разбор аккаунта, списка репозиториев и
  аватарок, файловое хранилище секретов `Files` — 28 тестов.
- `crates/gitspy-exec`: `clone_into` с живым прогрессом, `clone::parse` —
  29 тестов плюс 2 интеграционных против настоящего git.
- Интерфейс: `CloneDialog`, `HostRepos`, колонка на стартовой странице.

## Общие ограничения

- Комментариев в коде нет — ни `//`, ни `///`, ни `/* */`.
- Идентификаторы английские, проза в `assert` и коммитах русская.
- Пользовательских строк в Rust нет: только коды ошибок и параметры.
- `invoke` только в `src/ipc.ts`; типы границы генерируются из Rust.
- Файлы правятся редактором, а не подстановками из скрипта.

---

### Задача 1. Хосты — свой модуль со своим состоянием

**Файлы:**
- Создать: `src-tauri/src/hosts/mod.rs`, `src-tauri/src/hosts/storage.rs`
- Удалить: `src-tauri/src/hosts.rs` (переезжает в `storage.rs`)
- Править: `src-tauri/src/main.rs` — снять команды хостов, поля `accounts`
  и `listings` из `AppState`, добавить `.manage(hosts::Hosts::default())`

**Интерфейсы:**
- Отдаёт наружу: `hosts::Hosts` (состояние), `hosts::token(&AppHandle, &str)`,
  команды `start_connect`, `host_account`, `host_repos`, `disconnect_host`
- Использует: `views::{build_account, build_device, build_repo_listing}`,
  `data_dir` — переезжает в `hosts::storage` как параметр, а не импорт из main

- [x] **Шаг 1: перенести хранилище**

`src-tauri/src/hosts/storage.rs` — прежний `hosts.rs` без изменений плюс
чтение токена:

```rust
use gitspy_hosts::secrets::{Files, Secrets};

pub fn secrets(dir: &Path) -> Files {
    Files::at(dir)
}
```

- [x] **Шаг 2: состояние хостов**

```rust
#[derive(Default)]
pub struct Hosts {
    accounts: Mutex<HashMap<String, Account>>,
    listings: Mutex<HashMap<String, Vec<Repo>>>,
    connecting: Mutex<HashMap<String, Device>>,
}
```

Кэш аккаунтов и списков больше не поля `AppState`: у графа и у хостов нет
общего состояния, и делить его нечего.

- [x] **Шаг 3: перенести команды**

Тела команд переезжают как есть, `State<'_, AppState>` меняется на
`State<'_, Hosts>`, обращения к `state.accounts` остаются теми же.

- [x] **Шаг 4: сборка и типы**

```bash
cargo build -p gitspy-app && cargo test -p gitspy-app
```
Ожидание: сборка чистая, `src/generated` не изменился.

- [ ] **Шаг 5: коммит**

```bash
git add src-tauri/src && git commit -m "Хосты переезжают в свой модуль"
```

---

### Задача 2. Подтверждение ждёт бэкенд

**Файлы:**
- Править: `src-tauri/src/hosts/mod.rs`
- Править: `src/ipc.ts`, `src/shell/Settings.tsx`

**Интерфейсы:**
- Отдаёт: событие `host:connected` с `AccountView`, событие `host:failed`
  с `ErrorView`
- Убирает: команда `finish_connect` перестаёт существовать

- [x] **Шаг 1: тест на повторное нажатие**

```rust
#[test]
fn a_second_press_joins_the_waiting_instead_of_asking_for_another_code() {
    let hosts = Hosts::default();
    let device = Device { device_code: "dc".into(), user_code: "AAAA".into(),
                          verification_uri: "u".into(), interval: 5, expires_in: 900 };

    assert_eq!(hosts.already_waiting("github"), None);
    hosts.wait_for("github", device.clone());
    assert_eq!(
        hosts.already_waiting("github").map(|d| d.user_code),
        Some("AAAA".to_string()),
        "иначе десять нажатий заводят десять опросов github"
    );
}
```

- [x] **Шаг 2: прогнать, убедиться, что падает**

```bash
cargo test -p gitspy-app already_waiting
```
Ожидание: `no method named already_waiting`.

- [x] **Шаг 3: методы состояния**

```rust
impl Hosts {
    pub fn already_waiting(&self, host: &str) -> Option<Device> {
        self.connecting.lock().ok()?.get(host).cloned()
    }

    pub fn wait_for(&self, host: &str, device: Device) {
        if let Ok(mut waiting) = self.connecting.lock() {
            waiting.insert(host.to_string(), device);
        }
    }

    pub fn stop_waiting(&self, host: &str) {
        if let Ok(mut waiting) = self.connecting.lock() {
            waiting.remove(host);
        }
    }
}
```

- [x] **Шаг 4: команда отдаёт код и уходит**

```rust
#[tauri::command]
pub async fn start_connect(
    host: String,
    app: tauri::AppHandle,
    hosts: State<'_, Hosts>,
) -> Result<DeviceView, ErrorView> {
    only_known(&host)?;
    if let Some(device) = hosts.already_waiting(&host) {
        return Ok(build_device(device));
    }

    let client = GitHub::new().map_err(host_error)?;
    let device = client.ask_for_device().await.map_err(host_error)?;
    hosts.wait_for(&host, device.clone());

    let _ = OpenerExt::opener(&app).open_url(&device.verification_uri, None::<&str>);

    let waiting = device.clone();
    let waited_host = host.clone();
    let notify = app.clone();
    tauri::async_runtime::spawn(async move {
        let outcome = keep_the_token(&waited_host, waiting, &notify).await;
        if let Some(hosts) = notify.try_state::<Hosts>() {
            hosts.stop_waiting(&waited_host);
        }
        let _ = match outcome {
            Ok(account) => notify.emit("host:connected", account),
            Err(error) => notify.emit("host:failed", error),
        };
    });

    Ok(build_device(device))
}
```

- [x] **Шаг 5: снять `finish_connect`**

Убрать команду, `read_device`, `DeviceView` из `Deserialize` (обратно в
`Serialize`), и `finishConnect` из `src/ipc.ts`.

- [x] **Шаг 6: подписка во фронтенде**

```ts
export const onHostConnected = (handler: (account: AccountView) => void) =>
  listen<AccountView>('host:connected', (event) => handler(event.payload));

export const onHostFailed = (handler: (error: ErrorView) => void) =>
  listen<ErrorView>('host:failed', (event) => handler(event.payload));
```

- [ ] **Шаг 7: проверить руками**

Нажать «Подключить», подтвердить в браузере, **перезагрузить страницу до
подтверждения** — аккаунт всё равно появляется. Файл токена на диске:

```bash
ls -l ~/Library/Application\ Support/dev.gitspy.app/
```
Ожидание: `github.token` с правами `-rw-------`.

- [ ] **Шаг 8: коммит**

---

### Задача 3. Один владелец аккаунта во фронтенде

**Файлы:**
- Править: `src/App.tsx`, `src/shell/Settings.tsx`, `src/shell/HostRepos.tsx`

**Интерфейсы:**
- `Settings` получает `account: AccountView | null`, `onDisconnected: () => void`
- `HostRepos` получает `account: AccountView | null`, `onConnect: () => void`
- Ни один из них больше не зовёт `hostAccount`

- [x] **Шаг 1: состояние в `App`**

```tsx
const [account, setAccount] = useState<AccountView | null>(null);

useEffect(() => {
  ipc.hostAccount('github').then(setAccount).catch(() => undefined);
  const connected = ipc.onHostConnected(setAccount);
  const failed = ipc.onHostFailed(notifyError);
  return () => {
    void connected.then((off) => off());
    void failed.then((off) => off());
  };
}, []);
```

- [x] **Шаг 2: снять локальное состояние у обоих компонентов**

В `Settings` остаётся только `device` (показать код) и `busy`.
В `HostRepos` — только `repos`, `query`, `busy`, `failed`.

- [x] **Шаг 3: список едет за аккаунтом**

```tsx
useEffect(() => {
  if (!account) return setRepos([]);
  ipc.hostRepos('github', false).then(setRepos).catch(() => setFailed(true));
}, [account]);
```
Подключение в диалоге теперь наполняет колонку само.

- [x] **Шаг 4: проверка**

```bash
npx tsc --noEmit && npx vitest run && npx vite build
```

- [ ] **Шаг 5: коммит**

---

### Задача 4. Клонирование и создание — свой модуль

**Файлы:**
- Создать: `src-tauri/src/clone.rs`
- Править: `src-tauri/src/main.rs`, `src/shell/StartPage.tsx`, `src/App.tsx`
- Тест: `crates/gitspy-exec/tests/clone.rs`

**Интерфейсы:**
- Отдаёт: команды `clone_repo`, `default_clone_dir`, `init_repo`
- Использует: `hosts::token(&app, github::ID)` — единственная связь с хостами

- [x] **Шаг 1: тест на создание репозитория**

```rust
#[test]
fn init_makes_a_repository_where_there_was_none() {
    let dir = TempDir::new().expect("временный каталог");
    Git::discover().expect("git найден").init(dir.path()).expect("создаётся");
    assert!(dir.path().join(".git").exists());
}
```

- [x] **Шаг 2: прогнать, убедиться, что падает**

```bash
cargo test -p gitspy-exec init_makes
```
Ожидание: `no method named init`.

- [x] **Шаг 3: реализация**

```rust
pub fn init(&self, path: &Path) -> Result<(), Error> {
    self.read(path, &["init"]).map(|_| ())
}
```
Ветку по умолчанию не навязываем: её задаёт `init.defaultBranch` у человека.

- [x] **Шаг 4: команда**

```rust
#[tauri::command]
pub async fn init_repo(path: String, state: State<'_, AppState>) -> Result<String, ErrorView> {
    let git = state.git()?;
    let at = PathBuf::from(&path);
    if at.join(".git").exists() {
        return Err(ErrorView::new("init.taken").param("path", &path));
    }
    tauri::async_runtime::spawn_blocking(move || git.init(&at).map_err(exec_error))
        .await
        .map_err(|e| ErrorView::new("app.readerThread").detail(e.to_string()))??;
    Ok(path)
}
```

- [x] **Шаг 5: кнопка «Создать» перестаёт быть заглушкой**

Выбор папки системным диалогом, `initRepo`, затем открыть как репозиторий.
Снять `Tooltip` с `start.needsOperations`.

- [x] **Шаг 6: ключи ошибок**

`init.taken` в `en` и `ru`.

- [ ] **Шаг 7: проверка и коммит**

```bash
cargo clippy --all-targets -- -D warnings && cargo test && npm run build
```

---

### Задача 5. Сомкнуть проверки

- [x] **Шаг 1: полный прогон**

```bash
cargo fmt --all && cargo clippy --all-targets -- -D warnings
cargo test
npm run build
```

- [ ] **Шаг 2: живая проверка**

Подключить аккаунт, склонировать публичный и приватный репозиторий, отключить
аккаунт, убедиться, что `github.token` и `host-github.json` исчезли.

- [ ] **Шаг 3: коммит с числами**

Сообщение — что было сломано, почему и чем подтверждено.
