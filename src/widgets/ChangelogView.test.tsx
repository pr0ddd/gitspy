import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RELEASES } from '@/entities/changelog';
import { ChangelogView } from './ChangelogView';
import '../i18n';

describe('вкладка заметок', () => {
  it('перечисляет выпущенные версии', () => {
    render(<ChangelogView />);
    expect(
      RELEASES.length,
      'файл проекта не пуст, иначе вкладке нечего показывать',
    ).toBeGreaterThan(0);
    for (const release of RELEASES) {
      expect(screen.getByText(`Version ${release.version}`)).toBeTruthy();
    }
  });

  it('помечает установленную версию и рисует её markdown', () => {
    render(<ChangelogView />);
    expect(
      screen.getByText('installed'),
      'без пометки непонятно, что из списка уже стоит',
    ).toBeTruthy();
    const current = RELEASES.find((release) => release.version === __APP_VERSION__);
    const bullet = current?.body.split('\n').find((line) => line.startsWith('- ')) ?? '';
    expect(
      screen.getByText(bullet.replace(/^- /, ''), { exact: false }),
      'строки секции доходят до экрана через Prose',
    ).toBeTruthy();

    const heading = current?.body.split('\n').find((line) => line.startsWith('### ')) ?? '';
    expect(
      screen.getByText(heading.replace(/^### /, '')),
      'рубрики внутри версии остаются заголовками, а не решёткой в тексте',
    ).toBeTruthy();
  });
});
