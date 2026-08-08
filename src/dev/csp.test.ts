import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { reportOf, type CspFindings } from './csp';

const findings = (over: Partial<CspFindings> = {}): CspFindings => ({
  enforced: true,
  subjects: [{ name: 'monaco_worker', ok: true, detail: 'changes=1' }],
  violations: [],
  ...over,
});

describe('отчёт пробы политики', () => {
  it('прогон без нарушений говорит clean и ok', () => {
    const lines = reportOf(findings());
    expect(lines, 'без нарушений отчёт обязан сказать clean').toContain('CSP clean');
    expect(lines).toContain('CSP RESULT ok');
  });

  it('нарушение печатается своей строкой с директивой и адресом', () => {
    const lines = reportOf(
      findings({
        violations: [
          { directive: 'worker-src', blocked: 'blob', source: 'index.js:1' },
          { directive: 'img-src', blocked: 'asset://localhost/a.img', source: 'index.js:2' },
        ],
      }),
    );
    expect(lines, 'чинить нечего, пока не видно директивы и адреса').toContain(
      'CSP violation directive=worker-src blocked=blob source=index.js:1',
    );
    expect(lines).toContain(
      'CSP violation directive=img-src blocked=asset://localhost/a.img source=index.js:2',
    );
    expect(lines, 'нарушение отменяет чистоту').not.toContain('CSP clean');
    expect(lines).toContain('CSP RESULT fail');
  });

  it('молчащий подопытный отменяет ok, даже когда нарушений нет', () => {
    const lines = reportOf(
      findings({ subjects: [{ name: 'monaco_worker', ok: false, detail: 'changes=0' }] }),
    );
    expect(lines, 'воркер под запретом умирает тихо: диф просто не считается').toContain(
      'CSP RESULT fail',
    );
  });

  it('отчёт всегда говорит, действовала ли политика', () => {
    expect(
      reportOf(findings({ enforced: false })),
      'чистый прогон без политики не доказывает ничего',
    ).toContain('CSP policy enforced=no');
    expect(reportOf(findings())).toContain('CSP policy enforced=yes');
  });
});

describe('политика окна приложения', () => {
  const conf: { app: { security: { csp: string | null } } } = JSON.parse(
    readFileSync('src-tauri/tauri.conf.json', 'utf8'),
  );
  const policy = conf.app.security.csp ?? '';

  const sourcesOf = (directive: string): string[] => {
    const found = policy
      .split(';')
      .map((part) => part.trim().split(/\s+/))
      .find((parts) => parts[0] === directive);
    return found ? found.slice(1) : [];
  };

  it('политика объявлена', () => {
    expect(policy, 'без политики окно с доступом к репозиторию грузит что угодно откуда угодно')
      .not.toBe('');
  });

  it('послабления политики — только те, без которых проба ловит нарушение', () => {
    expect(sourcesOf('style-src'), 'без unsafe-inline проба насчитала 74 нарушения style-src')
      .toContain("'unsafe-inline'");
    expect(sourcesOf('img-src'), 'без data: гаснут identicon-аватарки из toDataURL').toContain(
      'data:',
    );
    expect(sourcesOf('img-src'), 'без asset: гаснут аватарки из convertFileSrc').toContain(
      'asset:',
    );
    expect(sourcesOf('connect-src'), 'без ipc: рушится fetch на ipc://localhost — весь IPC')
      .toContain('ipc:');
  });

  it('свободы, без которых проба остаётся чистой, не выданы', () => {
    expect(sourcesOf('default-src'), 'всё неперечисленное закрыто').toEqual(["'self'"]);
    expect(sourcesOf('script-src'), 'чужой скрипт в этом окне — конец истории').toEqual(["'self'"]);
    expect(sourcesOf('worker-src'), 'vite отдаёт воркер monaco файлом того же источника').toEqual([
      "'self'",
    ]);
    expect(sourcesOf('font-src'), 'Geist приезжает woff2-файлами, не data-строками').toEqual([
      "'self'",
    ]);
    expect(sourcesOf('object-src'), 'плагинам в окне делать нечего').toEqual(["'none'"]);
    expect(sourcesOf('frame-src'), 'чужим кадрам в окне делать нечего').toEqual(["'none'"]);
  });
});
