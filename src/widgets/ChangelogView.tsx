import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { RELEASES } from '@/entities/changelog';
import { PanelNote, Prose } from '@/parts';

const onLocalDay = (date: string) => new Date(`${date}T00:00:00`);

export function ChangelogView() {
  const { t, i18n } = useTranslation();
  const day = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'full' });

  return (
    <main className="min-h-0 min-w-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-2xl px-8 pb-16">
        {RELEASES.length === 0 ? <PanelNote>{t('changelog.empty')}</PanelNote> : null}

        {RELEASES.map((release, at) => (
          <section
            key={release.version}
            className={cn('space-y-4 pb-12', at === 0 ? 'pt-8' : 'border-t pt-12')}
          >
            <div className="space-y-1">
              <div className="flex items-baseline gap-3">
                <h2 className="text-xl font-semibold tracking-tight tabular-nums">
                  {t('changelog.version', { version: release.version })}
                </h2>
                {release.version === __APP_VERSION__ ? (
                  <span className="bg-fill-2 text-muted-foreground text-2xs rounded-sm px-1.5 py-0.5">
                    {t('changelog.installed')}
                  </span>
                ) : null}
              </div>
              <p className="text-muted-foreground text-xs">
                {day.format(onLocalDay(release.date))}
              </p>
            </div>
            <Prose text={release.body} />
          </section>
        ))}
      </div>
    </main>
  );
}
