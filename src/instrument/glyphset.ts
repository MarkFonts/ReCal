// Glyph-set matching, ported from font-proofer. Categorised character sets plus a
// cmap parser so the Glyphs scene shows only the glyphs the font actually supports.
import { ALT_COUNTS } from './alternates'

export const GLYPH_SETS: Record<string, string[]> = (() => {
  const groups: Record<string, string[]> = {
    Uppercase: [
      ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
      ...'ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝÞ',
      'ẞ',
      ...'ĀĂĄĆĈĊČĎĐĒĔĖĘĚĜĞĠĢĤĦĨĪĬĮİĲĴĶĹĻĽĿŁŃŅŇŊŌŎŐŒŔŖŘŚŜŞŠŢŤŦŨŪŬŮŰŲŴŶŸŹŻŽ',
    ],
    Lowercase: [
      ...'abcdefghijklmnopqrstuvwxyz',
      'ß',
      ...'àáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿ',
      ...'āăąćĉċčďđēĕėęěĝğġģĥħĩīĭįıĳĵķĸĺļľŀłńņňŉŋōŏőœŕŗřśŝşšţťŧũūŭůűųŵŷźżž',
    ],
    Numerals: [
      ...'0123456789',
      ...'⁰¹²³⁴⁵⁶⁷⁸⁹',
      ...'₀₁₂₃₄₅₆₇₈₉',
      ...'¼½¾⅓⅔⅛⅜⅝⅞',
      ...'ªº',
    ],
    Symbols: [
      ...'.,:;!¡?¿',
      '"', "'",
      ...'-‒–—…',
      ...'()[]{}',
      ...'/\\|',
      ...'@#%&*+=<>~`^_',
      ...'‘’“”‚„«»‹›',
      ...'©®™°•·¶§¦',
      ...'±×÷≠≈≤≥∞',
      ...'$€£¥¢₩₪₫₿₺₽₹₴₵₱₸₼₾',
    ],
  }
  return { All: Object.values(groups).flat(), ...groups }
})()

export const GLYPH_SET_KEYS = Object.keys(GLYPH_SETS)

export type CmapRanges = [number, number][]

// Returns merged, sorted [start, end] codepoint ranges the font's cmap supports, or
// null if none found. Handles cmap formats 0, 4, 6, 12 (TTF/OTF).
export function parseCmapRanges(ab: ArrayBuffer): CmapRanges | null {
  try {
    const data = new DataView(ab)
    const numTables = data.getUint16(4)
    let cmapOffset = 0
    for (let i = 0; i < numTables; i++) {
      const t = String.fromCharCode(
        data.getUint8(12 + i * 16), data.getUint8(13 + i * 16),
        data.getUint8(14 + i * 16), data.getUint8(15 + i * 16),
      )
      if (t === 'cmap') { cmapOffset = data.getUint32(12 + i * 16 + 8); break }
    }
    if (!cmapOffset) return null
    const numSub = data.getUint16(cmapOffset + 2)
    const subOffsets: number[] = []
    for (let i = 0; i < numSub; i++) subOffsets.push(cmapOffset + data.getUint32(cmapOffset + 4 + i * 8 + 4))
    const cps = new Set<number>()
    for (const off of subOffsets) {
      const format = data.getUint16(off)
      if (format === 0) {
        for (let c = 0; c < 256; c++) if (data.getUint8(off + 6 + c) !== 0) cps.add(c)
      } else if (format === 4) {
        const segX2 = data.getUint16(off + 6)
        const endBase = off + 14, startBase = endBase + segX2 + 2
        const deltaBase = startBase + segX2, rangeBase = deltaBase + segX2
        for (let s = 0; s < segX2 / 2; s++) {
          const end = data.getUint16(endBase + s * 2), start = data.getUint16(startBase + s * 2)
          const delta = data.getInt16(deltaBase + s * 2), ro = data.getUint16(rangeBase + s * 2)
          if (start === 0xFFFF) continue
          for (let c = start; c <= end && c !== 0xFFFF; c++) {
            let g
            if (ro === 0) g = (c + delta) & 0xFFFF
            else { g = data.getUint16(rangeBase + s * 2 + ro + (c - start) * 2); if (g !== 0) g = (g + delta) & 0xFFFF }
            if (g !== 0) cps.add(c)
          }
        }
      } else if (format === 6) {
        const first = data.getUint16(off + 6), count = data.getUint16(off + 8)
        for (let i = 0; i < count; i++) if (data.getUint16(off + 10 + i * 2) !== 0) cps.add(first + i)
      } else if (format === 12) {
        const nGroups = data.getUint32(off + 12)
        for (let gi = 0; gi < nGroups; gi++) {
          const g = off + 16 + gi * 12
          const startC = data.getUint32(g), endC = data.getUint32(g + 4), startGID = data.getUint32(g + 8)
          for (let c = startC; c <= endC; c++) if (startGID + (c - startC) !== 0) cps.add(c)
        }
      }
    }
    if (cps.size === 0) return null
    const sorted = Array.from(cps).sort((a, b) => a - b)
    const ranges: CmapRanges = []
    let s = sorted[0], p = sorted[0]
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] === p + 1) { p = sorted[i]; continue }
      ranges.push([s, p]); s = p = sorted[i]
    }
    ranges.push([s, p])
    return ranges
  } catch { return null }
}

// null ranges = font not yet parsed → show everything.
export function isSupported(glyph: string, ranges: CmapRanges | null): boolean {
  if (!ranges) return true
  const cp = glyph.codePointAt(0)
  if (cp === undefined) return false
  for (const [s, e] of ranges) if (cp >= s && cp <= e) return true
  return false
}

// A glyph cell: a base char plus which aalt alternate to show (0 = the base itself).
export type GlyphCell = { ch: string; aalt: number }

const DOTTED_CIRCLE = '◌' // ◌ — base to hang combining/modifier marks on

// Combining diacriticals + spacing modifier letters render as floating/overlapping
// marks in isolation; hang them on a dotted circle so they read cleanly.
function needsDottedCircle(cp: number): boolean {
  return (cp >= 0x02B0 && cp <= 0x02FF)   // spacing modifier letters
    || (cp >= 0x0300 && cp <= 0x036F)     // combining diacritical marks
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
      const n = ALT_COUNTS[cp] ?? 0
      for (let i = 1; i <= n; i++) out.push({ ch, aalt: i })
    }
  }
  return out
}
