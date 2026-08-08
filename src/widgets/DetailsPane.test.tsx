import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DetailsPane } from './DetailsPane';
import '@/i18n';

describe('панель подробностей', () => {
  it('в обычной раскладке держит свою ширину и не тянется', () => {
    const { container } = render(<DetailsPane note={null}>детали</DetailsPane>);
    const pane = container.querySelector('aside');
    expect(pane?.style.width, 'ширина панели — настройка человека').not.toBe('');
    expect(pane?.className.includes('shrink-0')).toBe(true);
  });

  it('заполняет колонку, когда она отдана ему целиком', () => {
    const { container } = render(
      <DetailsPane note={null} fill>
        детали
      </DetailsPane>,
    );
    const pane = container.querySelector('aside');
    expect(
      pane?.className.includes('flex-1'),
      'в полноэкранном режиме панель занимает колонку, иначе рядом зияет пустота',
    ).toBe(true);
    expect(pane?.style.width, 'фиксированная ширина тут только мешает').toBe('');
  });
});
