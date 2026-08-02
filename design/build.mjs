import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const cards = join(here, 'cards');
const dist = join(here, 'dist');
const compiled = join(here, '.compiled.css');

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
<html lang="ru">
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
    throw new Error(`${file}: первая строка обязана быть маркером @dsCard`);
  }
  writeFileSync(join(dist, file), page(marker, source.slice(newline + 1).trimEnd()));
  count += 1;
}

rmSync(compiled, { force: true });
console.log(`собрано карточек: ${count}, css ${(css.length / 1024).toFixed(0)} КБ`);
