import { convertFileSrc } from '@tauri-apps/api/core';

export type AvatarLook = { kind: 'image'; image: CanvasImageSource } | { kind: 'identicon' };

export class AvatarCache {
  private images = new Map<string, HTMLImageElement>();
  private ready = new Set<string>();
  private bumped: () => void;

  constructor(bumped: () => void) {
    this.bumped = bumped;
  }

  refill(paths: Record<string, string>): void {
    this.load(paths, convertFileSrc);
  }

  refillRemote(urls: Record<string, string>): void {
    this.load(urls, (url) => url);
  }

  private load(sources: Record<string, string>, resolve: (value: string) => string): void {
    for (const [name, source] of Object.entries(sources)) {
      const key = name.toLowerCase();
      if (this.images.has(key)) continue;

      const image = new Image();
      image.onload = () => {
        this.ready.add(key);
        this.bumped();
      };
      image.src = resolve(source);
      this.images.set(key, image);
    }
  }

  lookOf(email: string): AvatarLook {
    const key = email.toLowerCase();
    const image = this.images.get(key);
    if (image && this.ready.has(key)) return { kind: 'image', image };
    return { kind: 'identicon' };
  }

  clear(): void {
    this.images.clear();
    this.ready.clear();
  }
}
