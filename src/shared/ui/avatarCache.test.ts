import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AvatarCache } from '@/shared/ui/avatarCache';

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

describe('avatar cache', () => {
  it('the image shows up once it is decoded, and the cache wakes the render', async () => {
    const woke: number[] = [];
    const cache = new AvatarCache(() => woke.push(1));

    const settled = cache.refillRemote({ 'remote:u': 'https://u' });
    expect(cache.lookOf('remote:u').kind, 'an identicon until decoding finishes').toBe('identicon');

    FakeImage.pending[0].resolve();
    await settled;

    expect(cache.lookOf('remote:u').kind, 'the image once decoding finished').toBe('image');
    expect(woke.length, 'the render was woken').toBe(1);
  });

  it('a broken image does not hang the wait for the first frame', async () => {
    const cache = new AvatarCache(() => undefined);

    const settled = cache.refillRemote({ 'remote:u': 'https://broken' });
    FakeImage.pending[0].reject(new Error('EncodingError'));
    await settled;

    expect(cache.lookOf('remote:u').kind, 'a broken image stays an identicon').toBe('identicon');
  });

  it('a repeated refill does not build the image again and resolves at once', async () => {
    const cache = new AvatarCache(() => undefined);

    const first = cache.refillRemote({ 'remote:u': 'https://u' });
    FakeImage.pending[0].resolve();
    await first;

    await cache.refillRemote({ 'remote:u': 'https://u' });
    expect(FakeImage.pending.length, 'the second pass does not touch the network').toBe(1);
  });
});
