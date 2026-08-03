# Слежение за файлами: план работ

> Спека: `docs/superpowers/specs/2026-08-03-file-watching-design.md`.

**Цель:** правка файла меняет узел рабочего дерева без перечитывания истории,
а сборка в игнорируемый каталог не будит приложение вовсе.

---

### Задача 1. Фильтр игнорируемых путей

**Файлы:**
- Создать: `src-tauri/src/watcher/ignores.rs`
- Править: `src-tauri/Cargo.toml` — зависимость `ignore`

**Интерфейсы:**
- Отдаёт: `Ignores::at(repo) -> Ignores`, `Ignores::hides(&self, path) -> bool`

- [x] **Шаг 1: тесты на настоящем `.gitignore`**

```rust
#[test]
fn a_built_bundle_does_not_wake_the_application() {
    let dir = TempDir::new().expect("временный каталог");
    std::fs::write(dir.path().join(".gitignore"), "target/\nnode_modules/\n").expect("файл");

    let ignores = Ignores::at(dir.path());
    assert!(ignores.hides(&dir.path().join("target/debug/app")));
    assert!(!ignores.hides(&dir.path().join("src/main.rs")));
}

#[test]
fn the_git_directory_is_someone_elses_business() {
    let dir = TempDir::new().expect("временный каталог");
    assert!(Ignores::at(dir.path()).hides(&dir.path().join(".git/index")));
}
```

- [x] **Шаг 2: прогнать, убедиться, что падает**

- [x] **Шаг 3: реализация через крейт `ignore`**

- [x] **Шаг 4: прогон**

---

### Задача 2. Наблюдатель за рабочим деревом

**Файлы:**
- Править: `src-tauri/src/watcher.rs` → каталог `watcher/mod.rs`
- Править: `src-tauri/src/main.rs` — два события наружу

**Интерфейсы:**
- `Watchers::watch(repo, dirs, move |Change| ...)`
- `Change::{Git, WorkingTree}`

- [x] **Шаг 1: тест на разбор события**

```rust
#[test]
fn a_change_inside_the_git_directory_is_history_not_the_working_tree() {
    let repo = Path::new("/r");
    assert_eq!(what_changed(repo, Path::new("/r/.git/refs/heads/main")), Some(Change::Git));
    assert_eq!(what_changed(repo, Path::new("/r/src/App.tsx")), Some(Change::WorkingTree));
}

#[test]
fn a_lock_file_is_not_a_change_anybody_needs_to_see() {
    let repo = Path::new("/r");
    assert_eq!(what_changed(repo, Path::new("/r/.git/index.lock")), None);
}
```

- [x] **Шаг 2: прогнать, убедиться, что падает**

- [x] **Шаг 3: реализация**

- [x] **Шаг 4: события наружу**

`repo:changed` и `worktree:changed` с путём репозитория.

---

### Задача 3. Обновление узла без перечитывания истории

**Файлы:**
- Править: `src-tauri/src/main.rs`, `src-tauri/src/views.rs`

**Интерфейсы:**
- Команда `refresh_tip(repo) -> TipView { structureChanged: bool }`

- [x] **Шаг 1: тест на границу структуры**

```rust
#[test]
fn losing_the_working_tree_node_changes_the_shape_and_not_just_the_numbers() {
    assert!(structure_changed(true, false), "узел исчез — строк стало меньше");
    assert!(structure_changed(false, true), "узел появился — строк стало больше");
    assert!(!structure_changed(true, true), "поменялись только счётчики");
}
```

- [x] **Шаг 2: прогнать, убедиться, что падает**

- [x] **Шаг 3: реализация**

Пересчёт статуса, правка `nodes[0]` в открытой истории, флаг структуры наружу.

- [x] **Шаг 4: фронтенд**

`worktree:changed` → `refreshTip`; структура поменялась — полное
перечитывание, иначе перезапрос первого окна и обновление панели.

---

### Задача 4. Проверки

- [x] **Шаг 1: полный прогон**

```bash
cargo clippy --all-targets -- -D warnings && cargo test && npm run build
```

- [x] **Шаг 2: доказано тестом на настоящей файловой системе**

`an_edited_file_reaches_the_application_without_reopening_the_repository` пишет
файл и ждёт события; `a_build_into_an_ignored_folder_wakes_nobody` пишет двадцать
файлов в игнорируемый каталог и требует тишины. Первый прогон поймал ошибку: на
macOS временный каталог — симлинк, FSEvents отдаёт разрешённый путь, и он не
начинался с пути репозитория, поэтому всё уходило в перечитывание истории. Путь
разрешается один раз при заводе наблюдателя.

- [ ] **Шаг 3: живая проверка глазами**

Правка файла в редакторе меняет счётчик; `npm run build` не вызывает ничего;
коммит из терминала перечитывает историю.
