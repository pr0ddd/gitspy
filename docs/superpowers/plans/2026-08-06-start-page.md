# Главная страница: избранное, срезы, паспорт — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** StartPage по согласованному мокапу: рейка-срезы (All / Favorites / аккаунты), большой поиск, строка с звездой, иконкой источника и чипом ветки.

**Architecture:** Избранное — флаг в `RecentRepo` (`recent.rs`). Паспорт (ветка + хост origin) — новые чтения в `gitspy-exec` и команда в `src-tauri`, фронтенд дозаполняет строки после рендера. Логика срезов/секций — чистые функции с тестами. Спека: `docs/superpowers/specs/2026-08-06-start-page-design.md`.

**Tech Stack:** Rust (gitspy-exec, gitspy-hosts, tauri), ts-rs генерация типов, React + parts.tsx + токены.

## Global Constraints

- Комментариев в коде нет; проза тестов русская, идентификаторы английские.
- Коммиты по-английски, без трейлеров.
- Никаких частных стилей: `ListRow` (у него уже есть `tall`), `SectionHeader`, `NavItem`, `InlineNote` из `parts.tsx`; варианты `cva`; цвета — токены; иконки через `src/icons.ts` (`github`, `gitlab`, `bitbucket`, `folder` уже есть).
- Тексты — только ключи i18n (`src/locales/en/common.json`).
- `invoke` — только в `src/ipc.ts`.
- Генерация типов границы: `cargo test -p gitspy-app` пишет `src/generated/`, `npm run boundary:check` сверяет.
- Прогоны: `cargo test -p <crate>`, `npx vitest run`, полная сборка `npm run build`.

---

### Task 1: Избранное в recent.rs

**Files:**
- Modify: `src-tauri/src/recent.rs`
- Modify: `src-tauri/src/repo_commands.rs` (рядом с `forget_repo`, ~строка 717)
- Modify: `src-tauri/src/main.rs:36` (регистрация команды)
- Modify: `src/ipc.ts` (рядом с `recentRepos`)

**Interfaces:**
- Produces: `RecentRepo` получает поле `favorite: bool` (`#[serde(default)]`); `recent::favorite(dir: &Path, path: &str, on: bool) -> Vec<RecentRepo>`; tauri-команда `favorite_repo(path: String, on: bool)` → обновлённый список; `ipc.favoriteRepo(path: string, on: boolean): Promise<RecentRepo[]>`.

- [ ] **Step 1: Падающие тесты в recent.rs**

Дописать в `mod tests`:

```rust
#[test]
fn favorite_survives_reopening_the_repository() {
    let dir = tempfile::tempdir().expect("временный каталог");
    remember(dir.path(), "/one");
    favorite(dir.path(), "/one", true);
    remember(dir.path(), "/one");
    assert!(
        list(dir.path())[0].favorite,
        "повторное открытие не должно снимать звезду"
    );
}

#[test]
fn favorite_toggles_both_ways() {
    let dir = tempfile::tempdir().expect("временный каталог");
    remember(dir.path(), "/one");
    assert!(favorite(dir.path(), "/one", true)[0].favorite);
    assert!(!favorite(dir.path(), "/one", false)[0].favorite);
}

#[test]
fn favorites_are_not_evicted_by_the_limit() {
    let dir = tempfile::tempdir().expect("временный каталог");
    remember(dir.path(), "/keep");
    favorite(dir.path(), "/keep", true);
    for i in 0..30 {
        remember(dir.path(), &format!("/r{i}"));
    }
    assert!(
        list(dir.path()).iter().any(|e| e.path == "/keep"),
        "звезда обязана защищать запись от вытеснения из хвоста"
    );
}
```

- [ ] **Step 2: Убедиться, что падают**

Run: `cargo test -p gitspy-app recent`
Expected: FAIL — `favorite` не существует / поле отсутствует.

- [ ] **Step 3: Реализация**

В `RecentRepo` добавить поле (после `exists`):

```rust
    #[serde(default)]
    pub favorite: bool,
```

`remember` сохраняет звезду и не вытесняет избранных:

```rust
pub fn remember(dir: &Path, path: &str) -> Vec<RecentRepo> {
    let mut entries = stored(dir);
    let starred = entries
        .iter()
        .find(|e| e.path == path)
        .is_some_and(|e| e.favorite);
    entries.retain(|e| e.path != path);
    entries.insert(
        0,
        RecentRepo {
            path: path.to_string(),
            name: name_of(path),
            opened_at: now(),
            exists: true,
            favorite: starred,
        },
    );
    let mut spare = LIMIT;
    entries.retain(|e| {
        if e.favorite {
            return true;
        }
        if spare == 0 {
            return false;
        }
        spare -= 1;
        true
    });
    save(dir, &entries);
    with_existence(entries)
}

pub fn favorite(dir: &Path, path: &str, on: bool) -> Vec<RecentRepo> {
    let mut entries = stored(dir);
    for entry in &mut entries {
        if entry.path == path {
            entry.favorite = on;
        }
    }
    save(dir, &entries);
    with_existence(entries)
}
```

Команда в `repo_commands.rs`:

```rust
#[tauri::command]
pub fn favorite_repo(
    path: String,
    on: bool,
    app: tauri::AppHandle,
) -> Result<Vec<recent::RecentRepo>, ErrorView> {
    Ok(recent::favorite(&data_dir(&app)?, &path, on))
}
```

В `main.rs` рядом с `repo_commands::forget_repo,` добавить `repo_commands::favorite_repo,`.

- [ ] **Step 4: Тесты зелёные, типы перегенерены**

Run: `cargo test -p gitspy-app recent && npm run boundary:check`
Expected: PASS; `src/generated/RecentRepo.ts` получил `favorite: boolean` и закоммичен вместе с правкой.

- [ ] **Step 5: ipc.ts**

Рядом с `recentRepos`:

```ts
export const favoriteRepo = (path: string, on: boolean) =>
  invoke<RecentRepo[]>('favorite_repo', { path, on });
```

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/recent.rs src-tauri/src/repo_commands.rs src-tauri/src/main.rs src/ipc.ts src/generated/RecentRepo.ts
git commit -m "Recent list learns favorites: flag, toggle command, eviction shield"
```

---

### Task 2: Паспорт репозитория (ветка + хост origin)

**Files:**
- Modify: `crates/gitspy-exec/src/lib.rs` (impl Git, рядом с `fn read`, ~строка 200)
- Create: `crates/gitspy-exec/tests/passport.rs`
- Modify: `crates/gitspy-hosts/src/remote.rs` (`host_of_url` становится pub)
- Modify: `src-tauri/src/views.rs` (новая вьюха)
- Modify: `src-tauri/src/repo_commands.rs`, `src-tauri/src/main.rs`
- Modify: `src/ipc.ts`, `src/types.ts` (переэкспорт)

**Interfaces:**
- Consumes: `Git::discover()`, приватный `fn read`; `gitspy_hosts::remote::host_of_url(url) -> Option<String>`.
- Produces: `Git::head_branch(&self, repo: &Path) -> Result<Option<String>, Error>`; `Git::origin_url(&self, repo: &Path) -> Result<Option<String>, Error>`; `RepoPassportView { path: String, branch: Option<String>, host: Option<String> }` (host — hostname из origin, например `github.com`); команда `repo_passports(paths: Vec<String>)` → `Vec<RepoPassportView>`; `ipc.repoPassports(paths: string[]): Promise<RepoPassportView[]>`.

- [ ] **Step 1: Падающий интеграционный тест**

`crates/gitspy-exec/tests/passport.rs` — фикстуры настоящим git по образцу `tests/status.rs` (та же обвязка `run`/`write`/`repo`/`git`):

```rust
use gitspy_exec::Git;
use std::path::Path;
use std::process::Command;
use tempfile::TempDir;

fn run(dir: &Path, args: &[&str]) -> String {
    let out = Command::new("git")
        .arg("-C")
        .arg(dir)
        .args(args)
        .env("GIT_CONFIG_GLOBAL", "/dev/null")
        .env("GIT_CONFIG_SYSTEM", "/dev/null")
        .env("GIT_AUTHOR_NAME", "Test")
        .env("GIT_AUTHOR_EMAIL", "test@example.com")
        .env("GIT_COMMITTER_NAME", "Test")
        .env("GIT_COMMITTER_EMAIL", "test@example.com")
        .output()
        .expect("git запускается");
    String::from_utf8_lossy(&out.stdout).trim().to_string()
}

fn repo() -> TempDir {
    let dir = TempDir::new().expect("временный каталог");
    run(dir.path(), &["init", "-b", "main"]);
    std::fs::write(dir.path().join("a.txt"), "a\n").expect("файл");
    run(dir.path(), &["add", "-A"]);
    run(dir.path(), &["commit", "-m", "start"]);
    dir
}

fn git() -> Git {
    Git::discover().expect("git найден")
}

#[test]
fn head_branch_matches_symbolic_ref() {
    let dir = repo();
    let ours = git().head_branch(dir.path()).expect("ветка читается");
    let truth = run(dir.path(), &["symbolic-ref", "--short", "HEAD"]);
    assert_eq!(ours.as_deref(), Some(truth.as_str()));
}

#[test]
fn detached_head_has_no_branch() {
    let dir = repo();
    let head = run(dir.path(), &["rev-parse", "HEAD"]);
    run(dir.path(), &["checkout", "--detach", &head]);
    assert_eq!(git().head_branch(dir.path()).expect("читается"), None);
}

#[test]
fn origin_url_is_read_and_absent_without_remote() {
    let dir = repo();
    assert_eq!(git().origin_url(dir.path()).expect("читается"), None);
    run(
        dir.path(),
        &["remote", "add", "origin", "git@github.com:me/tool.git"],
    );
    assert_eq!(
        git().origin_url(dir.path()).expect("читается").as_deref(),
        Some("git@github.com:me/tool.git")
    );
}
```

- [ ] **Step 2: Убедиться, что падает**

Run: `cargo test -p gitspy-exec --test passport`
Expected: FAIL — методов нет.

- [ ] **Step 3: Реализация в gitspy-exec**

В `impl Git` рядом с `fn read`:

```rust
pub fn head_branch(&self, repo: &Path) -> Result<Option<String>, Error> {
    match self.read(repo, &["symbolic-ref", "--short", "-q", "HEAD"]) {
        Ok(raw) => Ok(Some(raw.trim().to_string()).filter(|s| !s.is_empty())),
        Err(Error::Failed { .. }) => Ok(None),
        Err(e) => Err(e),
    }
}

pub fn origin_url(&self, repo: &Path) -> Result<Option<String>, Error> {
    match self.read(repo, &["config", "--get", "remote.origin.url"]) {
        Ok(raw) => Ok(Some(raw.trim().to_string()).filter(|s| !s.is_empty())),
        Err(Error::Failed { .. }) => Ok(None),
        Err(e) => Err(e),
    }
}
```

Run: `cargo test -p gitspy-exec --test passport`
Expected: PASS.

- [ ] **Step 4: host_of_url наружу**

В `crates/gitspy-hosts/src/remote.rs` заменить `fn host_of_url` на `pub fn host_of_url` и дописать тест в его `mod tests`:

```rust
#[test]
fn host_of_url_reads_every_remote_syntax() {
    assert_eq!(
        host_of_url("git@github.com:me/tool.git").as_deref(),
        Some("github.com")
    );
    assert_eq!(
        host_of_url("https://gitlab.corp.dev/me/tool.git").as_deref(),
        Some("gitlab.corp.dev")
    );
    assert_eq!(host_of_url("/local/path"), None);
}
```

Run: `cargo test -p gitspy-hosts remote`
Expected: PASS.

- [ ] **Step 5: Вьюха и команда**

`src-tauri/src/views.rs` по образцу соседних `#[derive(TS)]`-структур:

```rust
#[derive(Serialize, Clone, TS)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub struct RepoPassportView {
    pub path: String,
    pub branch: Option<String>,
    pub host: Option<String>,
}
```

`repo_commands.rs` (git берётся так же, как в соседних командах со `state`; ошибка по одному пути не валит соседей — путь просто отдаёт пустой паспорт):

```rust
#[tauri::command]
pub async fn repo_passports(paths: Vec<String>) -> Result<Vec<RepoPassportView>, ErrorView> {
    tauri::async_runtime::spawn_blocking(move || {
        let git = Git::discover().map_err(exec_error)?;
        Ok(paths
            .into_iter()
            .map(|path| {
                let at = Path::new(&path);
                let branch = git.head_branch(at).ok().flatten();
                let host = git
                    .origin_url(at)
                    .ok()
                    .flatten()
                    .and_then(|url| gitspy_hosts::remote::host_of_url(&url));
                RepoPassportView { path, branch, host }
            })
            .collect())
    })
    .await
    .map_err(|_| state_lock_failed())?
}
```

Точные имена хелперов (`exec_error`, `state_lock_failed`, способ получить `Git`) сверить с соседними командами файла и использовать их же. Зарегистрировать `repo_commands::repo_passports,` в `main.rs`.

- [ ] **Step 6: Генерация типов и ipc**

Run: `cargo test -p gitspy-app && npm run boundary:check`
Expected: появился `src/generated/RepoPassportView.ts`, сборка зелёная. В `src/types.ts` добавить переэкспорт по образцу соседних. В `src/ipc.ts`:

```ts
export const repoPassports = (paths: string[]) =>
  invoke<RepoPassportView[]>('repo_passports', { paths });
```

- [ ] **Step 7: Commit**

```bash
git add crates/gitspy-exec crates/gitspy-hosts src-tauri/src src/ipc.ts src/types.ts src/generated
git commit -m "Repo passport: branch and origin host without opening the repo"
```

---

### Task 3: Чистая модель среза и секций

**Files:**
- Create: `src/features/repo/startPage.ts`
- Test: `src/features/repo/startPage.test.ts`
- Modify: `src/features/repo/index.ts`

**Interfaces:**
- Produces:
  `splitRecent(recent: RecentRepo[], filter: string): { favorites: RecentRepo[]; rest: RecentRepo[] }` — фильтр по имени без регистра; избранные не повторяются в rest;
  `hostKindOf(host: string | null | undefined): 'github' | 'gitlab' | 'bitbucket' | 'other' | null`.

- [ ] **Step 1: Падающий тест**

`src/features/repo/startPage.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { hostKindOf, splitRecent } from './startPage';
import type { RecentRepo } from '@/types';

const entry = (path: string, favorite = false): RecentRepo => ({
  path,
  name: path.split('/').pop() ?? path,
  openedAt: 1,
  exists: true,
  favorite,
});

describe('срез недавних на секции', () => {
  it('избранное не повторяется в недавних', () => {
    const { favorites, rest } = splitRecent([entry('/a', true), entry('/b')], '');
    expect(favorites.map((e) => e.path)).toEqual(['/a']);
    expect(rest.map((e) => e.path)).toEqual(['/b']);
  });

  it('фильтр режет обе секции и не смотрит на регистр', () => {
    const { favorites, rest } = splitRecent(
      [entry('/Alpha', true), entry('/beta'), entry('/Alps')],
      'al',
    );
    expect(favorites.map((e) => e.name)).toEqual(['Alpha']);
    expect(rest.map((e) => e.name)).toEqual(['Alps']);
  });
});

describe('вид хостинга по хосту origin', () => {
  it('узнаёт основные хостинги и их самостоятельные инстансы', () => {
    expect(hostKindOf('github.com')).toBe('github');
    expect(hostKindOf('gitlab.corp.dev')).toBe('gitlab');
    expect(hostKindOf('bitbucket.org')).toBe('bitbucket');
    expect(hostKindOf('git.corp.dev')).toBe('other');
    expect(hostKindOf(null)).toBe(null);
  });
});
```

- [ ] **Step 2: Убедиться, что падает; реализация**

Run: `npx vitest run src/features/repo/startPage.test.ts` — FAIL (модуля нет). Затем `src/features/repo/startPage.ts`:

```ts
import type { RecentRepo } from '@/types';

export const splitRecent = (
  recent: RecentRepo[],
  filter: string,
): { favorites: RecentRepo[]; rest: RecentRepo[] } => {
  const needle = filter.trim().toLowerCase();
  const shown = needle
    ? recent.filter((e) => e.name.toLowerCase().includes(needle))
    : recent;
  return {
    favorites: shown.filter((e) => e.favorite),
    rest: shown.filter((e) => !e.favorite),
  };
};

export type HostKind = 'github' | 'gitlab' | 'bitbucket' | 'other';

export const hostKindOf = (host: string | null | undefined): HostKind | null => {
  if (!host) return null;
  if (host.includes('github')) return 'github';
  if (host.includes('gitlab')) return 'gitlab';
  if (host.includes('bitbucket')) return 'bitbucket';
  return 'other';
};
```

Экспорт из `src/features/repo/index.ts`: `export * from './startPage';`

- [ ] **Step 3: Зелёный прогон и commit**

Run: `npx vitest run src/features/repo/startPage.test.ts`
Expected: PASS.

```bash
git add src/features/repo/startPage.ts src/features/repo/startPage.test.ts src/features/repo/index.ts
git commit -m "Start page model: favorites split and origin host kind"
```

---

### Task 4: Перестройка StartPage

**Files:**
- Modify: `src/widgets/StartPage.tsx` (переписывается основная часть)
- Modify: `src/features/repo/sessionActions.ts` (добавить `favorite`)
- Modify: `src/app/App.tsx` (проп `onFavorite`)
- Modify: `src/locales/en/common.json`

**Interfaces:**
- Consumes: `ipc.favoriteRepo`, `ipc.repoPassports`, `splitRecent`, `hostKindOf`, `ListRow` (`tall`), `NavItem`, `SectionHeader`, `InlineNote`, `Icon.{github,gitlab,bitbucket,folder,branch,star?}`.
- Produces: `StartPage` получает новый проп `onFavorite: (path: string, on: boolean) => void`; `useSessionActions` возвращает дополнительно `favorite(path, on)`.

- [ ] **Step 1: i18n-ключи**

В `src/locales/en/common.json` добавить (и удалить осиротевшие `start.library`, `start.local`, `start.repository`, если после правки их никто не использует — проверить `rg`):

```json
"start.all": "All",
"start.favorites": "Favorites",
"start.connectAccount": "Connect account…",
"start.searchRepos": "Search repositories",
"start.star": "Add to favorites",
"start.unstar": "Remove from favorites"
```

- [ ] **Step 2: favorite в sessionActions**

В `useSessionActions` рядом с `forget` (образец — как `forget` зовёт `ipc.forgetRepo` и `setRecent`):

```ts
const favorite = useCallback(
  (path: string, on: boolean) => {
    ipc.favoriteRepo(path, on).then(setRecent).catch(notifyError);
  },
  [setRecent],
);
```

и вернуть его из хука. В `App.tsx` пробросить `onFavorite={favorite}` в `<StartPage>`.

- [ ] **Step 3: Перестройка StartPage.tsx**

Структура (детали — по мокапу «source-icons»; всё из parts и токенов, ни одного частного значения):

- Рейка: секция `t('start.title')` («Repositories») с двумя `NavItem` — All (`Icon.folder`… нет: All без иконки места; использовать `Icon.repo`, если есть, иначе без lead) и Favorites (звезда `Icon.star`, если есть в `icons.ts`; нет — добавить туда из lucide `Star` под именем `star`); счётчики как сейчас у SourceRow. Секция `t('start.accounts')` — как текущие connections. Внизу через `mt-auto` — `NavItem` c `t('start.connectAccount')` → `onConnect`.
- Шапка: `Input` поиска с `flex-1` (как в мокапе, слева иконка, справа `<kbd>⌘K</kbd>`), хоткей ⌘K фокусирует его (`useEffect` + `ref`, по образцу хоткея `\` в App). Справа кнопки Open / Clone / Create (как сейчас).
- Список для локальных срезов: `splitRecent(recent, filter)`; в срезе All две секции `SectionHeader` (Favorites, Recent), в срезе Favorites — только избранные; пустое избранное — `InlineNote`.
- Строка — `ListRow tall as="div"` с `group`:

```tsx
function RepoRow({
  entry,
  passport,
  onOpenPath,
  onFavorite,
  onForget,
}: {
  entry: RecentRepo;
  passport: RepoPassportView | undefined;
  onOpenPath: (path: string) => void;
  onFavorite: (path: string, on: boolean) => void;
  onForget: (path: string) => void;
}) {
  const { t } = useTranslation();
  const kind = hostKindOf(passport?.host ?? null);
  const Source =
    kind === 'github' ? Icon.github
    : kind === 'gitlab' ? Icon.gitlab
    : kind === 'bitbucket' ? Icon.bitbucket
    : kind === 'other' ? Icon.host
    : Icon.folder;
  return (
    <ListRow
      as="div"
      tall
      className={cn(!entry.exists && 'opacity-40')}
      title={entry.exists ? entry.path : t('start.missing')}
      onClick={() => entry.exists && onOpenPath(entry.path)}
    >
      <span className="flex w-3.5 shrink-0 items-center justify-center">
        {entry.favorite ? <Icon.star className="text-modified size-3.5" /> : null}
      </span>
      <Source className="text-faint size-3.5 shrink-0" />
      <span className="shrink-0 text-sm font-medium">{entry.name}</span>
      <span className="text-faint group-hover:text-muted-foreground min-w-0 flex-1 truncate font-mono text-2xs">
        {shorten(entry.path)}
      </span>
      {entry.exists ? (
        passport?.branch ? (
          <span className="text-muted-foreground flex max-w-48 shrink-0 items-center gap-1.5 text-xs">
            <Icon.branch className="size-3 shrink-0" />
            <span className="truncate">{passport.branch}</span>
          </span>
        ) : null
      ) : (
        <Badge variant="outline" className="text-faint shrink-0">
          {t('start.missing')}
        </Badge>
      )}
      <span className="text-faint w-22 shrink-0 text-right text-2xs group-hover:hidden">
        {relativeTime(entry.openedAt, Date.now() / 1000, i18n.language)}
      </span>
      <span className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
        <Button
          variant="muted"
          size="icon-xs"
          aria-label={entry.favorite ? t('start.unstar') : t('start.star')}
          onClick={(e) => {
            e.stopPropagation();
            onFavorite(entry.path, !entry.favorite);
          }}
        >
          <Icon.star />
        </Button>
        <Button
          variant="muted"
          size="icon-xs"
          aria-label={t('menu.reveal')}
          onClick={(e) => {
            e.stopPropagation();
            void ipc.revealPath(entry.path, '.').catch(notifyError);
          }}
        >
          <Icon.open />
        </Button>
        <Button
          variant="muted"
          size="icon-xs"
          aria-label={t('start.forget')}
          onClick={(e) => {
            e.stopPropagation();
            onForget(entry.path);
          }}
        >
          <Icon.close />
        </Button>
      </span>
    </ListRow>
  );
}
```

  Если сигнатуры `Button`/`ListRow` не совпадают с приведённым — приводить код к фактическим, не наоборот. `onClick` с `e` у Button: проверить текущий тип; если `() => void` — обернуть родителем.
- Паспорта: в `StartPage` эффект — `ipc.repoPassports(recent.map((r) => r.path))` → `Map<string, RepoPassportView>`, состояние локальное; ошибки в тост не идут (`.catch(() => undefined)`) — страница живёт и без паспортов.
- Хостинговый срез (аккаунты) — без изменений по поведению, но шапка и поиск общие новые.
- `Icon.star`: если в `icons.ts` нет — добавить `star: Star` из lucide.

- [ ] **Step 4: Прогоны**

Run: `npx vitest run && npm run build`
Expected: всё зелёное; `npm run i18n:check` внутри build проходит.

- [ ] **Step 5: Commit**

```bash
git add src/widgets/StartPage.tsx src/features/repo/sessionActions.ts src/app/App.tsx src/locales/en/common.json src/icons.ts
git commit -m "Start page: favorites and recent slices, passport chips, hover actions"
```

---

### Task 5: Ручная проверка и зачистка

**Files:**
- Possibly modify: `src/locales/en/common.json` (осиротевшие ключи)

- [ ] **Step 1: Осиротевшие ключи**

Run: `for k in start.library start.local start.repository start.updated; do rg -q "$k" src --glob '!locales/**' || echo "unused: $k"; done`
Удалить из каталога те, что больше не используются.

- [ ] **Step 2: Полный прогон**

Run: `cargo test && npx vitest run && npm run build`
Expected: зелёное всё, включая clippy при желании (`cargo clippy --all-targets -- -D warnings`).

- [ ] **Step 3: Руками в приложении**

`npm run app`: звезда переносит между секциями и переживает перезапуск; чипы веток появляются после открытия страницы; иконки источника различают github/локальные; ховер поднимает контраст пути; reveal открывает Finder на каталоге репозитория; missing-строка погашена и некликабельна; ⌘K фокусирует поиск.

- [ ] **Step 4: Commit (если были правки)**

```bash
git add -A src
git commit -m "Start page cleanup after manual pass"
```
