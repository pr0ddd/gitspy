import raw from '../../../CHANGELOG.md?raw';
import { parseReleases, type Release } from '../../../scripts/changelog.mjs';

export type Released = Release & { date: string };

const isReleased = (release: Release): release is Released => release.date !== null;

export const RELEASES: readonly Released[] = parseReleases(raw).filter(isReleased);
