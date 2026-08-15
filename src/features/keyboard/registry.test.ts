import { afterEach, describe, expect, it } from 'vitest';
import { areaOf } from './registry';

const mount = (html: string): HTMLElement => {
  document.body.innerHTML = html;
  return document.body.firstElementChild as HTMLElement;
};

afterEach(() => {
  document.body.innerHTML = '';
});

describe('в какой области стоит фокус', () => {
  it('поле ввода — текст: буквы там печатаются', () => {
    const host = mount('<div data-area="files"><input /></div>');
    expect(areaOf(host.querySelector('input'))).toBe('text');
  });

  it('дифф только для чтения — не текст: никто в него не печатает, стрелки и s/u должны работать', () => {
    const host = mount(
      '<main><div class="monaco-editor"><textarea class="inputarea"></textarea></div></main>',
    );
    expect(areaOf(host.querySelector('textarea'))).not.toBe('text');
  });

  it('редактируемый файл в Monaco — текст: там уже печатают', () => {
    const host = mount(
      '<main><div class="monaco-editor" data-editing="true"><textarea class="inputarea"></textarea></div></main>',
    );
    expect(areaOf(host.querySelector('textarea'))).toBe('text');
  });

  it('фокус внутри диффа считается областью файлов: список рядом, по нему и ходят', () => {
    const host = mount(
      '<main data-area="files"><div class="monaco-editor"><textarea></textarea></div></main>',
    );
    expect(areaOf(host.querySelector('textarea'))).toBe('files');
  });
});

describe('граф', () => {
  it('фокус на холсте графа — область graph', () => {
    const host = mount('<div data-area="graph" tabindex="0"></div>');
    expect(areaOf(host)).toBe('graph');
  });

  it('фокус на body — область не определена, решает запасная', () => {
    mount('<div data-area="graph" tabindex="0"></div>');
    expect(areaOf(document.body)).toBe(null);
  });
});

describe('дифф под фокусом', () => {
  it('команда доходит, даже если редактор глотает keydown на своём узле: мы слушаем в фазе захвата', async () => {
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

    expect(staged, 'stopPropagation на textarea Monaco не отрезает нашу команду').toBe(1);
    unbind();
  });
});
