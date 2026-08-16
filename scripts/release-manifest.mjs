import { readFileSync } from 'node:fs';
import { buildManifest } from '../src/shared/lib/release.ts';

const [version, baseUrl, artifact, sigPath] = process.argv.slice(2);
const manifest = buildManifest({
  version,
  baseUrl,
  artifact,
  signature: readFileSync(sigPath, 'utf8').trim(),
  date: new Date().toISOString(),
});
process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
