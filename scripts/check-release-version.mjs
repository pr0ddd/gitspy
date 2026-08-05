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
