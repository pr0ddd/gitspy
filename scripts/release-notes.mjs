import { readFileSync } from 'node:fs';
import { notesFor } from '../src/shared/lib/changelog.ts';

const notes = notesFor(readFileSync('CHANGELOG.md', 'utf8'), process.argv[2] ?? '');
process.stdout.write(`${notes}\n`);
