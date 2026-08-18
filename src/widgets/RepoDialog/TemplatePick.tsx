import { useTranslation } from 'react-i18next';

import { Button } from '@/shared/ui/button';

import { Icon } from '@/shared/ui/icons';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';

export function TemplatePick({
  value,
  choices,
  onPick,
  ariaLabel,
}: {
  value: string;
  choices: ReadonlyArray<{ key: string; label: string }>;
  onPick: (key: string) => void;
  ariaLabel: string;
}) {
  const { t } = useTranslation();
  const chosen = choices.find((c) => c.key === value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="w-64 justify-between font-normal"
          aria-label={ariaLabel}
        >
          <span className="truncate">{chosen ? chosen.label : t('repoDialog.none')}</span>
          <Icon.chevron className="size-3 rotate-90 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-64 w-64 overflow-y-auto">
        <DropdownMenuRadioGroup value={value} onValueChange={onPick}>
          <DropdownMenuRadioItem value="">{t('repoDialog.none')}</DropdownMenuRadioItem>
          {choices.map((choice) => (
            <DropdownMenuRadioItem key={choice.key} value={choice.key}>
              {choice.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
