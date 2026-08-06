# Провайдеры хостингов: GitHub, GitLab, GitLab self-hosted, Bitbucket

Дата: 2026-08-06. Статус: согласовано.

## Главное правило

**Один трейт — все возможности — все провайдеры.** Ни одного
`if host == "github"` нигде: ни в крейте, ни в командах Tauri, ни во
фронтенде. Полупустых провайдеров не существует: каждая клетка таблицы
возможностей обязана быть заполнена. Метод, который «не влез» в трейт у
одного провайдера, — дефект рельсов; чинятся рельсы, а не делается
исключение.

Существующие GitHub-спецслучаи объявляются долгом и умирают в этой работе:
`preferred_github_remote`, константа `GITHUB_URL`, проверка id хоста в
`start_connect`, прямые вызовы `github::` из аватарного резолвера.

## Поверхность провайдера

| Метод | GitHub | GitLab.com | GitLab self-hosted | Bitbucket |
|---|---|---|---|---|
| `connect()` | device-код | браузер: PKCE + loopback `127.0.0.1` | форма URL + PAT | браузер: наш CF-воркер + деплинк |
| `account()` | `/user` | `/user` | то же | `/2.0/user` |
| `repos()` | как сейчас | `/projects?membership=true` | то же | `/2.0/repositories?role=member` |
| `pulls()`, `pull_detail()`, `pull_comments()` | как сейчас | merge requests API | то же | pullrequests API |
| `commit_avatars()`, `commit_author()` | как сейчас | `/avatar?email=` — прямой email→аватар | то же | автор из `/2.0/…/commit/{hash}` с avatar-ссылкой |
| `credential()` для https-операций | `x-access-token:<t>` @ github.com | `oauth2:<t>` @ gitlab.com | `oauth2:<t>` @ base_url | `x-token-auth:<t>` @ bitbucket.org |
| `matches_remote()` | одна функция на всех: хост из base_url подключения против хоста remote-URL | | | |

GitLab self-hosted — это не отдельный код, а `GitLab` с другим `base_url`
и `TokenForm`-входом.

## Авторизация: один канал, разные способы

`start_connect(host)` возвращает enum `ConnectStart`:

```
DeviceCode { user_code, verification_uri }      — GitHub
BrowserAuth { url }                             — GitLab.com, Bitbucket
TokenForm { fields: [BaseUrl?, Username?, Token] } — self-hosted GitLab
```

Фронтенд рендерит его **одним data-driven компонентом**; четыре карточки
Integrations не имеют собственной логики.

Физика способов (почему они разные — ограничения провайдеров, а не наш
выбор):

- **GitHub**: device flow, как сейчас; GitHub не отдаёт токен без секрета
  иначе.
- **GitLab.com**: authorization code + PKCE, публичное приложение без
  секрета; на время входа приложение поднимает loopback-слушатель на
  `127.0.0.1:<порт>` и ловит редирект.
- **Bitbucket**: PKCE без секрета не умеет — обмен кода на токен делает
  **наш Cloudflare Worker** (client secret в env воркера, в бинаре секретов
  нет). Воркер отдаёт страницу «Success» с кнопкой и деплинком
  `gitspy://oauth/bitbucket#…` обратно в приложение. Схема `gitspy://`
  регистрируется тауري-плагином deep-link.
- **GitLab self-hosted**: OAuth-приложение нельзя завести на чужом
  инстансе заранее — форма URL + Personal Access Token, со ссылкой сразу
  на страницу создания токена с нужными скоупами
  (`/-/user_settings/personal_access_tokens?scopes=api`).

## Архитектура

### gitspy-hosts

- `enum Host { GitHub(GitHub), GitLab(GitLab), Bitbucket(Bitbucket) }` +
  общий `impl Host` со всеми методами таблицы, делегирующий внутрь
  (диспатч match, без dyn).
- Модули `gitlab.rs`, `bitbucket.rs` в каноне `github.rs`: чистые
  `parse_*`-функции + клиент; у каждого провайдера **один и тот же набор
  contract-тестов** на фикстурах реальных ответов API (аккаунт, репы,
  пуллы, аватар, ошибки/лимиты).
- Общие типы `Account`, `Repo`, `PullSummary`, `PullDetail`, `Comment`
  остаются в `lib.rs`/`pulls.rs`; провайдерские парсеры маппят в них.
- `remote.rs`: `matches_remote(remotes, base_url)` — одна функция;
  `preferred_github_remote` удаляется.

### Подключения и секреты

- Storage: список подключений `{ id, kind, base_url, login }`
  (`hosts/storage.rs` расширяется с одного github-аккаунта до списка).
- Токены — в существующих secrets-файлах, ключ = id подключения
  (`github`, `gitlab`, `gitlab-sh`, `bitbucket`; по одному подключению на
  вид — профили не делаем, YAGNI).
- `Host::for_connection(connection, token)` — единственная точка создания.

### src-tauri

- Команды `start_connect`, `finish_connect(token-форма)`, `host_account`,
  `host_repos`, `pull_requests`, `pull_card`, `disconnect_host` работают
  для любого id подключения через `Host`; проверка `host != github`
  удаляется.
- Кред-хелпер операций: `hosts::credential_for(repo_remotes)` находит
  подключение по `matches_remote` и отдаёт `{url, username, token}` —
  `operations::run` больше не знает про GitHub.
- Аватарный резолвер `avatars.rs` ходит через `Host` — аватарки коммитов
  работают у всех провайдеров автоматически.
- Deep-link: `tauri-plugin-deep-link`, схема `gitspy`; обработчик
  `gitspy://oauth/<host>#token=…` завершает вход. Loopback-слушатель для
  GitLab поднимается на время `start_connect` и гасится по получении кода
  или отмене.

### Cloudflare Worker (Bitbucket)

- Каталог `workers/oauth-relay/` в репозитории; деплой wrangler-ом,
  секреты (`BITBUCKET_CLIENT_ID`, `BITBUCKET_CLIENT_SECRET`) в env
  воркера.
- Один маршрут: `GET /bitbucket/callback?code=…` → обмен кода на токен →
  HTML-страница «Success» (наши токены оформления, без брендов) с
  деплинком и кнопкой. Воркер ничего не хранит.
- refresh-токен Bitbucket: сохраняем рядом с access (у Bitbucket access
  живёт 2 часа); обновление — прямым запросом из приложения? Нет:
  refresh тоже требует секрета → воркер получает второй маршрут
  `POST /bitbucket/refresh`. Это единственный сетевой вызов приложения к
  нашей инфраструктуре, и он не содержит ничего, кроме refresh-токена.

### Фронтенд

- `Integrations` — четыре карточки из одного компонента `HostCard`
  (данные: kind, подключение, ConnectStart). Иконки уже в `Icon`
  (github/gitlab/bitbucket).
- StartPage: источники рендерятся по списку подключений — клетка «репы»
  работает у всех одинаково.
- Вкладка PR/MR в сайдбаре и PullPanel — без изменений: данные приходят
  теми же типами.
- `hostOf(remotes)` (иконки табов) остаётся — он про иконку, не про
  подключение.

## Ошибки

Как сейчас у GitHub: код + параметры (`hosts.rateLimited`,
`hosts.unauthorized`, …), `classify()` расширяется маппингом статусов
GitLab/Bitbucket. Протухший токен Bitbucket → тихий refresh через воркер →
повтор; refresh не удался → состояние карточки «reconnect».

## Тесты

- Contract-набор на провайдера: одинаковый список тестов по фикстурам
  (parse_account, parse_repos, parse_pulls, parse_pull_detail,
  parse_comments, avatar-ответ, классификация 401/403/429).
- `matches_remote`: ssh и https формы URL, self-hosted хост, чужой хост.
- PKCE: verifier/challenge — чистые функции с тестом на RFC-вектор.
- Deep-link парсер `gitspy://oauth/...` — чистая функция + тест.
- Воркер: обмен кода замокан не будет — воркер тестируется своим
  vitest-ом в `workers/oauth-relay` (wrangler поддерживает), два теста:
  успешный обмен и отказ Bitbucket.
- Фронт: HostCard рендерит все три вида ConnectStart из данных.

## Фазы

- **A. Рельсы + GitLab.com**: трейт Host, выкорчёвывание спецслучаев,
  подключения-список, PKCE+loopback, полный стек GitLab (аккаунт, репы,
  MR, аватарки, кред-хелпер). Приложение работает с GitHub и GitLab.
- **B. Bitbucket**: воркер, деплинк, refresh, полный стек.
- **C. GitLab self-hosted**: TokenForm, base_url, та же кодовая база
  GitLab.
- **D. (потом, вне этой спеки)**: SSH-ключи из референса, несколько
  аккаунтов одного провайдера.

## Что понадобится от пользователя

- Регистрация OAuth-приложения на gitlab.com (Redirect URI
  `http://127.0.0.1:0/callback` — точные значения дам при реализации) →
  client_id в код (публичный, не секрет).
- Регистрация OAuth consumer в Bitbucket → client_id/secret в env
  воркера.
- Деплой воркера (wrangler, тот же аккаунт Cloudflare, что R2).
