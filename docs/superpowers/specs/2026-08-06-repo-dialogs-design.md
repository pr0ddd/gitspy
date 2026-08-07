# Диалоги добавления репозитория: Clone и Init

Дата: 2026-08-06. Референс — GitKraken (скрины в переписке), стиль — наш.

## Форма

Один компонент диалога с левой колонкой вкладок и правой формой
(shadcn Dialog, наши части). Две сущности:

**Clone**: вкладки URL / GitHub / GitLab / Bitbucket.
- URL: Where to clone (преф `clone.dir` + Browse), URL, Shallow clone.
- Провайдерные: тот же Where + «Repository to clone» — комбо с поиском по
  списку реп подключения, группировка по владельцу (часть до `/`),
  иконка приватности у строки. Выбор репы подставляет имя в Full path
  (dir + / + name, имя редактируемое). Клонирование — по https-URL репы,
  кред-хелпер уже работает.
- Вкладка неподключённого провайдера показывает тот же Connect-блок, что
  в настройках (HostCard-механика), после подключения — сразу список.
- Список реп грузится при открытии вкладки из кэша (`hostRepos(host,
  false)`), обновление не нужно — кэш освежается стартовой страницей.

**Init**: вкладки Local Only / GitHub / GitLab / Bitbucket.
- Local: Name, Initialize in (Browse), Full path (dir/…/name), Default
  branch (плейсхолдер из префа `init.branch`|main), .gitignore Template,
  License, — создаёт репозиторий локально (`git init -b`), кладёт
  выбранные шаблоны первым коммитом.
- Провайдерные: Account (подключение, обычно одно), Name, Description,
  Access (Public/Private), Clone after init (галка), Where to clone,
  Full path, Default branch, .gitignore, License. Создаёт репу через API
  провайдера, клонирует, кладёт шаблоны коммитом и пушит.

## Честность шаблонов

API создания принимает gitignore/license только у GitHub; GitLab и
Bitbucket — нет. Чтобы формы были идентичны и честны, шаблоны кладём мы:
после init/clone пишем `.gitignore` и `LICENSE` в рабочее дерево, один
коммит «Initial commit», для провайдерных — push. Каталог шаблонов —
публичные списки GitHub (`/gitignore/templates`, `/licenses`), кэш в
data-dir, при недоступности сети поля показывают пустой список с честной
подписью.

## Поверхность

- gitspy-hosts: `create_repo(token, name, description, private) ->
  Repo` у каждого провайдера (GitHub `POST /user/repos`, GitLab
  `POST /projects`, Bitbucket `POST /2.0/repositories/{ws}/{slug}`);
  contract-тесты парсеров ответа. `templates.rs`: parse_gitignore_list,
  parse_licenses (+клиент, публичные, без токена).
- gitspy-exec: `clone_into` получает `shallow: bool` (`--depth 1`);
  `first_commit(path, message)` — add -A + commit.
- src-tauri: команды `clone_repo` расширяются shallow; `host_create_repo`;
  `template_catalog` (два списка, кэш);
  `init_repo` получает gitignore/license (содержимое кладёт Rust).
- Фронт: `widgets/RepoDialog.tsx` (обе сущности, режим prop), данные
  вкладок — из `connections()`. Bitbucket-создание требует Write-прав
  консюмера — до их включения кнопка отдаёт честную ошибку провайдера.

## Фазы

1. Каркас диалога + Clone URL (+shallow) — замена текущего клон-флоу.
2. Clone провайдерные вкладки (+Connect-встройка).
3. Init Local (+шаблоны).
4. Init провайдерные (create API + push), Bitbucket Write-права.
