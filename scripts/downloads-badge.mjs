import { writeFileSync } from 'node:fs';

const INSTALLER = /(\.dmg|-setup\.exe|\.msi|\.AppImage|\.deb|\.rpm)$/;

export const installerDownloads = (releases) =>
  releases
    .filter((release) => !release.draft)
    .flatMap((release) => release.assets)
    .filter((asset) => INSTALLER.test(asset.name))
    .reduce((sum, asset) => sum + asset.download_count, 0);

export const badge = (count) => ({
  schemaVersion: 1,
  label: 'installs',
  message: String(count),
  color: 'green',
});

async function releasesOf(repo, token) {
  const headers = { accept: 'application/vnd.github+json', 'user-agent': 'gitspy-badge' };
  if (token) headers.authorization = `Bearer ${token}`;
  const all = [];
  for (let page = 1; ; page += 1) {
    const response = await fetch(
      `https://api.github.com/repos/${repo}/releases?per_page=100&page=${page}`,
      { headers },
    );
    if (!response.ok) throw new Error(`GitHub answered ${response.status}`);
    const batch = await response.json();
    all.push(...batch);
    if (batch.length < 100) return all;
  }
}

if (process.argv[1]?.endsWith('downloads-badge.mjs')) {
  const [repo, target] = process.argv.slice(2);
  if (!repo || !target) {
    process.stderr.write('usage: downloads-badge.mjs <owner/repo> <output.json>\n');
    process.exit(2);
  }
  const releases = await releasesOf(repo, process.env.GITHUB_TOKEN);
  const count = installerDownloads(releases);
  writeFileSync(target, `${JSON.stringify(badge(count))}\n`);
  process.stdout.write(`${count} installs\n`);
}
