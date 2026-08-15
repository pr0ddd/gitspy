import { Fragment, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { chordKeys, onApple, type Chord } from '@/keys';
import { COMMANDS, type Command, type CommandGroup } from '@/features/keyboard';
import { PanelNote, SearchField } from '@/parts';

const GROUPS: readonly CommandGroup[] = ['repo', 'navigation', 'ui'];

function Keys({ chord, apple }: { chord: Chord; apple: boolean }) {
  return (
    <span className="flex shrink-0 items-center gap-1">
      {chordKeys(chord, apple).map((part, at) => (
        <kbd
          key={at}
          className="bg-fill-2 text-muted-foreground text-2xs flex h-5 min-w-5 items-center justify-center rounded-sm px-1.5 font-sans"
        >
          {part}
        </kbd>
      ))}
    </span>
  );
}

function Line({ command, apple }: { command: Command; apple: boolean }) {
  const { t } = useTranslation();
  return (
    <div
      data-slot="shortcut"
      className="hover:bg-hover-fill flex h-7 items-center gap-2 rounded-md px-2 text-xs"
    >
      <span className="text-subject min-w-0 flex-1 truncate">
        {t(command.label as 'shortcuts.commit')}
      </span>
      {command.chords.map((chord, at) => (
        <Fragment key={at}>
          {at === 0 ? null : <span className="text-faint shrink-0">{t('shortcuts.or')}</span>}
          <Keys chord={chord} apple={apple} />
        </Fragment>
      ))}
    </div>
  );
}

export function Shortcuts({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const { t } = useTranslation();
  const apple = onApple();
  const [needle, setNeedle] = useState('');

  const wanted = needle.trim().toLowerCase();
  const matching = COMMANDS.filter((command) =>
    wanted === ''
      ? true
      : t(command.label as 'shortcuts.commit')
          .toLowerCase()
          .includes(wanted),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[min(70vh,34rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl"
      >
        <div className="bg-surface-raised flex h-11 shrink-0 items-center gap-2 border-b px-3">
          <DialogTitle className="flex shrink-0 items-center gap-2 text-sm">
            {t('shortcuts.title')}
            <Keys chord={{ key: '/', primary: true }} apple={apple} />
          </DialogTitle>
          <span className="flex-1" />
          <div className="flex w-56 shrink-0 items-center">
            <SearchField
              value={needle}
              size="xs"
              placeholder={t('shortcuts.filter')}
              onChange={setNeedle}
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
          {matching.length === 0 ? (
            <PanelNote>{t('shortcuts.nothing')}</PanelNote>
          ) : (
            GROUPS.filter((group) => matching.some((command) => command.group === group)).map(
              (group) => (
                <section key={group} className="mb-2">
                  <div className="text-muted-foreground flex h-7 items-center px-2 text-xs">
                    {t(`shortcuts.${group}` as 'shortcuts.repo')}
                  </div>
                  <Separator className="mb-1" />
                  {matching
                    .filter((command) => command.group === group)
                    .map((command) => (
                      <Line key={command.id} command={command} apple={apple} />
                    ))}
                </section>
              ),
            )
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
