import { test } from 'node:test';
import assert from 'node:assert/strict';
import { badge, installerDownloads } from './downloads-badge.mjs';

const asset = (name, download_count) => ({ name, download_count });

test('only installers count: the update manifest and signatures are the app asking, not a person', () => {
  const releases = [
    {
      draft: false,
      assets: [
        asset('latest.json', 37),
        asset('gitspy_1.2.0_x64-setup.exe', 1),
        asset('gitspy_1.2.0_x64-setup.exe.sig', 5),
        asset('gitspy_1.2.0_aarch64.dmg', 2),
        asset('gitspy_aarch64.app.tar.gz', 9),
        asset('gitspy_1.2.0_amd64.AppImage', 1),
        asset('gitspy_1.2.0_amd64.deb', 1),
        asset('gitspy-1.2.0-1.x86_64.rpm', 1),
        asset('gitspy_1.2.0_x64_en-US.msi', 1),
      ],
    },
  ];
  assert.equal(installerDownloads(releases), 7);
});

test('a draft is not out yet, so its numbers are ours, not downloads', () => {
  const releases = [
    { draft: true, assets: [asset('gitspy_1.3.0_x64.dmg', 4)] },
    { draft: false, assets: [asset('gitspy_1.2.0_x64.dmg', 3)] },
  ];
  assert.equal(installerDownloads(releases), 3);
});

test('the badge speaks the shields endpoint schema', () => {
  assert.deepEqual(badge(7), { schemaVersion: 1, label: 'installs', message: '7', color: 'green' });
});
