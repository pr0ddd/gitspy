export function stepped(at: number, delta: number, count: number): number {
  if (count <= 0) return -1;
  if (at < 0) return delta > 0 ? 0 : count - 1;
  return (((at + delta) % count) + count) % count;
}

export const rovingTabIndex = (at: number, index: number): 0 | -1 =>
  at < 0 ? (index === 0 ? 0 : -1) : index === at ? 0 : -1;
