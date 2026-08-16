import type { RowView } from '@/shared/api/types';

export type Person = { readonly name: string; readonly email: string };

const CO_AUTHOR = /^\s*Co-authored-by:\s*(.+?)\s*<([^>]+)>\s*$/gim;

export const coAuthorsOf = (body: string): Person[] =>
  Array.from(body.matchAll(CO_AUTHOR), (found) => ({ name: found[1], email: found[2] }));

export const authorsOf = (row: Extract<RowView, { kind: 'commit' }>): Person[] => {
  const author = { name: row.author, email: row.email };
  const others = coAuthorsOf(row.body).filter(
    (person) => person.email.toLowerCase() !== author.email.toLowerCase(),
  );
  return [author, ...others];
};

export const personLine = (person: Person): string =>
  person.email ? `${person.name} <${person.email}>` : person.name;

export const authorsLine = (row: Extract<RowView, { kind: 'commit' }>): string =>
  authorsOf(row).map(personLine).join(', ');
