import { readFileSync } from 'node:fs';
import { checkVersions } from '../src/shared/lib/release.ts';

const pkg = JSON.parse(readFileSync('package.json', 'utf8')).version;
const conf = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8')).version;
checkVersions(process.argv[2] ?? '', pkg, conf);
process.stdout.write('versions agree\n');
