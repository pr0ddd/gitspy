import { readFileSync } from 'node:fs';

export const buildManifest = ({ version, baseUrl, artifact, signature, date }) => ({
  version: version.replace(/^v/, ''),
  pub_date: date,
  platforms: {
    'darwin-aarch64': { url: `${baseUrl}/${artifact}`, signature },
  },
});

const main = () => {
  const [version, baseUrl, artifact, sigPath] = process.argv.slice(2);
  const manifest = buildManifest({
    version,
    baseUrl,
    artifact,
    signature: readFileSync(sigPath, 'utf8').trim(),
    date: new Date().toISOString(),
  });
  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
};

if (process.argv[1]?.endsWith('release-manifest.mjs')) main();
