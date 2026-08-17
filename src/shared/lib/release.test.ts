import { describe, expect, it } from 'vitest';
import { checkVersions } from './release';

describe('version guard', () => {
  it('lets a match through and fails when any manifest disagrees with the tag', () => {
    expect(() =>
      checkVersions('v1.0.1', { 'package.json': '1.0.1', 'tauri.conf.json': '1.0.1' }),
    ).not.toThrow();
    expect(
      () =>
        checkVersions('v1.0.2', {
          'package.json': '1.0.2',
          'tauri.conf.json': '1.0.2',
          'Cargo.toml': '1.0.1',
        }),
      'the tag has to match every manifest, otherwise the release lies about its version',
    ).toThrow(/Cargo.toml 1.0.1/);
  });
});
