import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Progress } from '@/components/ui/progress';
import { Slider } from '@/components/ui/slider';
import { useAgentSessions } from '@/entities/agent';
import type { AgentStatus, AgentUsage } from '@/entities/agent';
import { sendPrompt, setConfigValue } from '@/features/agent';
import { Icon } from '@/icons';
import { timeUntil } from '@/time';
import { notifyError } from '@/toast';
import type { AcpConfigOptionView, AcpRateLimitView } from '@/types';

type Props = {
  id: number;
  repo: string;
};

export const AGENT_STATUS_LABEL = {
  working: 'agent.working',
  stopping: 'agent.stopping',
  waiting: 'agent.waiting',
  ready: 'agent.ready',
  dead: 'agent.dead',
} as const satisfies Record<AgentStatus, string>;

const RING = { size: 14, stroke: 2 };
const RING_RADIUS = (RING.size - RING.stroke) / 2;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

const standsLeftOfInput = (option: AcpConfigOptionView): boolean => option.category === 'mode';

const goesOnAScale = (option: AcpConfigOptionView): boolean =>
  option.category === 'thought_level' && option.choices.length > 2;

const STANDS_BY_THE_INPUT = ['model', 'thought_level'];

const standsRightOfInput = (option: AcpConfigOptionView): boolean =>
  STANDS_BY_THE_INPUT.includes(option.category);

const nameOfCurrentValue = (option: AcpConfigOptionView): string =>
  option.choices.find((choice) => choice.value === option.currentValue)?.name ??
  option.currentValue;

const PLAN_USAGE_COMMAND = 'usage';

const NOTHING_SPENT: AgentUsage = { used: 0, size: 0, cost: null, currency: null, limits: [] };

const shareOfWindow = (usage: AgentUsage): number =>
  usage.size > 0 ? Math.min(1, usage.used / usage.size) : 0;

function ConfigChip({
  option,
  filled,
  onPick,
}: {
  option: AcpConfigOptionView;
  filled: boolean;
  onPick: (value: string) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={filled ? 'secondary' : 'action'}
          size="xs"
          title={option.description ?? option.name}
          aria-label={option.name}
        >
          {nameOfCurrentValue(option)}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={filled ? 'start' : 'end'} className="min-w-0">
        <DropdownMenuLabel>{option.name}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={option.currentValue} onValueChange={onPick}>
          {option.choices.map((choice) => (
            <DropdownMenuRadioItem key={choice.value} value={choice.value}>
              {choice.name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ScaleChip({
  option,
  onPick,
}: {
  option: AcpConfigOptionView;
  onPick: (value: string) => void;
}) {
  const { t } = useTranslation();
  const at = option.choices.findIndex((choice) => choice.value === option.currentValue);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="action"
          size="xs"
          title={option.description ?? option.name}
          aria-label={option.name}
        >
          {nameOfCurrentValue(option)}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-64 flex-col gap-2 p-3">
        <div className="flex items-baseline gap-2">
          <span className="text-muted-foreground text-xs">{option.name}</span>
          <span className="text-xs font-medium">{nameOfCurrentValue(option)}</span>
        </div>
        <div className="text-muted-foreground text-2xs flex items-center justify-between">
          <span>{t('agent.faster')}</span>
          <span>{t('agent.smarter')}</span>
        </div>
        <Slider
          aria-label={option.name}
          value={[Math.max(0, at)]}
          min={0}
          max={option.choices.length - 1}
          step={1}
          onValueChange={([next]) => {
            const picked = option.choices[next];
            if (picked && picked.value !== option.currentValue) onPick(picked.value);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

function PlanLimitRow({ limit }: { limit: AcpRateLimitView }) {
  const { t, i18n } = useTranslation();
  const named = t(`agent.limit.${limit.kind}` as 'agent.limit.five_hour', {
    defaultValue: limit.kind,
  });
  const standing = t(`agent.limitStatus.${limit.status}` as 'agent.limitStatus.allowed', {
    defaultValue: limit.status,
  });
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="flex min-w-0 items-baseline gap-1.5">
          <span className="truncate text-xs">{named}</span>
          <span className="text-muted-foreground text-2xs">{standing}</span>
        </span>
        {limit.resetsAt === null ? null : (
          <span className="text-muted-foreground text-2xs shrink-0 tabular-nums">
            {t('agent.resets', {
              when: timeUntil(limit.resetsAt, Date.now() / 1000, i18n.language),
            })}
          </span>
        )}
      </div>
      {limit.usedShare === null ? null : <Progress value={limit.usedShare * 100} />}
    </div>
  );
}

function UsageRing({
  spent,
  asksTheAgent,
}: {
  spent: AgentUsage | null;
  asksTheAgent: (() => void) | null;
}) {
  const { t, i18n } = useTranslation();
  const usage = spent ?? NOTHING_SPENT;
  const share = shareOfWindow(usage);
  const percent = new Intl.NumberFormat(i18n.language, { style: 'percent' }).format(share);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="muted"
          size="icon-xs"
          aria-label={t('agent.context')}
          title={`${t('agent.context')} ${percent}`}
        >
          <svg width={RING.size} height={RING.size} viewBox={`0 0 ${RING.size} ${RING.size}`}>
            <circle
              cx={RING.size / 2}
              cy={RING.size / 2}
              r={RING_RADIUS}
              fill="none"
              stroke="currentColor"
              strokeWidth={RING.stroke}
              className="opacity-30"
            />
            <circle
              cx={RING.size / 2}
              cy={RING.size / 2}
              r={RING_RADIUS}
              fill="none"
              stroke="currentColor"
              strokeWidth={RING.stroke}
              strokeLinecap="round"
              strokeDasharray={`${RING_LENGTH * share} ${RING_LENGTH}`}
              transform={`rotate(-90 ${RING.size / 2} ${RING.size / 2})`}
            />
          </svg>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-64 flex-col gap-1.5 p-3">
        <div className="flex items-baseline justify-between">
          <span className="text-xs">{t('agent.context')}</span>
          <span className="text-muted-foreground text-2xs tabular-nums">
            {t('agent.contextTokens', { used: usage.used, size: usage.size })}
          </span>
        </div>
        <Progress value={share * 100} />
        {usage.cost !== null && usage.currency !== null ? (
          <span className="text-muted-foreground text-2xs tabular-nums">
            {t('agent.spent', {
              amount: new Intl.NumberFormat(i18n.language, {
                style: 'currency',
                currency: usage.currency,
              }).format(usage.cost),
            })}
          </span>
        ) : null}
        {usage.limits.length === 0 && !asksTheAgent ? null : (
          <div className="border-border mt-1 flex flex-col gap-2 border-t pt-2">
            {asksTheAgent ? (
              <Button variant="action" size="xs" onClick={asksTheAgent}>
                {t('agent.limits')}
                <Icon.forward />
              </Button>
            ) : (
              <span className="text-muted-foreground text-2xs">{t('agent.limits')}</span>
            )}
            {usage.limits.map((limit) => (
              <PlanLimitRow key={limit.kind} limit={limit} />
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function RestOfOptions({
  options,
  onPick,
}: {
  options: AcpConfigOptionView[];
  onPick: (option: AcpConfigOptionView) => (value: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="muted" size="icon-xs" aria-label={t('agent.moreOptions')}>
          <Icon.chevron className="rotate-90" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-0">
        {options.map((option) => (
          <div key={option.id}>
            <DropdownMenuLabel>{option.name}</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={option.currentValue} onValueChange={onPick(option)}>
              {option.choices.map((choice) => (
                <DropdownMenuRadioItem key={choice.value} value={choice.value}>
                  {choice.name}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AgentChips({ id }: Props) {
  const session = useAgentSessions((state) => state.sessions.find((one) => one.id === id));
  const config = session?.config ?? [];
  const beforeInput = config.filter(standsLeftOfInput);
  const afterInput = config.filter(standsRightOfInput);
  const rest = config.filter(
    (option) => !standsLeftOfInput(option) && !standsRightOfInput(option),
  );
  const pick = (option: AcpConfigOptionView) => (value: string) =>
    setConfigValue(id, option.id, value).catch(notifyError);
  const knowsPlanUsage = (session?.commands ?? []).some(
    (command) => command.name === PLAN_USAGE_COMMAND,
  );
  const askForPlanUsage = knowsPlanUsage
    ? () => sendPrompt(id, `/${PLAN_USAGE_COMMAND}`).catch(notifyError)
    : null;

  return (
    <div className="flex h-7 items-center gap-1">
      {beforeInput.map((option) => (
        <ConfigChip key={option.id} option={option} filled onPick={pick(option)} />
      ))}
      {rest.length > 0 ? <RestOfOptions options={rest} onPick={pick} /> : null}
      <div className="flex min-w-0 flex-1 items-center justify-end gap-1 overflow-hidden">
        {afterInput.map((option) =>
          goesOnAScale(option) ? (
            <ScaleChip key={option.id} option={option} onPick={pick(option)} />
          ) : (
            <ConfigChip key={option.id} option={option} filled={false} onPick={pick(option)} />
          ),
        )}
        <UsageRing spent={session?.usage ?? null} asksTheAgent={askForPlanUsage} />
      </div>
    </div>
  );
}
