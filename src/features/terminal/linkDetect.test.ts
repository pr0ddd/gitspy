import { describe, expect, it } from 'vitest';
import { detectLinks } from './linkDetect';

describe('ссылки в строке терминала', () => {
  it('путь с номером строки распознаётся целиком', () => {
    const hits = detectLinks('Edit(src/entities/graph/scene.ts:214)');
    expect(hits).toHaveLength(1);
    expect(hits[0].link).toEqual({
      kind: 'file',
      text: 'src/entities/graph/scene.ts:214',
      path: 'src/entities/graph/scene.ts',
      line: 214,
    });
  });

  it('хеш коммита распознаётся, а обычное слово нет', () => {
    const hits = detectLinks('commit f3208d3 fixes decode');
    expect(hits.map((h) => h.link.kind)).toEqual(['hash']);
    expect(hits[0].link.text).toBe('f3208d3');
  });

  it('число само по себе хешем не считается', () => {
    expect(detectLinks('12345678 items')).toHaveLength(0);
  });

  it('start и end указывают на подстроку', () => {
    const line = 'see src/ipc.ts:5 now';
    const [hit] = detectLinks(line);
    expect(line.slice(hit.start, hit.end)).toBe('src/ipc.ts:5');
  });
});
