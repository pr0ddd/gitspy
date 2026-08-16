import { describe, expect, it } from 'vitest';
import { buildManifest } from '../scripts/release-manifest.mjs';
import { checkVersions } from '../scripts/check-release-version.mjs';

describe('release manifest', () => {
  it('builds latest.json for darwin-aarch64', () => {
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

  it('the version in the manifest carries no v prefix', () => {
    const manifest = buildManifest({
      version: 'v1.0.1',
      baseUrl: 'https://pub-x.r2.dev',
      artifact: 'a',
      signature: 's',
      date: 'd',
    });
    expect(manifest.version, 'the updater compares semver, and a prefix would break it').toBe(
      '1.0.1',
    );
  });
});

describe('version guard', () => {
  it('lets a match through and fails on a mismatch', () => {
    expect(() => checkVersions('v1.0.1', '1.0.1', '1.0.1')).not.toThrow();
    expect(
      () => checkVersions('v1.0.2', '1.0.1', '1.0.1'),
      'the tag has to match package.json and tauri.conf, otherwise the release lies about its version',
    ).toThrow();
  });
});
