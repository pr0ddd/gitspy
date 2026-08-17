import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
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
  if (path === 'src/shared/api/ipc.ts') continue;
  const text = readFileSync(join(root, path), 'utf8');
  if (/\binvoke\b/.test(text)) {
    problems.push(
      `${path}: calls invoke directly, bypassing the IPC layer (src/shared/api/ipc.ts)`,
    );
  }
}

for (const path of sources) {
  if (!path.startsWith('src/widgets/') && !path.startsWith('src/app/')) continue;
  const text = readFileSync(join(root, path), 'utf8');
  if (/hover:bg-fill-/.test(text)) {
    problems.push(
      `${path}: builds the hover look out of raw classes, bypassing the vocabulary — take NavItem/ListRow/Tab/Button or HOVER_FILL from src/shared/ui/parts.tsx`,
    );
  }
}

execFileSync('cargo', ['test', '-q', '-p', 'gitspy-app'], { cwd: root, stdio: 'inherit' });

const changed = execFileSync('git', ['diff', '--name-only', '--', 'src/shared/api/generated'], {
  cwd: root,
  encoding: 'utf8',
}).trim();
const untracked = execFileSync(
  'git',
  ['ls-files', '--others', '--exclude-standard', '--', 'src/shared/api/generated'],
  { cwd: root, encoding: 'utf8' },
).trim();

const stale = [changed, untracked].filter(Boolean).join('\n');
if (stale) {
  problems.push(`boundary types have drifted from Rust, regenerate and commit them:\n${stale}`);
}

if (problems.length) {
  for (const problem of problems) console.error(problem);
  process.exit(1);
}
console.log(`boundary intact: ${sources.length} files, invoke only in src/shared/api/ipc.ts`);
