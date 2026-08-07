# Автоапдейты и релизный деплой — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Приложение тихо обновляет себя с Cloudflare R2, релиз собирается GitHub Actions по тегу `v*`.

**Architecture:** `tauri-plugin-updater` проверяет `latest.json` на публичном домене R2; весь доступ к плагину — через модуль `src/updater.ts`; кнопка перезапуска живёт в новом `src/shell/BottomBar.tsx`. Workflow на `macos-14` собирает, подписывает, нотаризует, льёт артефакты в R2 (манифест строго последним) и создаёт GitHub Release с dmg.

**Tech Stack:** Tauri 2, tauri-plugin-updater/-process, GitHub Actions, aws cli (S3-совместимый R2), vitest, cargo test.

## Global Constraints

- Комментариев в коде нет — ни `//`, ни `///`, ни YAML-комментариев в новых файлах не требуется, но в workflow YAML комментарии допустимы (это не код приложения; образец quesk их использует).
- Проза тестов и сообщений `assert` — русская; идентификаторы английские.
- Коммиты английские, без трейлеров.
- Строк для пользователя в коде нет — только ключи i18n (`npm run i18n:check` сторожит).
- Компоненты не импортируют плагины Tauri напрямую: апдейтер — только через `src/updater.ts` (та же дисциплина, что `src/ipc.ts`).
- Версия приложения — `package.json`; `tauri.conf.json` и тег обязаны совпадать с ней.
- Endpoint до создания бакета — заглушка `https://updates.gitspy.invalid/latest.json`; финальный шаг чек-листа заменяет её на реальный `r2.dev`-домен.

---

### Task 1: Ключ апдейтера

**Files:**
- Create: `~/.tauri/gitspy-updater.key` и `~/.tauri/gitspy-updater.key.pub` (вне репозитория)

**Interfaces:**
- Produces: публичный ключ (содержимое `.pub`) для Task 2; приватный ключ уходит в секрет GitHub на финальном чек-листе.

- [ ] **Step 1: Сгенерировать пару**

Run: `npx tauri signer generate -w ~/.tauri/gitspy-updater.key --password ""`
Expected: созданы оба файла, в выводе показан публичный ключ.

- [ ] **Step 2: Прочитать публичный ключ**

Run: `cat ~/.tauri/gitspy-updater.key.pub`
Expected: строка base64 — она подставляется в Task 2 как `pubkey`.

---

### Task 2: Плагины и конфигурация Tauri

**Files:**
- Modify: `src-tauri/Cargo.toml` (deps), `src-tauri/src/main.rs` (builder), `src-tauri/capabilities/default.json`, `src-tauri/tauri.conf.json`
- Test: `cargo build -p gitspy-app` компилируется; `npx tauri build` больше не нужен для проверки — конфиг валидируется сборкой.

**Interfaces:**
- Produces: включённый апдейтер с endpoint и pubkey; `bundle.createUpdaterArtifacts: true` — Task 6 полагается, что `tauri build` создаст `*.app.tar.gz` и `*.sig`.

- [ ] **Step 1: Зависимости**

В `src-tauri/Cargo.toml` к существующим плагинам добавить:

```toml
tauri-plugin-updater = "2"
tauri-plugin-process = "2"
```

- [ ] **Step 2: Регистрация в builder**

В `src-tauri/src/main.rs` рядом с существующими `.plugin(...)`:

```rust
.plugin(tauri_plugin_updater::Builder::new().build())
.plugin(tauri_plugin_process::init())
```

- [ ] **Step 3: Права**

В `src-tauri/capabilities/default.json` в `permissions` добавить `"updater:default"` и `"process:allow-restart"`.

- [ ] **Step 4: Конфиг**

В `src-tauri/tauri.conf.json`: в `bundle` добавить `"createUpdaterArtifacts": true`; на верхний уровень добавить

```json
"plugins": {
  "updater": {
    "endpoints": ["https://updates.gitspy.invalid/latest.json"],
    "pubkey": "<строка из Task 1 Step 2>"
  }
}
```

- [ ] **Step 5: Проверка компиляции**

Run: `cargo build -p gitspy-app`
Expected: успех.

- [ ] **Step 6: Commit**

```bash
git add src-tauri
git commit -m "Updater and process plugins with R2 endpoint placeholder"
```

---

### Task 3: Модуль updater и npm-пакеты

**Files:**
- Create: `src/updater.ts`
- Modify: `package.json` (deps)

**Interfaces:**
- Produces: `fetchReadyUpdate(): Promise<string | null>` — проверяет, скачивает и возвращает версию готового обновления либо null; `restartToUpdate(): Promise<void>`. Task 4 мокает ровно эти две функции.

- [ ] **Step 1: Пакеты**

Run: `npm install @tauri-apps/plugin-updater @tauri-apps/plugin-process`

- [ ] **Step 2: Модуль**

`src/updater.ts`:

```ts
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

export async function fetchReadyUpdate(): Promise<string | null> {
  const update = await check();
  if (!update) return null;
  await update.downloadAndInstall();
  return update.version;
}

export const restartToUpdate = (): Promise<void> => relaunch();
```

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json src/updater.ts
git commit -m "Updater access lives in one module like ipc"
```

---

### Task 4: BottomBar с кнопкой перезапуска

**Files:**
- Create: `src/shell/BottomBar.tsx`, `src/shell/BottomBar.test.tsx`
- Modify: `src/App.tsx` (боттом-бар выносится в компонент, добавляется опрос), `src/locales/en/common.json`

**Interfaces:**
- Consumes: `fetchReadyUpdate`/`restartToUpdate` из Task 3.
- Produces: `<BottomBar ready={string | null} onRestart={() => void} />`; App держит state `readyUpdate` и интервал опроса.

- [ ] **Step 1: Падающий тест**

`src/shell/BottomBar.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BottomBar } from './BottomBar';
import '../i18n';

describe('нижняя полоса', () => {
  it('без обновления показывает только версию', () => {
    render(<BottomBar ready={null} onRestart={() => {}} />);
    expect(screen.queryByRole('button'), 'кнопке нечего предлагать, пока обновление не скачано').toBeNull();
    expect(screen.getByText(__APP_VERSION__)).toBeTruthy();
  });

  it('со скачанным обновлением предлагает перезапуск и зовёт его по клику', () => {
    const restart = vi.fn();
    render(<BottomBar ready="1.0.2" onRestart={restart} />);
    const button = screen.getByRole('button');
    expect(button.textContent, 'кнопка называет версию, ради которой перезапуск').toContain('1.0.2');
    fireEvent.click(button);
    expect(restart, 'клик и есть перезапуск, второго шага нет').toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `npx vitest run src/shell/BottomBar.test.tsx`
Expected: FAIL — модуля `./BottomBar` нет.

- [ ] **Step 3: Компонент и ключи**

В `src/locales/en/common.json`: `"update.restart": "Restart to update to {{version}}"`.

`src/shell/BottomBar.tsx`:

```tsx
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Icon } from '../icons';

type Props = { ready: string | null; onRestart: () => void };

export function BottomBar({ ready, onRestart }: Props) {
  const { t } = useTranslation();
  return (
    <div className="flex h-6 shrink-0 items-center justify-end gap-2 px-1.5">
      {ready ? (
        <Button variant="muted" size="2xs" onClick={onRestart}>
          <Icon.update className="size-3" />
          {t('update.restart', { version: ready })}
        </Button>
      ) : null}
      <span className="text-faint text-2xs tabular-nums">{__APP_VERSION__}</span>
    </div>
  );
}
```

В `src/icons.ts` добавить `update` (lucide `RefreshCw`).

В `src/App.tsx` заменить текущий div боттом-бара на `<BottomBar ready={readyUpdate} onRestart={() => void restartToUpdate()} />`; state и опрос:

```tsx
const [readyUpdate, setReadyUpdate] = useState<string | null>(null);
useEffect(() => {
  let stopped = false;
  const poll = () =>
    fetchReadyUpdate()
      .then((version) => !stopped && version && setReadyUpdate(version))
      .catch(() => {});
  poll();
  const timer = setInterval(poll, 4 * 60 * 60 * 1000);
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}, []);
```

- [ ] **Step 4: Тесты зелёные**

Run: `npx vitest run && npx tsc --noEmit && npm run i18n:check`
Expected: PASS; полный набор не сломан.

- [ ] **Step 5: Commit**

```bash
git add src/shell/BottomBar.tsx src/shell/BottomBar.test.tsx src/App.tsx src/icons.ts src/locales/en/common.json
git commit -m "Bottom bar offers a quiet restart when an update is ready"
```

---

### Task 5: Скрипты манифеста и стража версии

**Files:**
- Create: `scripts/release-manifest.mjs`, `scripts/check-release-version.mjs`, `src/release.test.ts`

**Interfaces:**
- Produces: `buildManifest({version, baseUrl, artifact, signature, date})` → объект `latest.json`; CLI: `node scripts/release-manifest.mjs <version> <baseUrl> <artifact> <sigPath> > latest.json`. `checkVersions(tag, pkg, conf)` бросает при расхождении; CLI: `node scripts/check-release-version.mjs vX.Y.Z`. Task 6 вызывает оба CLI.

- [ ] **Step 1: Падающий тест**

`src/release.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildManifest } from '../scripts/release-manifest.mjs';
import { checkVersions } from '../scripts/check-release-version.mjs';

describe('манифест релиза', () => {
  it('собирает latest.json для darwin-aarch64', () => {
    const manifest = buildManifest({
      version: '1.0.1',
      baseUrl: 'https://pub-x.r2.dev',
      artifact: 'gitspy_1.0.1_aarch64.app.tar.gz',
      signature: 'SIG',
      date: '2026-08-05T12:00:00Z',
    });
    expect(manifest).toEqual({
      version: '1.0.1',
      pub_date: '2026-08-05T12:00:00Z',
      platforms: {
        'darwin-aarch64': {
          url: 'https://pub-x.r2.dev/gitspy_1.0.1_aarch64.app.tar.gz',
          signature: 'SIG',
        },
      },
    });
  });

  it('версия в манифесте без префикса v', () => {
    const manifest = buildManifest({
      version: 'v1.0.1',
      baseUrl: 'https://pub-x.r2.dev',
      artifact: 'a',
      signature: 's',
      date: 'd',
    });
    expect(manifest.version, 'апдейтер сравнивает semver, префикс сломал бы сравнение').toBe('1.0.1');
  });
});

describe('страж версии', () => {
  it('пропускает совпадение и валит расхождение', () => {
    expect(() => checkVersions('v1.0.1', '1.0.1', '1.0.1')).not.toThrow();
    expect(
      () => checkVersions('v1.0.2', '1.0.1', '1.0.1'),
      'тег обязан совпадать с package.json и tauri.conf, иначе релиз лжёт о версии',
    ).toThrow();
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `npx vitest run src/release.test.ts`
Expected: FAIL — модулей нет.

- [ ] **Step 3: Реализация**

`scripts/release-manifest.mjs`:

```js
import { readFileSync } from 'node:fs';

export const buildManifest = ({ version, baseUrl, artifact, signature, date }) => ({
  version: version.replace(/^v/, ''),
  pub_date: date,
  platforms: {
    'darwin-aarch64': { url: `${baseUrl}/${artifact}`, signature },
  },
});

const main = () => {
  const [version, baseUrl, artifact, sigPath] = process.argv.slice(2);
  const manifest = buildManifest({
    version,
    baseUrl,
    artifact,
    signature: readFileSync(sigPath, 'utf8').trim(),
    date: new Date().toISOString(),
  });
  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
};

if (process.argv[1]?.endsWith('release-manifest.mjs')) main();
```

`scripts/check-release-version.mjs`:

```js
import { readFileSync } from 'node:fs';

export const checkVersions = (tag, pkg, conf) => {
  const wanted = tag.replace(/^v/, '');
  if (pkg !== wanted || conf !== wanted) {
    throw new Error(`tag ${tag} != package.json ${pkg} / tauri.conf.json ${conf}`);
  }
};

if (process.argv[1]?.endsWith('check-release-version.mjs')) {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8')).version;
  const conf = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8')).version;
  checkVersions(process.argv[2] ?? '', pkg, conf);
  process.stdout.write('versions agree\n');
}
```

- [ ] **Step 4: Тесты зелёные**

Run: `npx vitest run src/release.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/release-manifest.mjs scripts/check-release-version.mjs src/release.test.ts
git commit -m "Release manifest builder and version guard with tests"
```

---

### Task 6: Релизный workflow

**Files:**
- Create: `.github/workflows/release.yml`

**Interfaces:**
- Consumes: CLI-скрипты Task 5, `createUpdaterArtifacts` Task 2.
- Produces: по тегу `v*` — файлы в R2 и GitHub Release.

- [ ] **Step 1: Workflow**

```yaml
# Release: build, sign, notarize, upload to R2 (manifest strictly last), GH release.
name: Release

on:
  push:
    tags: ['v*']

permissions:
  contents: write

concurrency:
  group: release
  cancel-in-progress: false

jobs:
  mac:
    runs-on: macos-14
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - uses: dtolnay/rust-toolchain@stable

      - uses: Swatinem/rust-cache@v2
        with:
          workspaces: '. -> target'

      - name: Install
        run: npm ci

      - name: Versions agree
        run: node scripts/check-release-version.mjs "$GITHUB_REF_NAME"

      - name: Build, sign, notarize
        env:
          APPLE_CERTIFICATE: ${{ secrets.APPLE_CERTIFICATE }}
          APPLE_CERTIFICATE_PASSWORD: ${{ secrets.APPLE_CERTIFICATE_PASSWORD }}
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_PASSWORD: ${{ secrets.APPLE_PASSWORD }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
        run: npx tauri build

      - name: Collect artifacts
        run: |
          VERSION="${GITHUB_REF_NAME#v}"
          mkdir out
          cp target/release/bundle/dmg/gitspy_${VERSION}_aarch64.dmg out/
          cp target/release/bundle/macos/gitspy.app.tar.gz "out/gitspy_${VERSION}_aarch64.app.tar.gz"
          cp target/release/bundle/macos/gitspy.app.tar.gz.sig "out/gitspy_${VERSION}_aarch64.app.tar.gz.sig"
          node scripts/release-manifest.mjs "$GITHUB_REF_NAME" "${{ vars.UPDATES_BASE_URL }}" \
            "gitspy_${VERSION}_aarch64.app.tar.gz" "out/gitspy_${VERSION}_aarch64.app.tar.gz.sig" > out/latest.json

      - name: Upload artifacts to R2
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.R2_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.R2_SECRET_ACCESS_KEY }}
          AWS_DEFAULT_REGION: auto
        run: |
          aws s3 cp out "s3://${{ secrets.R2_BUCKET }}/" --recursive --exclude latest.json \
            --endpoint-url "${{ secrets.R2_ENDPOINT }}" --only-show-errors

      - name: Publish manifest last
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.R2_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.R2_SECRET_ACCESS_KEY }}
          AWS_DEFAULT_REGION: auto
        run: |
          aws s3 cp out/latest.json "s3://${{ secrets.R2_BUCKET }}/latest.json" \
            --endpoint-url "${{ secrets.R2_ENDPOINT }}" --content-type application/json --only-show-errors

      - name: GitHub release
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          VERSION="${GITHUB_REF_NAME#v}"
          gh release create "$GITHUB_REF_NAME" "out/gitspy_${VERSION}_aarch64.dmg" --generate-notes
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "Tag-driven release: build, R2 upload with manifest last, GH release"
```

---

### Task 7: Полная проверка и финальный чек-лист

- [ ] **Step 1: Все проверки**

Run: `npm run i18n:check && npx tsc --noEmit && npx vitest run && cargo test && cargo clippy --all-targets -- -D warnings && npx vite build`
Expected: всё зелёное.

- [ ] **Step 2: Чек-лист пользователю**

Выдать одним списком: создать бакет + r2.dev-домен (заменить заглушку endpoint), R2-токен, секреты GitHub (точные `gh secret set` команды), переменную `UPDATES_BASE_URL`, резервная копия ключа апдейтера.
