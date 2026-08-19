import { Banner } from '@/widgets/Banner';
import type { BannerUpdateView } from '@/shared/api/types';

const STATES: { key: string; update: BannerUpdateView | null }[] = [
  { key: 'loading', update: null },
  { key: 'updating', update: { phase: 'downloading', version: '1.3.0', percent: 40 } },
];

const WINDOW = { width: 260, height: 460 };

export function BannerGallery() {
  return (
    <div className="flex h-screen flex-wrap content-start gap-8 overflow-auto bg-muted-foreground/40 p-10 text-foreground">
      {STATES.map((state) => (
        <figure key={state.key} className="flex flex-col gap-2">
          <div style={WINDOW} className="rounded-2xl shadow-lg">
            <Banner update={state.update} />
          </div>
          <figcaption className="text-muted-foreground text-xs">{state.key}</figcaption>
        </figure>
      ))}
    </div>
  );
}
