// Derived from the canonical substitution table (VISION §7 — src/data/substitutions.json).
// Previously generated standalone by scripts/gen_rclt_swaps.py; that extractor is now
// folded into scripts/gen_substitutions.py, and this just projects the canonical cells.
// Key `cp:aaltIndex` (0 = base cmap glyph). t = GEOM thresholds; z = zone per band
// (length t+1): A=A11y · B=Base · G=Geo · '-' = default (no colour).
import { SUBS } from '../data/substitutions'

export type CellSwap = { t: number[]; z: string }

export const GRID_SWAPS: Record<string, CellSwap> = Object.fromEntries(
  SUBS.geomCells.map(c => [`${c.cp}:${c.aalt}`, { t: c.thresholds, z: c.zones }]),
)
