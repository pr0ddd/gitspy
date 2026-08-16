import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const cards = join(here, 'cards');
const partials = join(here, 'partials');
const dist = join(here, 'dist');
const compiled = join(here, '.compiled.css');

const shared = new Map(
  readdirSync(partials)
    .filter((f) => f.endsWith('.html'))
    .map((f) => [f.replace(/\.html$/, ''), readFileSync(join(partials, f), 'utf8').trimEnd()]),
);

const expand = (html) =>
  html.replace(/\{\{>\s*([\w-]+)\s*\}\}/g, (_, name) => {
    const partial = shared.get(name);
    if (partial === undefined) throw new Error(`unknown partial: ${name}`);
    return partial;
  });

execFileSync(
  'npx',
  ['@tailwindcss/cli', '-i', join(here, 'preview.css'), '-o', compiled, '--minify'],
  { cwd: join(here, '..'), stdio: 'inherit' },
);

const css = readFileSync(compiled, 'utf8');
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

const page = (marker, body) => `${marker}
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>${css}</style>
  </head>
  <body class="bg-surface">
${body}
  </body>
</html>
`;

let count = 0;
for (const file of readdirSync(cards).filter((f) => f.endsWith('.html'))) {
  const source = readFileSync(join(cards, file), 'utf8');
  const newline = source.indexOf('\n');
  const marker = source.slice(0, newline).trim();
  if (!marker.startsWith('<!-- @dsCard')) {
    throw new Error(`${file}: the first line must be an @dsCard marker`);
  }
  writeFileSync(join(dist, file), page(marker, expand(source.slice(newline + 1).trimEnd())));
  count += 1;
}

rmSync(compiled, { force: true });
console.log(`cards built: ${count}, css ${(css.length / 1024).toFixed(0)} KB`);
