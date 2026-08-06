import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, waitFor, within } from '@testing-library/react';
import '../i18n';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ConflictView } from './ConflictView';
import * as ipc from '@/ipc';

vi.mock('@/ipc', () => ({
  conflictFile: vi.fn(),
  resolveConflict: vi.fn(),
}));

const MERGED = [
  'top();',
  '<<<<<<< HEAD',
  'ours();',
  '||||||| base',
  'base();',
  '=======',
  'theirs();',
  '>>>>>>> feature',
  'bottom();',
].join('\n');

const file = {
  base: 'top();\nbase();\nbottom();\n',
  ours: 'top();\nours();\nbottom();\n',
  theirs: 'top();\ntheirs();\nbottom();\n',
  merged: MERGED,
};

const draw = (onResolved: (tree: unknown) => void = () => {}) =>
  render(
    <TooltipProvider>
      <ConflictView
        repo="/r"
        path="greeting.ts"
        from="feature"
        into="main"
        onClose={() => {}}
        onResolved={onResolved}
      />
    </TooltipProvider>,
  );

const output = (view: ReturnType<typeof draw>) => within(view.getByRole('region'));

describe('резолв конфликтов выбором строк', () => {
  beforeEach(() => {
    vi.mocked(ipc.conflictFile).mockResolvedValue(file as never);
    vi.mocked(ipc.resolveConflict).mockClear();
  });

  it('пока ничего не выбрано, в выводе стоит база, а не стороны', async () => {
    const view = draw();
    await waitFor(() => expect(view.getAllByText('top();').length).toBeGreaterThan(0));
    expect(output(view).queryByText('ours();')).toBeNull();
    expect(output(view).queryByText('theirs();')).toBeNull();
    expect(
      output(view).getByText('base();'),
      'нерешённое место показывает общего предка, как the reference client фиолетовым',
    ).toBeTruthy();
  });

  it('клик по самой строке берёт её в вывод, клик в выводе — убирает', async () => {
    const view = draw();
    await waitFor(() => expect(view.getAllByText('ours();').length).toBe(1));

    fireEvent.click(view.getByText('ours();'));
    expect(
      output(view).getByText('ours();'),
      'строка целиком — цель клика, не только чекбокс',
    ).toBeTruthy();

    fireEvent.click(output(view).getByText('ours();'));
    expect(output(view).queryByText('ours();')).toBeNull();
  });

  it('галочка на строке стороны кладёт строку в вывод, повторный клик убирает', async () => {
    const view = draw();
    await waitFor(() => expect(view.getAllByText('ours();').length).toBe(1));

    const boxes = view.getAllByRole('checkbox');
    fireEvent.click(boxes[1]);
    expect(
      output(view).getByText('ours();'),
      'выбранная строка обязана появиться в выводе',
    ).toBeTruthy();

    fireEvent.click(view.getAllByRole('checkbox')[1]);
    expect(output(view).queryByText('ours();')).toBeNull();
  });

  it('галочка в шапке стороны забирает все её конфликтные строки', async () => {
    const view = draw();
    await waitFor(() => expect(view.getAllByText('theirs();').length).toBe(1));

    fireEvent.click(view.getAllByRole('checkbox')[2]);
    expect(output(view).getByText('theirs();')).toBeTruthy();
  });

  it('сохранение отправляет ровно собранный вывод и отдаёт дерево наверх', async () => {
    const tree = { conflicts: 0 };
    vi.mocked(ipc.resolveConflict).mockResolvedValue(tree as never);
    let resolved: unknown = null;
    const view = draw((next) => (resolved = next));
    await waitFor(() => expect(view.getAllByText('ours();').length).toBe(1));

    fireEvent.click(view.getAllByRole('checkbox')[1]);
    fireEvent.click(view.getByRole('button', { name: /mark resolved/i }));

    await waitFor(() => expect(resolved).toBe(tree));
    expect(
      vi.mocked(ipc.resolveConflict).mock.calls[0],
      'на диск уходит именно то, что человек собрал из строк',
    ).toEqual(['/r', 'greeting.ts', 'top();\nours();\nbottom();']);
  });
});
