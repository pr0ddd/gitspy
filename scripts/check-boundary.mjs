import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const problems = [];

const sources = [];
const walk = (dir) => {
  for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) walk(path);
    else if (/\.tsx?$/.test(entry.name)) sources.push(path);
  }
};
walk('src');

for (const path of sources) {
  if (path === 'src/ipc.ts') continue;
  const text = readFileSync(join(root, path), 'utf8');
  if (/\binvoke\b/.test(text)) {
    problems.push(`${path}: обращается к invoke мимо слоя IPC (src/ipc.ts)`);
  }
}

for (const path of sources) {
  if (!path.startsWith('src/widgets/') && !path.startsWith('src/app/')) continue;
  const text = readFileSync(join(root, path), 'utf8');
  if (/hover:bg-fill-/.test(text)) {
    problems.push(
      `${path}: собирает вид наведения классами мимо словаря — возьми NavItem/ListRow/Tab/Button или HOVER_FILL из src/parts.tsx`,
    );
  }
}

execFileSync('cargo', ['test', '-q', '-p', 'gitspy-app'], { cwd: root, stdio: 'inherit' });

const changed = execFileSync('git', ['diff', '--name-only', '--', 'src/generated'], {
  cwd: root,
  encoding: 'utf8',
}).trim();
const untracked = execFileSync(
  'git',
  ['ls-files', '--others', '--exclude-standard', '--', 'src/generated'],
  { cwd: root, encoding: 'utf8' },
).trim();

const stale = [changed, untracked].filter(Boolean).join('\n');
if (stale) {
  problems.push(`типы границы разошлись с Rust, пересобери и закоммить:\n${stale}`);
}

if (problems.length) {
  for (const problem of problems) console.error(problem);
  process.exit(1);
}
console.log(`граница цела: ${sources.length} файлов, invoke только в src/ipc.ts`);
