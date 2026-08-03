import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AvatarCache } from './avatarCache';

class FakeImage {
  src = '';
  static pending: { resolve: () => void; reject: (error: Error) => void }[] = [];

  decode(): Promise<void> {
    return new Promise((resolve, reject) => {
      FakeImage.pending.push({ resolve, reject });
    });
  }
}

beforeEach(() => {
  FakeImage.pending = [];
  vi.stubGlobal('Image', FakeImage);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('кэш аватарок', () => {
  it('картинка появляется после декодирования, и кэш будит отрисовку', async () => {
    const woke: number[] = [];
    const cache = new AvatarCache(() => woke.push(1));

    const settled = cache.refillRemote({ 'remote:u': 'https://u' });
    expect(cache.lookOf('remote:u').kind, 'до декодирования — идентикон').toBe('identicon');

    FakeImage.pending[0].resolve();
    await settled;

    expect(cache.lookOf('remote:u').kind, 'после декодирования — картинка').toBe('image');
    expect(woke.length, 'отрисовка разбужена').toBe(1);
  });

  it('битая картинка не подвешивает ожидание первого кадра', async () => {
    const cache = new AvatarCache(() => undefined);

    const settled = cache.refillRemote({ 'remote:u': 'https://broken' });
    FakeImage.pending[0].reject(new Error('EncodingError'));
    await settled;

    expect(cache.lookOf('remote:u').kind, 'битая остаётся идентиконом').toBe('identicon');
  });

  it('повторный refill не создаёт картинку заново и разрешается сразу', async () => {
    const cache = new AvatarCache(() => undefined);

    const first = cache.refillRemote({ 'remote:u': 'https://u' });
    FakeImage.pending[0].resolve();
    await first;

    await cache.refillRemote({ 'remote:u': 'https://u' });
    expect(FakeImage.pending.length, 'второй заход не трогает сеть').toBe(1);
  });
});
