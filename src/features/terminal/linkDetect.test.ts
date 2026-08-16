import { describe, expect, it } from 'vitest';
import { detectLinks } from './linkDetect';

describe('links in a terminal line', () => {
  it('detects a path with a line number as one whole link', () => {
    const hits = detectLinks('Edit(src/entities/graph/scene.ts:214)');
    expect(hits).toHaveLength(1);
    expect(hits[0].link).toEqual({
      kind: 'file',
      text: 'src/entities/graph/scene.ts:214',
      path: 'src/entities/graph/scene.ts',
      line: 214,
    });
  });

  it('detects a commit hash but leaves an ordinary word alone', () => {
    const hits = detectLinks('commit f3208d3 fixes decode');
    expect(hits.map((h) => h.link.kind)).toEqual(['hash']);
    expect(hits[0].link.text).toBe('f3208d3');
  });

  it('does not take a plain number for a hash', () => {
    expect(detectLinks('12345678 items')).toHaveLength(0);
  });

  it('points start and end at the substring the link was found in', () => {
    const line = 'see src/ipc.ts:5 now';
    const [hit] = detectLinks(line);
    expect(line.slice(hit.start, hit.end)).toBe('src/ipc.ts:5');
  });
});
