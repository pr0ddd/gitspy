import { useTranslation } from 'react-i18next';
import { Button } from '@/shared/ui/button';
import { Icon } from '@/shared/ui/icons';
import { GIT } from '@/shared/config/vocabulary';

const COMMITS = [
  { x: -47.6, base: -27.5, top: -55.5, r: 6, lane: 1, seconds: 4.6, from: 0 },
  { x: -8.7, base: -5, top: -27, r: 6, lane: 1, seconds: 5.4, from: -1.4 },
  { x: 38.1, base: -12, top: -46, r: 5, lane: 3, seconds: 6.2, from: -2.6 },
  { x: 26, base: 15, top: -9, r: 6, lane: 1, seconds: 5, from: -3.1 },
  { x: 18.2, base: 44.5, top: 18.5, r: 5, lane: 2, seconds: 5.8, from: -0.7 },
  { x: 60.6, base: 35, top: 5, r: 6, lane: 1, seconds: 4.2, from: -2 },
];

function GraphHero() {
  return (
    <svg viewBox="0 0 300 150" className="h-50 w-100 overflow-visible" aria-hidden>
      <g transform="translate(150,66)">
        <g className="animate-hero-float motion-reduce:animate-none">
          <path
            d="M -131.6 -16 L 27.7 76 L 131.6 16 L 131.6 22 L 27.7 82 L -131.6 -10 Z"
            fill="var(--background)"
          />
          <path d="M -27.7 -76 L 131.6 16 L 27.7 76 L -131.6 -16 Z" fill="var(--card)" />
          <path
            d="M -27.7 -76 L 131.6 16 L 27.7 76 L -131.6 -16 Z"
            fill="var(--fill-1)"
            stroke="var(--fill-3)"
            strokeWidth="1"
          />
          <g transform="matrix(0.866 0.5 -0.866 0.5 0 0)" stroke="var(--fill-1)" strokeWidth="1">
            <path d="M -60 -60 L -60 60 M -30 -60 L -30 60 M 0 -60 L 0 60 M 30 -60 L 30 60 M 60 -60 L 60 60" />
            <path d="M -92 -30 L 92 -30 M -92 0 L 92 0 M -92 30 L 92 30" />
          </g>
          <g transform="matrix(0.866 0.5 -0.866 0.5 0 0)" fill="none" strokeLinecap="round">
            <path d="M -78 0 L 78 0" stroke="var(--graph-1)" strokeWidth="2.4" opacity="0.5" />
            <path
              d="M -36 0 C -18 0 -18 -34 0 -34 L 18 -34 C 36 -34 36 0 54 0"
              stroke="var(--graph-3)"
              strokeWidth="2.2"
              opacity="0.45"
            />
            <path
              d="M 4 0 C 22 0 22 34 40 34 L 68 34"
              stroke="var(--graph-2)"
              strokeWidth="2.2"
              opacity="0.4"
            />
            <path
              d="M -78 0 L 78 0"
              stroke="var(--graph-1)"
              strokeWidth="2.4"
              strokeDasharray="20 136"
              className="animate-hero-dash motion-reduce:animate-none"
            />
          </g>
          <g fill="var(--fill-3)">
            {COMMITS.map((commit) => (
              <circle key={commit.x} cx={commit.x} cy={commit.base} r="1.3" />
            ))}
          </g>
          <g stroke="var(--fill-3)" strokeWidth="1">
            {COMMITS.map((commit) => (
              <line key={commit.x} x1={commit.x} y1={commit.base} x2={commit.x} y2={commit.top} />
            ))}
          </g>
          {COMMITS.map((commit) => (
            <g
              key={commit.x}
              className="animate-hero-bob motion-reduce:animate-none"
              style={{ animationDuration: `${commit.seconds}s`, animationDelay: `${commit.from}s` }}
            >
              <circle
                cx={commit.x}
                cy={commit.top}
                r={commit.r}
                fill={`var(--graph-${commit.lane})`}
              />
            </g>
          ))}
        </g>
      </g>
    </svg>
  );
}

export function StartEmpty({
  onOpen,
  onClone,
  onCreate,
}: {
  onOpen: () => void;
  onClone: () => void;
  onCreate: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 p-6">
      <GraphHero />

      <div className="flex flex-col items-center gap-2.5">
        <h2 className="text-foreground text-xl leading-relaxed font-semibold">
          {t('start.emptyTitle')}
        </h2>
        <p className="text-muted-foreground max-w-96 text-center text-xs leading-relaxed text-pretty">
          {t('start.emptyBody')}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Button size="sm" onClick={onOpen}>
          <Icon.open className="size-3.5" />
          {t('start.openFolder')}
        </Button>
        <Button variant="outline" size="sm" onClick={onClone}>
          <Icon.clone className="size-3.5" />
          {GIT.clone}
        </Button>
        <Button variant="outline" size="sm" onClick={onCreate}>
          <Icon.add className="size-3.5" />
          {t('start.create')}
        </Button>
      </div>

      <p className="text-faint text-2xs">{t('start.emptyDrop')}</p>
    </div>
  );
}
