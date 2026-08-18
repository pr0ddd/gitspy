import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import * as ipc from '@/shared/api/ipc';

const fake = vi.hoisted(() => ({
  created: 0,
  reset() {
    this.created = 0;
  },
}));

vi.mock('@/entities/diff', async () => ({
  ...(await vi.importActual<object>('@/entities/diff/diff')),
  ...(await vi.importActual<object>('@/entities/diff/hunks')),
  ...(await vi.importActual<object>('@/entities/diff/target')),
  DIFF_EDITOR_BASE: {},
  EDITOR_BASE: {},
  languageOf: () => 'plaintext',
  setUpMonaco: () => {},
  userEditorOptions: () => ({}),
  setHiddenLineSpans: () => {},
  editorOptionsFor: () => ({}),
  monaco: {
    editor: {
      create: () => {
        fake.created += 1;
        return { onDidScrollChange: () => ({ dispose: () => {} }), dispose: () => {} };
      },
      createDiffEditor: () => {
        fake.created += 1;
        return { setModel: () => {}, dispose: () => {}, updateOptions: () => {} };
      },
      createModel: () => ({ dispose: () => {} }),
      ScrollType: { Immediate: 1 },
    },
  },
}));
vi.mock('@/shared/api/ipc', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fileHistory: vi.fn(() =>
    Promise.resolve([
      {
        hash: 'aaaa0000',
        subject: 'add the logo',
        author: 'Ann',
        email: 'ann@example.com',
        time: 1_700_000_000,
        path: 'logo.png',
        oldPath: null,
        row: 0,
        colour: 0,
      },
    ]),
  ),
  blameFile: vi.fn(() => Promise.resolve([])),
  diffSides: vi.fn(() => Promise.resolve({ before: '', after: '', binary: true })),
  commitFileHunks: vi.fn(() => Promise.resolve('')),
}));
import '@/shared/config/i18n';
import { TooltipProvider } from '@/shared/ui/tooltip';
import { FileHistoryView } from './FileHistoryView';

beforeEach(() => {
  localStorage.clear();
  fake.reset();
});

describe('the history of a binary file', () => {
  it('shows the binary note for a commit instead of an empty editor, and opens no editor at all', async () => {
    render(
      <TooltipProvider>
        <FileHistoryView
          repo="/repo"
          path="logo.png"
          from={null}
          avatars={null}
          onClose={() => {}}
        />
      </TooltipProvider>,
    );

    await waitFor(() => expect(screen.getByText(/binary file/i)).toBeTruthy());
    expect(ipc.diffSides).toHaveBeenCalled();
    expect(fake.created, 'no editor is created for bytes that are not text').toBe(0);
  });
});
