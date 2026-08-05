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
    expect(manifest.version, 'апдейтер сравнивает semver, префикс сломал бы сравнение').toBe(
      '1.0.1',
    );
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
