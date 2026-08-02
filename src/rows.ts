import type { RowView, WindowView } from './types';

export const CHUNK = 512;
const KEEP = 96;

export type Segments = {
  readonly window: WindowView;
  readonly from: number;
  readonly to: number;
};

export class RowCache {
  private chunks = new Map<number, WindowView>();
  private used: number[] = [];
  private inflight = new Set<number>();

  clear(): void {
    this.chunks.clear();
    this.used = [];
    this.inflight.clear();
  }

  put(chunk: number, window: WindowView): void {
    this.chunks.set(chunk, window);
    this.inflight.delete(chunk);
    this.touch(chunk);

    while (this.used.length > KEEP) {
      const oldest = this.used.shift();
      if (oldest !== undefined) this.chunks.delete(oldest);
    }
  }

  private touch(chunk: number): void {
    const at = this.used.indexOf(chunk);
    if (at !== -1) this.used.splice(at, 1);
    this.used.push(chunk);
  }

  row(index: number): RowView | null {
    const window = this.chunks.get(Math.floor(index / CHUNK));
    if (!window) return null;
    return window.rows[index - window.start] ?? null;
  }

  segments(index: number): Segments | null {
    const window = this.chunks.get(Math.floor(index / CHUNK));
    if (!window) return null;
    const local = index - window.start;
    if (local < 0 || local >= window.rows.length) return null;
    return { window, from: window.segOffsets[local], to: window.segOffsets[local + 1] };
  }

  missing(first: number, last: number, total: number): number[] {
    const lo = Math.max(0, Math.floor(first / CHUNK) - 1);
    const hi = Math.min(Math.floor((total - 1) / CHUNK), Math.floor(last / CHUNK) + 1);

    const wanted: number[] = [];
    for (let chunk = lo; chunk <= hi; chunk++) {
      if (this.chunks.has(chunk)) {
        this.touch(chunk);
        continue;
      }
      if (this.inflight.has(chunk)) continue;
      this.inflight.add(chunk);
      wanted.push(chunk);
    }
    return wanted;
  }
}
