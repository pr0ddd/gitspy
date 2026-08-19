import type { AvatarCache } from '@/shared/ui/avatarCache';
import type { RefView, RepoView } from '@/shared/api/types';
import type { theme } from '@/shared/ui/theme';
import { graphGeometry, type Metrics } from '../scene';
import type { Cols } from '../columns';
import type { RowCache } from '../rows';
import type { Minimap } from '../view';
import type { HoverChip } from './chips';
import type { VeilLevels } from '../veil';

export type DescriptionMode = 'always' | 'hover' | 'never';

export type Columns = {
  readonly branchTag: string;
  readonly graph: string;
  readonly message: string;
  readonly author: string;
  readonly date: string;
  readonly sha: string;
  readonly workingTree: string;
  readonly inProgress: string;
  readonly mergeConflicts: string;
};

export type Frame = {
  readonly repo: RepoView | null;
  readonly rows: RowCache;
  readonly columns: Columns;
  readonly cols: Cols;
  readonly avatars: AvatarCache | null;
  readonly pullHeads: ReadonlySet<string>;
  readonly hoverChip: HoverChip | null;
  readonly veil: VeilLevels | null;
  readonly refsByCommit: ReadonlyMap<number, RefView[]>;
  readonly minimap: Minimap | null;
  readonly metrics: Metrics;
  readonly scrollY: number;
  readonly scrollX: number;
  readonly hover: number | null;
  readonly selected: number | null;
  readonly width: number;
  readonly height: number;
};

export type Pass = {
  readonly ctx: CanvasRenderingContext2D;
  readonly frame: Frame;
  readonly t: ReturnType<typeof theme>;
  readonly m: Metrics;
  readonly g: ReturnType<typeof graphGeometry>;
  readonly cols: Cols;
  readonly listW: number;
  readonly height: number;
  readonly msgX: number;
  readonly colHash: number;
  readonly colDate: number;
  readonly colAuthor: number;
  readonly first: number;
  readonly last: number;
  readonly shift: number;
  readonly half: number;
  readonly inset: number;
  readonly band: number;
  readonly descriptionMode: DescriptionMode;
};
