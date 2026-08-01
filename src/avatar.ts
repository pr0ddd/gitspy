/**
 * Идентиконы: детерминированная картинка из строки, как у GitHub и the reference client.
 *
 * Генерируем локально, а не тянем с граватара или из GitHub API. Старое
 * приложение ходило в сеть за аватарками прямо при открытии репозитория и
 * блокировало на этом весь интерфейс. Здесь картинка — чистая функция от
 * почты автора: без сети, без ожидания, без кэша на диске.
 */

const cache = new Map<string, HTMLCanvasElement>();

/** FNV-1a: дешёвый и хорошо перемешивающий для наших целей. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function identicon(key: string, size: number): HTMLCanvasElement {
  const cacheKey = `${key}@${size}`;
  const hit = cache.get(cacheKey);
  if (hit) return hit;

  const dpr = window.devicePixelRatio || 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(size * dpr);
  canvas.height = Math.round(size * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const h = hash(key);
  const hue = h % 360;
  const fg = `hsl(${hue} 70% 62%)`;
  const bg = `hsl(${hue} 45% 22%)`;

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);

  // Сетка 5×5, симметричная по вертикали — узнаваемая форма идентикона.
  const cells = 5;
  const cell = size / cells;
  ctx.fillStyle = fg;
  for (let x = 0; x < 3; x++) {
    for (let y = 0; y < cells; y++) {
      const bit = (h >>> ((x * cells + y) % 29)) & 1;
      if (!bit) continue;
      ctx.fillRect(Math.floor(x * cell), Math.floor(y * cell), Math.ceil(cell), Math.ceil(cell));
      const mirror = cells - 1 - x;
      if (mirror !== x) {
        ctx.fillRect(
          Math.floor(mirror * cell),
          Math.floor(y * cell),
          Math.ceil(cell),
          Math.ceil(cell),
        );
      }
    }
  }

  if (cache.size > 4000) cache.clear();
  cache.set(cacheKey, canvas);
  return canvas;
}
