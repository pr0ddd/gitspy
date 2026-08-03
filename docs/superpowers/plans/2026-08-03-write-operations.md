# Операции записи: план работ

> Спека: `docs/superpowers/specs/2026-08-03-write-operations-design.md`.

**Цель:** приложение выполняет fetch, pull и push на машине, где git не
установлен, с сохранённым токеном и живым прогрессом.

**Подход:** git кладётся в ресурсы приложения и ищется раньше системного;
разбор прогресса общий на три операции; отказы push и merge узнаются чистой
функцией по тексту git.

**Стек:** Rust (tauri 2), TypeScript (React 19, shadcn), `dugite-native`.

## Общие ограничения

- Комментариев в коде нет.
- Пользовательских строк в Rust нет: коды и параметры.
- Порядок правок: сначала падающий тест, потом код.
- Флаги git, меняющие поведение слияния или удаляющие ссылки, от себя не
  подставляются: это конфигурация человека.

---

### Задача 1. Прогресс — один разбор на три операции

**Файлы:**
- Переименовать: `crates/gitspy-exec/src/clone.rs` → `progress.rs`
- Править: `crates/gitspy-exec/src/lib.rs`, `src-tauri/src/views.rs`

**Интерфейсы:**
- Отдаёт: `progress::{Stage, Step, parse, split_progress}`
- Ломает: `clone::Step` в `build_clone_step` — переименовать вслед

- [x] **Шаг 1: тест на стадию push**

```rust
#[test]
fn writing_objects_is_progress_too_because_push_reports_it() {
    assert_eq!(
        parse("Writing objects:  50% (1/2), 220 bytes | 220.00 KiB/s"),
        Some(Step { stage: Stage::Writing, percent: 50 })
    );
}
```

- [x] **Шаг 2: прогнать, убедиться, что падает**

```bash
cargo test -p gitspy-exec writing_objects
```
Ожидание: `no variant named Writing`.

- [x] **Шаг 3: добавить стадию и переименовать модуль**

`Stage::Writing` с кодом `progress.writing`, доля в шкале между
`Compressing` и `Receiving`. Существующий тест на монотонность шкалы должен
остаться зелёным без правок — если он покраснел, доли расставлены неверно.

- [x] **Шаг 4: прогнать весь крейт**

```bash
cargo test -p gitspy-exec
```

- [ ] **Шаг 5: коммит**

---

### Задача 2. Узнавание отказов

**Файлы:**
- Создать: `crates/gitspy-exec/src/refusal.rs`
- Править: `crates/gitspy-exec/src/lib.rs` — `Error::Failed` получает код

**Интерфейсы:**
- Отдаёт: `refusal::of(stderr: &str) -> Option<Refusal>`,
  `Refusal::{Rejected, Conflict}` с `code()`

- [x] **Шаг 1: тесты на настоящих строках git**

```rust
#[test]
fn a_rejected_push_is_named_rather_than_called_a_failure() {
    let stderr = " ! [rejected]        master -> master (non-fast-forward)\n\
                  error: failed to push some refs to 'github.com:pr0ddd/gitspy.git'";
    assert_eq!(of(stderr), Some(Refusal::Rejected));
}

#[test]
fn a_merge_conflict_is_a_state_of_the_repository_not_a_broken_command() {
    let stderr = "CONFLICT (content): Merge conflict in src/App.tsx\n\
                  Automatic merge failed; fix conflicts and then commit the result.";
    assert_eq!(of(stderr), Some(Refusal::Conflict));
}

#[test]
fn an_unknown_failure_stays_unknown_instead_of_being_guessed() {
    assert_eq!(of("fatal: not a git repository"), None);
}
```

- [x] **Шаг 2: прогнать, убедиться, что падает**

- [x] **Шаг 3: реализация**

```rust
pub fn of(stderr: &str) -> Option<Refusal> {
    if stderr.contains("[rejected]") && stderr.contains("non-fast-forward") {
        return Some(Refusal::Rejected);
    }
    if stderr.contains("CONFLICT (") || stderr.contains("Automatic merge failed") {
        return Some(Refusal::Conflict);
    }
    None
}
```

- [x] **Шаг 4: подключить к `Error::code()`**

`exec.rejected` и `exec.conflict` вместо `exec.failed`, сырой stderr остаётся
в `detail`.

- [x] **Шаг 5: ключи в `en` и `ru`**

- [ ] **Шаг 6: коммит**

---

### Задача 3. Операции в закрытом списке

**Файлы:**
- Править: `src-tauri/src/operations.rs`, `src-tauri/src/main.rs`
- Править: `crates/gitspy-exec/src/lib.rs` — запуск с токеном

**Интерфейсы:**
- `Operation` получает `Fetch`, `Pull`, `Push`, `PushSetUpstream { remote, branch }`
- `Git::run` получает `token: Option<&str>` — тот же `credential.helper`,
  что у клонирования, вынесенный в общий метод

- [x] **Шаг 1: тест на аргументы**

```rust
#[test]
fn fetch_does_not_prune_behind_the_users_back() {
    assert_eq!(Operation::Fetch.args(), ["fetch", "--all", "--progress"]);
}

#[test]
fn pull_carries_no_merge_flags_because_they_belong_to_the_config() {
    let args = Operation::Pull.args();
    assert!(!args.iter().any(|a| a.contains("rebase") || a.contains("ff")),
            "подставленный флаг тихо меняет поведение, настроенное человеком");
}

#[test]
fn a_branch_without_an_upstream_gets_one_named_explicitly() {
    let push = Operation::PushSetUpstream { remote: "origin".into(), branch: "master".into() };
    assert_eq!(push.args(), ["push", "--progress", "--set-upstream", "origin", "master"]);
}
```

- [x] **Шаг 2: прогнать, убедиться, что падает**

- [x] **Шаг 3: реализация операций и меток**

- [x] **Шаг 4: токен в запуск**

Вынести построение команды с `credential.helper` из `clone_into` в общий
приватный метод, вызвать его из `run`. Токен берётся из `hosts::token` только
для адресов своего хоста; для ssh не подставляется ничего.

- [x] **Шаг 5: прогон крейта и приложения**

```bash
cargo test -p gitspy-exec && cargo test -p gitspy-app
```

- [ ] **Шаг 6: коммит**

---

### Задача 4. Git внутри приложения

**Отложена в конец вехи** (решение 2026-08-03). Причина: точка подключения уже
стоит — `Git::at(path)` принимает любой путь, окружение строит
`env::environment`. Это упаковка, а не архитектура, и переставить её в конец
ничего не ломает.

Две неочевидности, чтобы не всплыли в последний день:

- одного бинаря мало: git ищет `git-remote-https`, `git-credential-*` и прочие
  вспомогательные программы в `libexec/git-core`, значит окружению нужен
  `GIT_EXEC_PATH`;
- на macOS вложенные бинари подписываются и нотаризуются вместе с приложением,
  иначе оно не запустится у людей.

**Файлы:**
- Создать: `scripts/fetch-git.mjs` — скачивание сборок `dugite-native`
- Править: `src-tauri/tauri.conf.json` — `bundle.resources`
- Править: `src-tauri/src/main.rs` — поиск вложенного бинаря
- Создать: `src-tauri/resources/git/LICENSE` и ссылку на исходники

**Интерфейсы:**
- `AppState::git()` ищет `resource_dir()/git/bin/git`, затем `PATH`

- [ ] **Шаг 1: тест на порядок поиска**

```rust
#[test]
fn a_bundled_git_wins_over_the_one_on_the_machine() {
    let dir = TempDir::new().expect("временный каталог");
    let bundled = dir.path().join("git");
    std::fs::write(&bundled, "").expect("файл");

    assert_eq!(
        preferred_git(Some(&bundled)),
        bundled,
        "иначе на машине без git приложение молча ничего не умеет"
    );
    assert_eq!(preferred_git(None), PathBuf::from("git"));
}
```

- [ ] **Шаг 2: прогнать, убедиться, что падает**

- [ ] **Шаг 3: реализация выбора**

- [ ] **Шаг 4: скачивание сборок**

`scripts/fetch-git.mjs` тянет релиз `dugite-native` под платформу в
`src-tauri/resources/git/`, проверяет контрольную сумму, кладёт рядом лицензию.
Каталог в git не хранится — он в `.gitignore`, как `node_modules`.

- [ ] **Шаг 5: замерить цену**

```bash
du -sh src-tauri/resources/git
```
Число записывается сюда, в план. Обещаний «несколько десятков мегабайт» без
измерения не остаётся.

- [ ] **Шаг 6: проверка на машине без git**

```bash
env PATH=/usr/bin:/bin cargo run -p gitspy-app
```
Ожидание: операции выполняются. Если `git` лежит в `/usr/bin`, для проверки
берётся пустой `PATH` с явным списком нужных каталогов.

- [ ] **Шаг 7: коммит**

---

### Задача 5. Панель действий оживает

**Файлы:**
- Править: `src/vocabulary.ts`, `src/shell/Toolbar.tsx`, `src/App.tsx`
- Править: `src/locales/*/common.json`

**Интерфейсы:**
- `Toolbar` знает про upstream из `WorkingTreeView` и выбирает Push или
  Push с upstream

- [x] **Шаг 1: upstream в контракт статуса**

`WorkingTreeView` получает `upstream: Option<String>` — из строки
`# branch.upstream` порциона v2. Тест на разбор: ветка без upstream даёт `None`.

- [x] **Шаг 2: кнопки**

Fetch, Pull, Push перестают быть заглушками. Push без upstream берёт
единственный remote; когда remote несколько — спрашивает.

- [x] **Шаг 3: прогресс в тосте**

Канал операции уже есть; шкала показывается тем же `Progress`, что и у
клонирования.

- [x] **Шаг 4: проверка**

```bash
npx tsc --noEmit && npx vitest run && npm run build
```

- [ ] **Шаг 5: живая проверка**

Fetch по этому репозиторию; push в ветку без upstream; push, который отклонят.

- [ ] **Шаг 6: коммит с числами**
