import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Textarea } from '@/shared/ui/textarea';
import { Hint } from '@/shared/ui/tooltip';
import { Checkbox } from '@/shared/ui/checkbox';
import { Icon } from '@/shared/ui/icons';
import { subjectLeft } from '@/features/repo';

function useWheelScrollsSideways(field: React.RefObject<HTMLInputElement | null>) {
  useEffect(() => {
    const el = field.current;
    if (!el) return;

    const roll = (e: WheelEvent) => {
      const push = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (!push) return;
      const was = el.scrollLeft;
      el.scrollLeft = was + push;
      if (el.scrollLeft !== was) e.preventDefault();
    };

    el.addEventListener('wheel', roll, { passive: false });
    return () => el.removeEventListener('wheel', roll);
  }, [field]);
}

function MessageFields({
  message,
  description,
  onMessage,
  onDescription,
  onHotkey,
  generateHint,
  generateReady,
  generating,
  onGenerate,
}: {
  message: string;
  description: string;
  onMessage: (text: string) => void;
  onDescription: (text: string) => void;
  onHotkey: (e: React.KeyboardEvent) => void;
  generateHint: string;
  generateReady: boolean;
  generating: boolean;
  onGenerate: () => void;
}) {
  const { t } = useTranslation();
  const subject = useRef<HTMLInputElement>(null);
  useWheelScrollsSideways(subject);
  const left = subjectLeft(message);

  return (
    <div className="bg-control-fill space-y-1 rounded-md px-2.5 py-2">
      <div className="flex items-center gap-2">
        <Input
          ref={subject}
          bare
          value={message}
          onChange={(e) => onMessage(e.target.value)}
          onKeyDown={onHotkey}
          placeholder={t('workingTree.messagePlaceholder')}
          className="h-7 text-sm"
        />
        <span
          aria-label={t('workingTree.subjectLeft')}
          className={cn(
            'shrink-0 text-xs tabular-nums',
            left < 0 ? 'text-modified' : 'text-muted-foreground',
          )}
        >
          {left}
        </span>
        <Hint text={generateHint}>
          <span className="shrink-0">
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={t('workingTree.generate')}
              disabled={!generateReady || generating}
              onClick={onGenerate}
            >
              {generating ? (
                <Icon.waiting className="size-3.5 animate-spin" />
              ) : (
                <Icon.sparkle className="size-3.5" />
              )}
            </Button>
          </span>
        </Hint>
      </div>
      <Textarea
        bare
        value={description}
        onChange={(e) => onDescription(e.target.value)}
        onKeyDown={onHotkey}
        placeholder={t('workingTree.descriptionPlaceholder')}
        rows={3}
        className="max-h-40 overflow-y-auto"
      />
    </div>
  );
}

export function CommitBox({
  message,
  description,
  onMessage,
  onDescription,
  onHotkey,
  generateHint,
  generateReady,
  generating,
  onGenerate,
  amend,
  pushAfter,
  onPushAfter,
  merging,
  committable,
  busy,
  committing,
  onCommit,
  onAbort,
}: {
  message: string;
  description: string;
  onMessage: (text: string) => void;
  onDescription: (text: string) => void;
  onHotkey: (e: React.KeyboardEvent) => void;
  generateHint: string;
  generateReady: boolean;
  generating: boolean;
  onGenerate: () => void;
  amend: {
    checked: boolean;
    disabled: boolean;
    hint: string | null;
    onToggle: (next: boolean) => void;
  };
  pushAfter: boolean;
  onPushAfter: (next: boolean) => void;
  merging: boolean;
  committable: boolean;
  busy: boolean;
  committing: boolean;
  onCommit: () => void;
  onAbort: () => void;
}) {
  const { t } = useTranslation();
  const amendRow = (
    <label
      className={cn(
        'text-muted-foreground flex items-center gap-2 text-xs',
        amend.disabled && 'opacity-50',
      )}
    >
      <Checkbox
        checked={amend.checked}
        disabled={amend.disabled}
        onCheckedChange={(next) => amend.onToggle(next === true)}
        aria-label={t('workingTree.amend')}
      />
      {t('workingTree.amend')}
    </label>
  );
  return (
    <div className="flex shrink-0 flex-col gap-2 p-3">
      <MessageFields
        message={message}
        description={description}
        onMessage={onMessage}
        onDescription={onDescription}
        onHotkey={onHotkey}
        generateHint={generateHint}
        generateReady={generateReady}
        generating={generating}
        onGenerate={onGenerate}
      />
      {amend.hint ? <Hint text={amend.hint}>{amendRow}</Hint> : amendRow}
      <label className="text-muted-foreground flex items-center gap-2 text-xs">
        <Checkbox
          checked={pushAfter}
          onCheckedChange={(next) => onPushAfter(next === true)}
          aria-label={t('workingTree.pushAfter')}
        />
        {t('workingTree.pushAfter')}
      </label>
      {merging ? (
        <div className="flex gap-2">
          <Button className="flex-1" disabled={!committable || busy} onClick={onCommit}>
            {committing ? <Icon.waiting className="size-3.5 animate-spin" /> : null}
            {t('workingTree.commitAndMerge')}
          </Button>
          <Button variant="destructive" disabled={busy} onClick={onAbort}>
            {t('workingTree.abortMerge')}
          </Button>
        </div>
      ) : (
        <Button disabled={!committable || busy} onClick={onCommit}>
          {committing ? <Icon.waiting className="size-3.5 animate-spin" /> : null}
          {t('workingTree.commit')}
        </Button>
      )}
    </div>
  );
}
