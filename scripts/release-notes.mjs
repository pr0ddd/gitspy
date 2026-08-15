import { readFileSync } from 'node:fs';
import { notesFor } from './changelog.mjs';

const notes = notesFor(readFileSync('CHANGELOG.md', 'utf8'), process.argv[2] ?? '');
process.stdout.write(`${notes}\n`);
