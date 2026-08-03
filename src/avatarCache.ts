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
    for (const [email, path] of Object.entries(paths)) {
      const key = email.toLowerCase();
      if (this.images.has(key)) continue;

      const image = new Image();
      image.onload = () => {
        this.ready.add(key);
        this.bumped();
      };
      image.src = convertFileSrc(path);
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
