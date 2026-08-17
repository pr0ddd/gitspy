import { readFileSync } from 'node:fs';
import { checkVersions } from '../src/shared/lib/release.ts';

const cargoVersion = (manifest) => {
  const line = manifest.split('\n').find((l) => /^version\s*=/.test(l));
  return line ? line.split('=')[1].trim().replace(/^"|"$/g, '') : '';
};

checkVersions(process.argv[2] ?? '', {
  'package.json': JSON.parse(readFileSync('package.json', 'utf8')).version,
  'src-tauri/tauri.conf.json': JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8'))
    .version,
  'src-tauri/Cargo.toml': cargoVersion(readFileSync('src-tauri/Cargo.toml', 'utf8')),
});
process.stdout.write('versions agree\n');
