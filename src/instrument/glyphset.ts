// Glyph-set matching. The shared base groups + cmap parser now live in wm-primitives
// (shared/src/glyphset.ts); this module adds ReCal's aalt-alternates inventory on top.
import { ALT_COUNTS } from './alternates'
import { makeGlyphSets, parseCmapRanges, isSupported, type CmapRanges } from '../../shared/index'

export const GLYPH_SETS = makeGlyphSets()
export const GLYPH_SET_KEYS = Object.keys(GLYPH_SETS)
export { parseCmapRanges, isSupported }
export type { CmapRanges }

// A glyph cell: a base char, which aalt alternate (0 = base), and whether to force
// the `case` feature (capital-positioned combining marks).
export type GlyphCell = { ch: string; aalt: number; caps?: boolean }

const DOTTED_CIRCLE = '◌' // ◌ — base to hang combining/modifier marks on

// Combining marks that have capital-positioned `.case` variants in CalSansVF.
const CASE_COMB_CPS = new Set([
  0x0300, 0x0301, 0x0302, 0x0303, 0x0304, 0x0306, 0x0307, 0x0308,
  0x0309, 0x030B, 0x030C, 0x0311, 0x031B, 0x0338,
])

// TRUE combining marks (category Mn) render as floating marks in isolation; hang
// them on a dotted circle so they read cleanly. Spacing modifier letters
// (U+02B0–02FF) are NOT combining — they have their own width and can't attach, so
// they render standalone (no ◌).
function needsDottedCircle(cp: number): boolean {
  return (cp >= 0x0300 && cp <= 0x036F)   // combining diacritical marks
    || (cp >= 0x0483 && cp <= 0x0489)     // combining Cyrillic
    || (cp >= 0x1AB0 && cp <= 0x1AFF)     // combining diacriticals extended
    || (cp >= 0x1DC0 && cp <= 0x1DFF)     // combining diacriticals supplement
    || (cp >= 0x20D0 && cp <= 0x20FF)     // combining marks for symbols
}

// The full inventory: every cmap codepoint AND its alternate glyphs (via the font's
// aalt feature). Alternates render with font-feature-settings 'aalt' i, so they still
// interpolate across the axes — reaching the ~850 unencoded stylistic variants.
export function allGlyphsWithAlternates(ranges: CmapRanges | null): GlyphCell[] {
  if (!ranges) return []
  const out: GlyphCell[] = []
  for (const [s, e] of ranges) {
    for (let cp = s; cp <= e; cp++) {
      if (cp < 0x21) continue                     // control chars + space
      if (cp >= 0x7F && cp <= 0xA0) continue       // C1 controls + NBSP
      const raw = String.fromCodePoint(cp)
      const ch = needsDottedCircle(cp) ? DOTTED_CIRCLE + raw : raw
      out.push({ ch, aalt: 0 })
      if (CASE_COMB_CPS.has(cp)) out.push({ ch, aalt: 0, caps: true })  // capital-positioned
      const n = ALT_COUNTS[cp] ?? 0
      for (let i = 1; i <= n; i++) out.push({ ch, aalt: i })
    }
  }
  return out
}
