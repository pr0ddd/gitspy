import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { termAck, termInput, termKill, termOpen, termResize } from '@/ipc';

const LOG = '/tmp/gitspy-probe.log';
const SAMPLE = '/tmp/gitspy-probe.dat';
const CWD = '/tmp';
const SAMPLE_BYTES = 10_000_000;
const TAIL_LIMIT = 8192;
const FLUSH_MS = 500;

const waitFor = (ready: () => boolean, limitMs: number): Promise<boolean> =>
  new Promise((resolve) => {
    const started = Date.now();
    const tick = () => {
      if (ready()) return resolve(true);
      if (Date.now() - started > limitMs) return resolve(false);
      setTimeout(tick, 30);
    };
    tick();
  });

const rest = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const payloadShape = (chunk: Uint8Array): string =>
  `${chunk.constructor.name} over ${chunk.buffer.constructor.name}`;

const framePacer = () => {
  let widest = 0;
  let previous = performance.now();
  let handle = 0;
  const loop = () => {
    const now = performance.now();
    widest = Math.max(widest, now - previous);
    previous = now;
    handle = requestAnimationFrame(loop);
  };
  handle = requestAnimationFrame(loop);
  return {
    stop: () => {
      cancelAnimationFrame(handle);
      return Math.round(widest);
    },
  };
};

export const mountProbe = async (): Promise<void> => {
  document.getElementById('root')?.remove();
  const host = document.createElement('div');
  host.className = 'bg-surface fixed inset-0 p-2';
  document.body.append(host);

  const term = new Terminal({
    fontFamily: "'Geist Mono Variable', Menlo, monospace",
    fontSize: 13,
    scrollback: 3000,
  });
  const fit = new FitAddon();
  term.loadAddon(fit);
  term.open(host);
  fit.fit();

  const reporter = await termOpen(CWD, `cat >> ${LOG}`, false, () => {});
  const report = (line: string) => termInput(reporter, `SPIKE ${line}\n`);

  try {
    term.loadAddon(new WebglAddon());
    await report('webgl ok');
  } catch (failure) {
    await report(`webgl fail ${String(failure)}`);
  }

  let title = '';
  term.onTitleChange((next) => {
    title = next;
  });

  const decoder = new TextDecoder();
  const measured = { id: 0, owed: 0, tail: '', bytes: 0, counting: false, outstanding: 0 };
  let shapeReported = false;

  const settleAcks = (arrived: number) => {
    measured.owed += arrived;
    if (measured.id === 0 || measured.owed === 0) return;
    const paid = measured.owed;
    measured.owed = 0;
    void termAck(measured.id, paid);
  };

  measured.id = await termOpen(CWD, null, false, (chunk) => {
    if (!shapeReported) {
      shapeReported = true;
      void report(`channel_payload ${payloadShape(chunk)}`);
    }
    if (measured.counting) measured.bytes += chunk.length;
    measured.tail = (measured.tail + decoder.decode(chunk, { stream: true })).slice(-TAIL_LIMIT);
    measured.outstanding += 1;
    term.write(chunk, () => {
      measured.outstanding -= 1;
      settleAcks(chunk.length);
    });
  });
  settleAcks(0);

  const input = (data: string) => termInput(measured.id, data);
  const seen = (mark: string) => measured.tail.includes(mark);

  await input("echo PROBE''_READY\n");
  await report((await waitFor(() => seen('PROBE_READY'), 10000)) ? 'shell ok' : 'shell FAIL');

  await input("test -t 1 && echo TTY''_OK || echo TTY''_FAIL\n");
  await waitFor(() => seen('TTY_OK') || seen('TTY_FAIL'), 5000);
  await report(seen('TTY_OK') ? 'tty ok' : 'tty FAIL');

  await input("printf '\\033]0;PROBETITLE\\007'\n");
  const titled = await waitFor(() => title.includes('PROBETITLE'), 5000);
  await report(titled ? 'osc_title ok' : `osc_title FAIL last=${title}`);

  await termResize(measured.id, 120, 30);
  term.resize(120, 30);
  await input("sleep 0.2; echo SIZE''_$(stty size | tr ' ' 'x')\n");
  await waitFor(() => /SIZE_\d+x\d+/.test(measured.tail), 5000);
  const size = /SIZE_(\d+x\d+)/.exec(measured.tail)?.[1] ?? 'none';
  await report(size === '30x120' ? `resize ok ${size}` : `resize FAIL ${size}`);

  await input(
    `yes xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx | head -c ${SAMPLE_BYTES} > ${SAMPLE}; echo GEN''_DONE\n`,
  );
  await waitFor(() => seen('GEN_DONE'), 15000);

  const pacer = framePacer();
  measured.counting = true;
  measured.bytes = 0;
  const started = performance.now();
  await input(`cat ${SAMPLE}; echo CAT''_EOF\n`);
  const drained = await waitFor(() => seen('CAT_EOF'), 60000);
  const atMarker = performance.now();
  await waitFor(() => measured.outstanding === 0, 30000);
  const atDrain = performance.now();
  measured.counting = false;
  const widestFrameGap = pacer.stop();

  if (!drained) {
    await report(`throughput FAIL bytes=${measured.bytes}`);
  } else {
    const ms = atMarker - started;
    const mbps = measured.bytes / 1e6 / (ms / 1000);
    await report(
      `throughput bytes=${measured.bytes} ms=${Math.round(ms)} mbps=${mbps.toFixed(1)} drain_ms=${Math.round(atDrain - atMarker)} max_frame_gap_ms=${widestFrameGap}`,
    );
  }

  await report('DONE');
  await rest(FLUSH_MS);
  await termKill(measured.id);
  await termKill(reporter);
};
