import { acpKill, acpOpen, acpPrompt, termInput, termKill, termOpen } from '@/ipc';
import type { AcpCommandView, AcpConfigOptionView, AcpEventView } from '@/types';

const REPO = '/Users/pavelerohovets/projects/gitspy';
const REPORT = 'cat >> /tmp/gitspy-acp-probe.log';
const ASK = 'перечисли три файла в этом репозитории';
const TURN_LIMIT_MS = 180000;
const CONFIG_LIMIT_MS = 20000;
const NAMES_SHOWN = 12;

type Usage = { used: number; size: number; cost: number | null; currency: string | null };

const waitFor = (ready: () => boolean, limitMs: number): Promise<boolean> =>
  new Promise((resolve) => {
    const from = Date.now();
    const tick = () => {
      if (ready()) return resolve(true);
      if (Date.now() - from > limitMs) return resolve(false);
      setTimeout(tick, 30);
    };
    tick();
  });

const chipOf = (option: AcpConfigOptionView): string =>
  `${option.category || 'uncategorised'}:${option.id}=${option.currentValue}(${option.choices.length})`;

const chipsOf = (options: AcpConfigOptionView[]): string => options.map(chipOf).join(' ');

const namesOf = (commands: AcpCommandView[]): string =>
  commands
    .slice(0, NAMES_SHOWN)
    .map((command) => command.name)
    .join(' ');

const spentOf = (usage: Usage): string =>
  `used=${usage.used} size=${usage.size} share=${Math.round((usage.used / usage.size) * 100)}% cost=${usage.cost ?? 'none'} ${usage.currency ?? ''}`.trim();

export const mountProbe = async (): Promise<void> => {
  document.getElementById('root')?.remove();
  const lines: string[] = [];
  const started = performance.now();
  const stamp = () => Math.round(performance.now() - started);
  const log = (line: string) => lines.push(`ACP ${line}`);

  let opened = 0;
  try {
    let text = '';
    let firstChunkAt = 0;
    let config: AcpConfigOptionView[] = [];
    let commands: AcpCommandView[] = [];
    let usage: Usage | null = null;
    let usageEvents = 0;
    let thought = '';
    let thoughtEvents = 0;
    const tools: string[] = [];
    let finish: (reason: string) => void = () => {};
    const turned = new Promise<string>((resolve) => {
      finish = resolve;
    });
    opened = await acpOpen(
      REPO,
      (event: AcpEventView) => {
        if (event.kind === 'messageChunk') {
          if (!firstChunkAt) firstChunkAt = stamp();
          text += event.text;
        }
        if (event.kind === 'thought') {
          thoughtEvents += 1;
          thought += event.text;
        }
        if (event.kind === 'toolCall') tools.push(event.title);
        if (event.kind === 'config') config = event.options;
        if (event.kind === 'commands') commands = event.commands;
        if (event.kind === 'usage') {
          usageEvents += 1;
          usage = {
            used: event.used,
            size: event.size,
            cost: event.cost,
            currency: event.currency,
          };
        }
        if (event.kind === 'turnEnded') finish(event.stopReason);
        if (event.kind === 'fatal') finish(`fatal:${event.detail}`);
      },
    );
    log(`open ok ${stamp()}ms id=${opened}`);

    await waitFor(() => config.length > 0, CONFIG_LIMIT_MS);
    log(`config options=${config.length} ${chipsOf(config)}`);

    const prompted = stamp();
    await acpPrompt(opened, ASK);
    const reason = await Promise.race([
      turned,
      new Promise<string>((resolve) => setTimeout(() => resolve('timeout'), TURN_LIMIT_MS)),
    ]);

    log(`commands count=${commands.length} first=${namesOf(commands)}`);
    log(`usage events=${usageEvents} ${usage ? spentOf(usage) : 'none'}`);
    log(`thought events=${thoughtEvents} text=${JSON.stringify(thought.slice(0, 120))}`);
    log(`tools count=${tools.length} ${tools.join(' | ')}`);
    log(
      `turn ${reason} at ${stamp()}ms; first_chunk +${firstChunkAt - prompted}ms; text=${JSON.stringify(text)}`,
    );
    const filled = config.length > 0 && commands.length > 0 && usage !== null;
    log(reason === 'end_turn' && text.length > 0 && filled ? 'RESULT ok' : 'RESULT fail');
  } catch (failure) {
    log(`RESULT fail ${failure instanceof Error ? failure.message : JSON.stringify(failure)}`);
  }

  if (opened) await acpKill(opened).catch(() => {});

  const reporter = await termOpen(REPO, REPORT, false, () => {});
  await termInput(reporter, lines.join('\n') + '\n');
  await new Promise((resolve) => setTimeout(resolve, 500));
  await termKill(reporter);
};
