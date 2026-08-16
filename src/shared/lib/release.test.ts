import { describe, expect, it } from 'vitest';
import { checkVersions } from './release';

describe('version guard', () => {
  it('lets a match through and fails on a mismatch', () => {
    expect(() => checkVersions('v1.0.1', '1.0.1', '1.0.1')).not.toThrow();
    expect(
      () => checkVersions('v1.0.2', '1.0.1', '1.0.1'),
      'the tag has to match package.json and tauri.conf, otherwise the release lies about its version',
    ).toThrow();
  });
});
