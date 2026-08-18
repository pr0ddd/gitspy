import { describe, expect, it } from 'vitest';
import {
  BADGE_PAD,
  badgeWidth,
  CHIP_MARGIN_RIGHT,
  chipAt,
  chipInset,
  FIRST_CHIP_X,
  fullChip,
  MORE_PAD,
  placeChips,
  stackChips,
  stackRowAt,
  stackWidth,
  type ChipMetrics,
} from './chipLayout';
import { chipsFor } from './chips';
import { HEADER_ICON_BELOW } from './columns';
import type { RefKind, RefView } from '@/shared/api/types';

const ref = (name: string, kind: RefKind, patch: Partial<RefView> = {}): RefView => ({
  name,
  kind,
  commit: 0,
  oid: 'refoid',
  isHead: false,
  upstream: null,
  ahead: 0,
  behind: 0,
  gone: false,
  ...patch,
});

const measure = (text: string) => text.length * 7;

const METRICS: ChipMetrics = { pad: 9, markSize: 13, avatarSize: 17, pullSize: 11, gap: 4 };
const MARK = METRICS.avatarSize;
const GAP = METRICS.gap;
const PADS = METRICS.pad * 2;
const COUNTER = measure('+1') + MORE_PAD * 2;

const layout = (refs: RefView[], column = 400, pullHeads: ReadonlySet<string> = new Set()) =>
  placeChips(chipsFor(refs, ['origin']), measure, column, METRICS, pullHeads);

const place = (refs: RefView[], column = 400, pullHeads: ReadonlySet<string> = new Set()) =>
  layout(refs, column, pullHeads).placed;

const tracked = (name: string, patch: Partial<RefView> = {}) => [
  ref(name, 'localBranch', { upstream: `origin/${name}`, ...patch }),
  ref(`origin/${name}`, 'remoteBranch'),
];

describe('one chip per row', () => {
  it('places only the most prominent chip; the others stand behind +N even in a roomy column', () => {
    const { placed, more } = layout([
      ref('first', 'localBranch'),
      ref('second', 'localBranch'),
      ref('third', 'localBranch'),
    ]);

    expect(
      placed.map((p) => p.chip.name),
      'one chip, the first by prominence',
    ).toEqual(['first']);
    expect(more?.count, 'the two others are counted').toBe(2);
    expect(
      more?.chips.map((c) => c.name),
      'the counter remembers every hidden chip',
    ).toEqual(['second', 'third']);
  });

  it('the counter sits four pixels after the chip and is padding plus its label', () => {
    const { placed, more } = layout([ref('a', 'localBranch'), ref('b', 'localBranch')]);

    expect(more?.x).toBe(placed[0].x + placed[0].w + 4);
    expect(more?.w).toBe(COUNTER);
  });

  it('a lone chip has no counter', () => {
    expect(layout([ref('a', 'localBranch')]).more).toBeNull();
  });

  it('starts the chip at the left inset', () => {
    expect(place([ref('a', 'localBranch')])[0].x).toBe(FIRST_CHIP_X);
    expect(FIRST_CHIP_X).toBe(12);
  });

  it('nothing to place when there are no chips', () => {
    expect(placeChips([], measure, 400, METRICS, new Set())).toEqual({ placed: [], more: null });
  });
});

describe('a chip that fits', () => {
  it('is padding, text, a gap and its marks, no wider', () => {
    const [placed] = place([ref('wip', 'localBranch')]);

    expect(placed.text).toBe('wip');
    expect(placed.w).toBe(PADS + measure('wip') + GAP + MARK);
    expect(placed.fullW).toBe(placed.w);
    expect(placed.textX, 'the text starts after the padding').toBe(placed.x + METRICS.pad);
    expect(placed.marksX, 'the marks end at the right padding').toBe(
      placed.x + placed.w - METRICS.pad - MARK,
    );
  });

  it('gives the remote avatar the same slot as a glyph, so all marks look one size', () => {
    const [placed] = place([ref('origin/wip', 'remoteBranch')]);

    expect(
      placed.w,
      'the remote prefix is folded into the mark, so the text is the bare name',
    ).toBe(PADS + measure('wip') + GAP + MARK);
    expect(METRICS.avatarSize - METRICS.markSize, 'a circle needs four extra pixels').toBe(4);
  });

  it('two marks share one gap between them', () => {
    const [placed] = place(tracked('main'));

    expect(placed.marks).toEqual(['local', 'remote']);
    expect(placed.w).toBe(PADS + measure('main') + GAP + MARK + GAP + MARK);
  });

  it('an open pull request lengthens the trail by its own mark', () => {
    const [bare] = place([ref('wip', 'localBranch')]);
    const [withPull] = place([ref('wip', 'localBranch')], 400, new Set(['wip']));

    expect(withPull.hasPull).toBe(true);
    expect(withPull.w - bare.w).toBe(METRICS.pullSize + METRICS.gap);
  });

  it('puts the HEAD check mark into both the drawn text and the full text', () => {
    const [placed] = place([ref('main', 'localBranch', { isHead: true })]);

    expect(placed.text).toBe('✓ main');
    expect(placed.fullText).toBe('✓ main');
  });

  it('fullChip is the chip at its full width, for the unfolded stack', () => {
    const [chip] = chipsFor(tracked('develop', { isHead: true }), ['origin']);
    const full = fullChip(chip, measure, METRICS, new Set());
    const [placed] = place(tracked('develop', { isHead: true }));

    expect(full).toEqual(placed);
  });
});

describe('the name yields first', () => {
  it('a long name fills the column to the right margin and ends in an ellipsis; the marks stay', () => {
    const long = 'very-long-branch-name-that-cannot-fit';
    const [placed] = place([ref(long, 'localBranch')], 120);

    expect(placed.w, 'the chip takes all the room there is').toBe(
      120 - FIRST_CHIP_X - CHIP_MARGIN_RIGHT,
    );
    expect(placed.text.endsWith('…'), 'the drawn text is cut with an ellipsis').toBe(true);
    expect(measure(placed.text) + PADS + GAP + MARK <= placed.w, 'the text fits the chip').toBe(
      true,
    );
    expect(
      measure(`${placed.text.slice(0, -1)}x…`) + PADS + GAP + MARK > placed.w,
      'one letter more would not',
    ).toBe(true);
    expect(placed.marks, 'the marks stay').toEqual(['local']);
    expect(placed.marksX, 'and sit at the right padding, not glued to the ellipsis').toBe(
      placed.x + placed.w - METRICS.pad - MARK,
    );
    expect(placed.fullText, 'the full name is kept for the hover').toBe(long);
    expect(placed.fullW).toBeGreaterThan(placed.w);
  });

  it('the counter takes its room first: the chip is cut to what is left', () => {
    const { placed, more } = layout(
      [ref('a-very-long-branch-name-that-cannot-fit', 'localBranch'), ref('z', 'localBranch')],
      160,
    );

    expect(placed[0].chip.name).toBe('a-very-long-branch-name-that-cannot-fit');
    expect(placed[0].w, 'column minus inset and margin, minus the counter and its gap').toBe(
      160 - FIRST_CHIP_X - CHIP_MARGIN_RIGHT - 4 - COUNTER,
    );
    expect(placed[0].text.endsWith('…')).toBe(true);
    expect(more!.x + more!.w, 'the counter ends exactly at the right margin').toBe(
      160 - CHIP_MARGIN_RIGHT,
    );
  });

  it('on HEAD the check mark stays in front of the shortened name', () => {
    const [placed] = place(tracked('develop', { isHead: true }), 120);

    expect(placed.text.startsWith('✓ de'), 'check, letters, ellipsis').toBe(true);
    expect(placed.text.endsWith('…')).toBe(true);
    expect(placed.fullText).toBe('✓ develop');
  });

  it('shortens letter by letter while at least one letter and the ellipsis fit', () => {
    const at = (column: number) => place([ref('develop', 'localBranch')], column)[0];

    expect(at(400).text).toBe('develop');
    expect(at(100).text, '82 for the chip: 18 padding, 21 mark and gap, 43 for the name').toBe(
      'devel…',
    );
    expect(at(72).text, '54 for the chip: 15 for the name is two letters and the ellipsis').toBe(
      'd…',
    );
    expect(at(72).w).toBe(72 - FIRST_CHIP_X - CHIP_MARGIN_RIGHT);
  });
});

describe('then the chip becomes a badge', () => {
  it('when not even one letter fits, the name goes and the marks stand alone in a tight badge', () => {
    const [placed] = place([ref('develop', 'localBranch')], 66);

    expect(placed.text).toBe('');
    expect(placed.badge).toBe(true);
    expect(placed.w, 'four pixels either side of the mark').toBe(BADGE_PAD * 2 + MARK);
    expect(BADGE_PAD).toBe(4);
    expect(placed.x, 'still at the left inset while the column keeps its header text').toBe(
      FIRST_CHIP_X,
    );
    expect(placed.marksX).toBe(placed.x + BADGE_PAD);
  });

  it('a badge keeps every mark while they fit', () => {
    const [placed] = place(tracked('develop'), 70);

    expect(placed.text).toBe('');
    expect(placed.marks).toEqual(['local', 'remote']);
    expect(placed.w).toBe(BADGE_PAD * 2 + MARK + GAP + MARK);
  });

  it('HEAD keeps its check mark in the badge, before the marks, in a slot as wide as a mark', () => {
    const [placed] = place(tracked('develop', { isHead: true }), 100);

    expect(placed.text, 'the check without the space').toBe('✓');
    expect(placed.marks).toEqual(['local', 'remote']);
    expect(placed.w, 'three slots and four paddings').toBe(BADGE_PAD * 2 + MARK * 3 + GAP * 2);
    expect(placed.textX, 'the check is centred in its slot').toBe(
      placed.x + BADGE_PAD + (MARK - measure('✓')) / 2,
    );
    expect(placed.marksX).toBe(placed.x + placed.w - BADGE_PAD - MARK - GAP - MARK);
  });

  it('a badge of the check alone is as wide as a badge of one mark', () => {
    const [head] = place([ref('main', 'localBranch', { isHead: true })], 44);
    const [plain] = place([ref('main', 'localBranch')], 44);

    expect(head.text).toBe('✓');
    expect(head.marks).toEqual([]);
    expect(plain.marks).toEqual(['local']);
    expect(head.w, 'the same badge, a different glyph').toBe(plain.w);
    expect(head.x, 'and the same place').toBe(plain.x);
  });
});

describe('then the marks yield from the right, then the counter', () => {
  it('the pull request mark is the first to go', () => {
    const wide = place([ref('wip', 'localBranch')], 66, new Set(['wip']))[0];
    const tight = place([ref('wip', 'localBranch')], 56, new Set(['wip']))[0];

    expect(wide.badge).toBe(true);
    expect(wide.hasPull, 'the pull request mark still fits at 66').toBe(true);
    expect(tight.hasPull, 'at 56 it does not, and it goes before the laptop').toBe(false);
    expect(tight.marks).toEqual(['local']);
  });

  it('the remote avatar goes before the laptop; the counter stays as long as it can', () => {
    const { placed, more } = layout([...tracked('develop'), ref('z', 'localBranch')], 90);

    expect(placed[0].badge).toBe(true);
    expect(placed[0].marks, 'the second mark went').toEqual(['local']);
    expect(more?.count, 'the counter is still there').toBe(1);
    expect(more?.x).toBe(placed[0].x + placed[0].w + 4);
  });

  it('the counter goes last, and the first mark never', () => {
    const { placed, more } = layout([...tracked('develop'), ref('z', 'localBranch')], 60);

    expect(placed[0].marks).toEqual(['local']);
    expect(placed[0].w).toBe(BADGE_PAD * 2 + MARK);
    expect(more, 'no room beside the badge for the counter').toBeNull();
  });

  it('the check mark never goes; at the floor it may be all that is left', () => {
    const roomy = place(tracked('develop', { isHead: true }), 64)[0];
    const floor = place(tracked('develop', { isHead: true }), 44)[0];

    expect(roomy.text).toBe('✓');
    expect(roomy.marks, 'the check plus one mark fit in 46 usable pixels').toEqual(['local']);
    expect(floor.text).toBe('✓');
    expect(floor.marks, 'in 26 usable pixels only the check remains').toEqual([]);
    expect(floor.w).toBe(BADGE_PAD * 2 + MARK);
  });
});

describe('the inset holds until a badge would sit off centre, then everything slides', () => {
  it('is 12 in every column at least 49 wide: 12 either side of a 25px badge', () => {
    for (const column of [400, 100, 64, 56, 55, 49]) {
      expect(chipInset(column, METRICS), `at ${column}px`).toBe(FIRST_CHIP_X);
      expect(place([ref('develop', 'localBranch')], column)[0].x, `at ${column}px`).toBe(
        FIRST_CHIP_X,
      );
    }
    expect(badgeWidth(METRICS)).toBe(BADGE_PAD * 2 + MARK);
  });

  it('below 49 the badge stays centred in the column, so the inset shrinks pixel by pixel', () => {
    expect(chipInset(48, METRICS)).toBe(11.5);
    expect(chipInset(44, METRICS)).toBe((44 - badgeWidth(METRICS)) / 2);
    expect(place([ref('develop', 'localBranch')], 44)[0].x).toBe(9.5);
  });

  it('every row of a column shares the inset, whatever it shows', () => {
    const rows = [
      [ref('develop', 'localBranch')],
      tracked('develop', { isHead: true }),
      [ref('a', 'localBranch'), ref('b', 'localBranch')],
    ];
    for (const column of [44, 47, 49, 60, 80, 200]) {
      const lefts = new Set(rows.map((refs) => place(refs, column)[0].x));
      expect(lefts.size, `one inset at ${column}px`).toBe(1);
    }
  });

  it('what fits does not change at the header-icon width: the usable width is one rule', () => {
    const wide = layout([...tracked('develop'), ref('z', 'localBranch')], HEADER_ICON_BELOW);
    const narrow = layout([...tracked('develop'), ref('z', 'localBranch')], HEADER_ICON_BELOW - 1);

    expect(narrow.placed[0].marks).toEqual(wide.placed[0].marks);
    expect(narrow.placed[0].x).toBe(wide.placed[0].x);
    expect(narrow.more === null).toBe(wide.more === null);
  });
});

describe('nothing is ever cut', () => {
  const rows = [
    [ref('a', 'localBranch')],
    [ref('a-very-long-branch-name-that-cannot-fit', 'localBranch')],
    tracked('develop'),
    tracked('develop', { isHead: true }),
    [...tracked('develop', { isHead: true }), ref('z', 'localBranch'), ref('y', 'tag')],
    [ref('v1.0.0', 'tag'), ref('v1.0.1', 'tag')],
  ];

  it('at every column width from the floor up, the chip and the counter stay inside the margins', () => {
    for (let column = 44; column <= 320; column++) {
      for (const refs of rows) {
        const { placed, more } = layout(refs, column, new Set(['develop', 'a']));
        const left = placed[0].x;
        const right = more ? more.x + more.w : placed[0].x + placed[0].w;
        expect(left, `left edge at ${column}px`).toBeGreaterThanOrEqual(CHIP_MARGIN_RIGHT);
        expect(right, `right edge at ${column}px`).toBeLessThanOrEqual(column - CHIP_MARGIN_RIGHT);
        expect(placed[0].w, `the chip at ${column}px`).toBeGreaterThan(0);
        expect(
          placed[0].marks.length > 0 || placed[0].text === '✓',
          `a mark or the check at ${column}px`,
        ).toBe(true);
      }
    }
  });

  it('as the column narrows the row never grows back: every step yields', () => {
    for (const refs of rows) {
      let previous = Infinity;
      for (let column = 320; column >= 44; column--) {
        const { placed, more } = layout(refs, column, new Set(['develop', 'a']));
        const width = (more ? more.x + more.w : placed[0].x + placed[0].w) - placed[0].x;
        expect(
          width,
          `the row at ${column}px is no wider than at ${column + 1}px`,
        ).toBeLessThanOrEqual(previous);
        previous = width;
      }
    }
  });
});

describe('hit testing', () => {
  it('chipAt finds the chip under a coordinate and nothing beside it', () => {
    const placed = place([ref('a', 'localBranch')]);

    expect(chipAt(placed, placed[0].x + 1)?.chip.name).toBe('a');
    expect(chipAt(placed, 0), 'nothing to the left of the chip').toBeNull();
    expect(chipAt(placed, placed[0].x + placed[0].w + 5), 'nothing to the right').toBeNull();
  });
});

describe('the unfolded stack', () => {
  const chips = chipsFor(
    [
      ref('a-very-long-branch-name-that-cannot-fit', 'localBranch'),
      ref('z', 'localBranch'),
      ref('v1', 'tag'),
    ],
    ['origin'],
  );
  const stack = stackChips(chips, measure, METRICS, new Set(), FIRST_CHIP_X);

  it('lays every chip out at its full width under one another, all from the inset', () => {
    expect(stack.map((row) => row.chip.name)).toEqual([
      'a-very-long-branch-name-that-cannot-fit',
      'z',
      'v1',
    ]);
    expect(stack.every((row) => row.x === FIRST_CHIP_X && row.w === row.fullW)).toBe(true);
    expect(stackWidth(stack), 'the panel is as wide as the widest full chip').toBe(
      Math.max(...stack.map((row) => row.fullW)),
    );
  });

  it('a point on the panel resolves to the row under it, by full width, whatever the truncated chip was', () => {
    const rowH = 22;
    expect(stackRowAt(stack, rowH, FIRST_CHIP_X + 1, 0), 'top row').toBe(0);
    expect(
      stackRowAt(stack, rowH, stackWidth(stack) + FIRST_CHIP_X - 1, 5),
      'the far end of the widest name',
    ).toBe(0);
    expect(stackRowAt(stack, rowH, FIRST_CHIP_X + 1, rowH + 1), 'second row').toBe(1);
    expect(stackRowAt(stack, rowH, FIRST_CHIP_X + 1, rowH * 2 + 1), 'third row').toBe(2);
    expect(stackRowAt(stack, rowH, FIRST_CHIP_X + 1, rowH * 3 + 1), 'below the panel').toBeNull();
    expect(stackRowAt(stack, rowH, FIRST_CHIP_X - 1, 5), 'left of the panel').toBeNull();
    expect(stackRowAt(stack, rowH, FIRST_CHIP_X + stackWidth(stack), 5), 'right of it').toBeNull();
    expect(stackRowAt(stack, rowH, FIRST_CHIP_X + 1, -1), 'above it').toBeNull();
    expect(stackRowAt([], rowH, 20, 5), 'no stack, no row').toBeNull();
  });
});
