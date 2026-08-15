export type Picked = { path: string; staged: boolean };

export const samePick = (a: Picked | null, b: Picked | null): boolean =>
  a === b || (a !== null && b !== null && a.path === b.path && a.staged === b.staged);

export function pickNext(paths: readonly string[], leaving: string): string | null {
  const at = paths.indexOf(leaving);
  if (at < 0) return null;

  const rest = paths.filter((path) => path !== leaving);
  if (rest.length === 0) return null;

  return rest[Math.min(at, rest.length - 1)];
}

export function pickAfterMove(
  before: readonly string[],
  moved: string,
  fromStaged: boolean,
  after: readonly Picked[],
): Picked | null {
  const following = pickNext(before, moved);
  const stillHere = (path: string) =>
    after.some((seat) => seat.path === path && seat.staged === fromStaged);
  if (following !== null && stillHere(following)) {
    return { path: following, staged: fromStaged };
  }
  const landed = after.find((seat) => seat.path === moved && seat.staged !== fromStaged);
  return landed ? { path: landed.path, staged: landed.staged } : null;
}
