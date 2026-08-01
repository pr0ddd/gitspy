export type LayoutView = {
  path: string;
  count: number;
  max_lane: number;
  head: number | null;
  truncated: boolean;
  read_ms: number;
  layout_ms: number;
  lanes: number[];
  colours: number[];
  /** 0 Normal, 1 Merge, 2 Root, 3 Open */
  kinds: number[];
  /** Сегменты строки i лежат в [seg_offsets[i], seg_offsets[i+1]) */
  seg_offsets: number[];
  /** 0 through, 1 branch, 2 merge */
  seg_kind: number[];
  seg_from: number[];
  seg_to: number[];
  seg_colour: number[];
  /** Родители коммита i лежат в [parent_offsets[i], parent_offsets[i+1]) */
  parent_offsets: number[];
  parent_idx: number[];
  /** Индекс автора коммита в `authors` */
  author_of: number[];
  authors: string[];
  refs: RefView[];
};

export type RefView = {
  name: string;
  /** 0 local, 1 remote, 2 tag */
  kind: number;
  commit: number;
  is_head: boolean;
};

export type CommitView = {
  index: number;
  hash: string;
  author: string;
  email: string;
  time: number;
  subject: string;
  body: string;
};

/** Двенадцать цветов, разложенных по кругу оттенков. Индекс приходит из ядра. */
export const PALETTE = [
  '#1e90ff',
  '#7a2cff',
  '#ff2aa1',
  '#ff2b2b',
  '#ffc22b',
  '#2ecc1a',
  '#12dada',
  '#0a60ff',
  '#ff6ac6',
  '#ff5757',
  '#ffb61a',
  '#8c49ff',
] as const;

export const colourOf = (index: number): string => PALETTE[index % PALETTE.length];
