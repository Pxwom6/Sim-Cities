/** Zoning constants. DESIGN.md §2.2 (zone blocks) and §3.4 (lots). */
export const ZONE_NONE = 0;
export const ZONE_R = 1;
export const ZONE_C = 2;
export const ZONE_I = 3;
export type ZoneCode = 0 | 1 | 2 | 3;
export type ZoneLetter = 'R' | 'C' | 'I';

export const ZONE_LETTERS: Record<ZoneLetter, ZoneCode> = { R: ZONE_R, C: ZONE_C, I: ZONE_I };
export const ZONE_NAMES: Record<ZoneCode, string> = {
  0: 'Unzoned',
  1: 'Residential',
  2: 'Commercial',
  3: 'Industrial',
};

/** Zone cell size in metres. */
export const CELL = 8;
/** Rows of cells behind each road edge (depth = ROWS × CELL). */
export const ROWS = 4;
/** Cells steeper than this (rise over run) are unbuildable. */
export const MAX_CELL_SLOPE = 0.22;
/** Cells whose squares overlap by more than this margin (m) conflict. */
export const CELL_OVERLAP_SHRINK = 0.3;
