import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { workingTreeHunks } from '@/ipc';
import type { WorkingTreeView } from '@/types';
import '@/i18n';
import { ReviewView } from './ReviewView';

vi.mock('@/ipc', () => ({
  workingTreeHunks: vi.fn(async () => PATCH),
}));

const PATCH = `diff --git a/src/a.ts b/src/a.ts
@@ -10,3 +10,4 @@ fn one()
 kept one
-gone
+came
+came too
@@ -40,2 +41,2 @@ fn two()
 kept two
-old tail
+new tail
`;

const TREE = {
  branch: 'master',
  upstream: null,
  remotes: [],
  ahead: 0,
  behind: 0,
  staged: 0,
  unstaged: 2,
  conflicts: 0,
  inProgress: null,
  merging: null,
  entries: [
    { staged: false, letter: 'M', path: 'src/a.ts', oldPath: null },
    { staged: false, letter: 'A', path: 'src/b.ts', oldPath: null },
  ],
} as WorkingTreeView;

const shown = () => render(<ReviewView repo="/r" tree={TREE} onOpenFile={() => {}} />);

beforeEach(() => vi.clearAllMocks());

describe('свиток изменений', () => {
  it('пока файл свёрнут, его дифф не читается', () => {
    shown();
    expect(screen.getByText('a.ts')).toBeTruthy();
    expect(
      vi.mocked(workingTreeHunks),
      'на дереве в сотню файлов жадное чтение положило бы открытие вида',
    ).not.toHaveBeenCalled();
  });

  it('раскрытие читает дифф один раз и показывает строки', async () => {
    shown();
    fireEvent.click(screen.getByRole('button', { name: /a\.ts/ }));
    expect(await screen.findByText('came too')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /a\.ts/ }));
    fireEvent.click(screen.getByRole('button', { name: /a\.ts/ }));
    await waitFor(() =>
      expect(
        vi.mocked(workingTreeHunks),
        'повторное раскрытие того же файла лезет в уже прочитанное',
      ).toHaveBeenCalledTimes(1),
    );
  });

  it('свёрнутый промежуток называет число скрытых строк и раскрывается', async () => {
    shown();
    fireEvent.click(screen.getByRole('button', { name: /a\.ts/ }));
    const gap = await screen.findByRole('button', { name: /27/ });
    fireEvent.click(gap);
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: /27/ }),
        'раскрытый промежуток не остаётся кнопкой с тем же числом',
      ).toBeNull(),
    );
  });

  it('файл без правок не притворяется пустым диффом', async () => {
    vi.mocked(workingTreeHunks).mockResolvedValueOnce('');
    shown();
    fireEvent.click(screen.getByRole('button', { name: /b\.ts/ }));
    expect(
      await screen.findByText('No text changes'),
      'пустая раскрытая строка читается как поломка, а не как двоичный файл',
    ).toBeTruthy();
  });
});

describe('пустое рабочее дерево', () => {
  it('говорит, что менять нечего, вместо подсказки про раскрытие файлов', () => {
    render(
      <ReviewView repo="/r" tree={{ ...TREE, entries: [] }} onOpenFile={() => {}} />,
    );
    expect(
      screen.getByText('Nothing changed yet'),
      'подсказка «выберите файл» над пустотой читается как поломка',
    ).toBeTruthy();
    expect(screen.queryByText('Files are collapsed. Select a file to expand it.')).toBeNull();
  });
});
