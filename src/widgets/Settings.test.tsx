import { fireEvent, render as bare, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { TooltipProvider } from '@/shared/ui/tooltip';
import { vi } from 'vitest';

vi.mock('@/shared/api/ipc', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  setAutofetchMinutes: vi.fn(() => Promise.resolve()),
  aiDetectServer: vi.fn(() =>
    Promise.resolve({ provider: 'lmstudio', models: ['qwen2.5-coder', 'llama3.1'] }),
  ),
  onHostConnected: vi.fn(() => Promise.resolve(() => {})),
  onHostFailed: vi.fn(() => Promise.resolve(() => {})),
}));
import * as ipc from '@/shared/api/ipc';
import { Settings } from './Settings';

const render = (ui: React.ReactElement) => bare(<TooltipProvider>{ui}</TooltipProvider>);
import '@/shared/config/i18n';

const shown = {
  open: true,
  collapsed: false,
  zoom: 1,
  onZoom: () => {},
  compact: false,
  onCompact: () => {},
  onToggle: () => {},
};

describe('the settings page', () => {
  beforeEach(() => localStorage.clear());

  it('a closed page takes up not a single pixel', () => {
    const { container } = render(<Settings {...shown} open={false} />);
    expect(container.innerHTML, 'closed settings are absence, not display:none').toBe('');
  });

  it('the General rows write to the same prefs the live behaviour reads', () => {
    render(<Settings {...shown} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Remember open tabs' }));
    expect(
      localStorage.getItem('gitspy.session.remember'),
      'the "remember open tabs" checkbox and session restore must read one and the same pref',
    ).toBe('false');

    fireEvent.change(screen.getByRole('spinbutton', { name: 'Auto-fetch interval' }), {
      target: { value: '7' },
    });
    expect(localStorage.getItem('gitspy.autofetch.minutes')).toBe('7');
  });

  it('the sections are on the left, and picking one changes both the content and the header', () => {
    render(<Settings {...shown} />);
    expect(screen.getByRole('button', { name: 'General' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Integrations' }));
    expect(
      screen.getByRole('button', { name: /Connect GitHub/ }),
      'the Integrations section carries a live GitHub connection, not a placeholder',
    ).toBeTruthy();
    expect(
      screen.getByRole('banner').textContent,
      'the ViewBar header names the open section',
    ).toContain('Integrations');
  });
});

describe('the AI section', () => {
  beforeEach(() => localStorage.clear());

  it('opening the section loads the list, detects the provider and picks a model on its own', async () => {
    render(<Settings {...shown} />);
    fireEvent.click(screen.getByRole('button', { name: 'AI commit message' }));

    expect(
      await screen.findByRole('button', { name: 'qwen2.5-coder' }),
      'the first model from the server response is selected on its own',
    ).toBeTruthy();
    expect(
      localStorage.getItem('gitspy.ai.provider'),
      'the provider is named by the server, not by the user',
    ).toBe('"lmstudio"');
    expect(
      localStorage.getItem('gitspy.ai.model'),
      'the chosen model goes to the pref that the generate button reads',
    ).toBe('"qwen2.5-coder"');
    expect(
      screen.getByText('Found LM Studio at this address.'),
      'the detected provider is named to the user',
    ).toBeTruthy();
  });

  it('an empty address tries both local ports in turn', async () => {
    vi.mocked(ipc.aiDetectServer)
      .mockClear()
      .mockRejectedValueOnce(new Error('dead'))
      .mockResolvedValueOnce({ provider: 'lmstudio', models: ['llama3.1'] });
    render(<Settings {...shown} />);
    fireEvent.click(screen.getByRole('button', { name: 'AI commit message' }));

    expect(
      await screen.findByRole('button', { name: 'llama3.1' }),
      'the second port saves the case when the first one stays silent',
    ).toBeTruthy();
    expect(vi.mocked(ipc.aiDetectServer).mock.calls.map((call) => call[0])).toEqual([
      'http://localhost:11434',
      'http://localhost:1234',
    ]);
  });
});

describe('the Interface section', () => {
  beforeEach(() => localStorage.clear());

  it('the minimap and the columns write to the same storage the live graph reads', () => {
    render(<Settings {...shown} />);
    fireEvent.click(screen.getByRole('button', { name: 'Interface' }));

    fireEvent.click(screen.getByRole('checkbox', { name: 'Graph minimap' }));
    expect(
      localStorage.getItem('gitspy.graph.minimap'),
      'the graph reads this pref on mount — otherwise the checkbox would be a stage prop; off by default, so the first click turns it on',
    ).toBe('true');

    fireEvent.click(screen.getByRole('checkbox', { name: 'Branch / Tag' }));
    expect(
      localStorage.getItem('gitspy.columns.hidden'),
      'column visibility shares its storage with the header context menu',
    ).toContain('branchTag');
  });
});
