// Which Type Matrix lane a character belongs to, and which variant a lane shows at a GEOM.
// Pure (no React, no DOM) so the specimen flash (scenes.tsx) and the freeze-conflict
// message (freezeConflicts.ts) read the same answer.
import { SUBS } from '../data/substitutions'

// Which variant a glyph shows at a given GEOM = how many of its swap thresholds
// GEOM has passed (matches the non-HOI font's rclt band edges in GROUP_DEFS).
export const variantIndex = (geom: number, thresholds: number[]): number =>
  thresholds.reduce((n, t) => n + (geom >= t ? 1 : 0), 0)

const SWAP_GLYPHS = new Set(SUBS.geomGroups.map(g => g.headline))

// Resolve a character to its swap GROUP key (the GROUP_DEFS representative), so
// diacritic composites flash with their base group: à→a, ç→c, Ç→C, ª→a. Composites
// share their base's `rclt` condition, so they inherit its thresholds/zone/color.
// NFKD handles diacritics + compatibility forms (ª→a); EXTRA_MEMBERS covers
// non-decomposing look-alikes. Returns undefined for non-swap glyphs.
const EXTRA_MEMBERS: Record<string, string> = { 'ɑ': 'a' }
export const groupKeyOf = (ch: string): string | undefined => {
  if (SWAP_GLYPHS.has(ch)) return ch
  const base = ch.normalize('NFKD')[0]
  if (base && SWAP_GLYPHS.has(base)) return base
  return EXTRA_MEMBERS[ch]
}
