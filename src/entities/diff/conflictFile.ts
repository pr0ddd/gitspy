export type ConflictBlock =
  | { kind: 'common'; lines: string[] }
  | { kind: 'conflict'; ours: string[]; base: string[]; theirs: string[] };

export type Pick = { a: Set<number>; b: Set<number> };
export type Picks = Record<number, Pick>;

export function parseConflictFile(text: string): ConflictBlock[] {
  const blocks: ConflictBlock[] = [];
  let common: string[] = [];
  let conflict: { ours: string[]; base: string[]; theirs: string[] } | null = null;
  let side: 'ours' | 'base' | 'theirs' = 'ours';

  const closeCommon = () => {
    if (common.length) blocks.push({ kind: 'common', lines: common });
    common = [];
  };

  for (const line of text.split('\n')) {
    if (conflict === null) {
      if (line.startsWith('<<<<<<<')) {
        closeCommon();
        conflict = { ours: [], base: [], theirs: [] };
        side = 'ours';
      } else {
        common.push(line);
      }
      continue;
    }

    if (line.startsWith('|||||||')) {
      side = 'base';
    } else if (line.startsWith('=======')) {
      side = 'theirs';
    } else if (line.startsWith('>>>>>>>')) {
      blocks.push({ kind: 'conflict', ...conflict });
      conflict = null;
    } else {
      conflict[side].push(line);
    }
  }

  if (conflict !== null) blocks.push({ kind: 'conflict', ...conflict });
  closeCommon();
  return blocks;
}

export const emptyPicks = (blocks: ConflictBlock[]): Picks =>
  Object.fromEntries(
    blocks.flatMap((block, at) =>
      block.kind === 'conflict' ? [[at, { a: new Set<number>(), b: new Set<number>() }]] : [],
    ),
  );

export function composeOutput(blocks: ConflictBlock[], picks: Picks): string {
  const lines: string[] = [];
  blocks.forEach((block, at) => {
    if (block.kind === 'common') {
      lines.push(...block.lines);
      return;
    }
    const pick = picks[at] ?? { a: new Set(), b: new Set() };
    block.ours.forEach((line, i) => {
      if (pick.a.has(i)) lines.push(line);
    });
    block.theirs.forEach((line, i) => {
      if (pick.b.has(i)) lines.push(line);
    });
  });
  return lines.join('\n');
}
