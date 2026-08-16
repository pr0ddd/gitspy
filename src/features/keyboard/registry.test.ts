import { afterEach, describe, expect, it } from 'vitest';
import { areaOf } from './registry';

const mount = (html: string): HTMLElement => {
  document.body.innerHTML = html;
  return document.body.firstElementChild as HTMLElement;
};

afterEach(() => {
  document.body.innerHTML = '';
});

describe('which area the focus is in', () => {
  it('treats a text field as the text area: letters are typed there', () => {
    const host = mount('<div data-area="files"><input /></div>');
    expect(areaOf(host.querySelector('input'))).toBe('text');
  });

  it('does not treat a read-only diff as text: nobody types into it, so arrows and s/u must work', () => {
    const host = mount(
      '<main><div class="monaco-editor"><textarea class="inputarea"></textarea></div></main>',
    );
    expect(areaOf(host.querySelector('textarea'))).not.toBe('text');
  });

  it('treats an editable file in Monaco as text: there people really do type', () => {
    const host = mount(
      '<main><div class="monaco-editor" data-editing="true"><textarea class="inputarea"></textarea></div></main>',
    );
    expect(areaOf(host.querySelector('textarea'))).toBe('text');
  });

  it('counts focus inside the diff as the files area: the list is right beside it and that is what you move through', () => {
    const host = mount(
      '<main data-area="files"><div class="monaco-editor"><textarea></textarea></div></main>',
    );
    expect(areaOf(host.querySelector('textarea'))).toBe('files');
  });
});

describe('the graph', () => {
  it('reports the graph area when the graph canvas holds the focus', () => {
    const host = mount('<div data-area="graph" tabindex="0"></div>');
    expect(areaOf(host)).toBe('graph');
  });

  it('reports no area when the focus sits on body, leaving the fallback to decide', () => {
    mount('<div data-area="graph" tabindex="0"></div>');
    expect(areaOf(document.body)).toBe(null);
  });
});

describe('the diff under focus', () => {
  it('delivers the command even when the editor swallows keydown on its own node: we listen in the capture phase', async () => {
    const { renderHook } = await import('@testing-library/react');
    const { bindCommands, useKeyboard } = await import('./registry');
    const host = mount(
      '<main data-area="files"><div class="monaco-editor"><textarea class="inputarea"></textarea></div></main>',
    );
    const area = host.querySelector('textarea') as HTMLTextAreaElement;
    area.addEventListener('keydown', (e) => e.stopPropagation());
    area.focus();

    let staged = 0;
    const unbind = bindCommands('files', { stageCurrent: () => (staged += 1) });
    renderHook(() => useKeyboard('files'));

    area.dispatchEvent(new KeyboardEvent('keydown', { key: 's', bubbles: true, cancelable: true }));

    expect(staged, 'stopPropagation on the Monaco textarea does not cut off our command').toBe(1);
    unbind();
  });
});

describe('keys inside an overlay', () => {
  it('a dialog keeps its keys: Escape closes it, and app shortcuts do not fire behind it', async () => {
    const { renderHook } = await import('@testing-library/react');
    const { bindCommands, useKeyboard, insideOverlay } = await import('./registry');
    const host = mount(
      '<div role="dialog" data-state="open"><input id="field" /></div><main data-area="graph"></main>',
    );
    const field = host.querySelector('input') as HTMLInputElement;
    field.focus();
    expect(insideOverlay(field)).toBe(true);

    let closed = 0;
    const unbind = bindCommands('app', { closeView: () => (closed += 1) });
    renderHook(() => useKeyboard('graph'));

    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    field.dispatchEvent(escape);

    expect(closed, 'Escape belongs to the dialog while it is open').toBe(0);
    expect(escape.defaultPrevented, 'and reaches it untouched').toBe(false);
    unbind();
  });
});
