// Where a frozen ssXX/cvXX is hidden by the user's own GEOM swaps. Pure: data in, data out.
//
// The rule (Mark's): the GEOM swap (rclt) WINS over a frozen set on the same glyph. The
// bake and the preview both build their rclt lookups that way (fontWorker `_rebuild_fv`),
// so a frozen set only shows on a glyph while GEOM leaves it on the master. This says
// where that is NOT the case, with real numbers, so the card can explain a form the user
// froze but can't see.
import { SUBS } from '../data/substitutions'
import type { FeatureSet } from '../data/substitutions'
import { groupKeyOf } from './lanes'

export type Conflict = {
  lane: string                // Type Matrix lane (headline glyph): 'l'
  zone: string                // the variant GEOM shows instead of the frozen form: 'A11Y'
  from: number                // the swap band the default GEOM sits in: [from, to]
  to: number
  showAbove: number | null    // the nearest GEOM above the band where the lane is back on the master
  showBelow: number | null    // ...and the nearest below
}

const LANES = Object.fromEntries(SUBS.geomGroups.map(g => [g.headline, g]))
// cmap glyph name of each swapping character (aalt 0 = the plain cmap glyph)
const GLYPH_OF: Record<number, string> = Object.fromEntries(
  SUBS.geomCells.filter(c => c.aalt === 0).map(c => [c.cp, c.name]))

// Band index at a GEOM. A threshold is the font's INCLUSIVE upper edge of the band below
// it (the FeatureVariations ranges touch and the lower one matches first), so at exactly
// the threshold the glyph is still in the lower band.
const bandAt = (geom: number, thresholds: number[]): number =>
  thresholds.reduce((n, t) => n + (geom > t ? 1 : 0), 0)

export function freezeConflicts(feature: FeatureSet, thresholds: Record<string, number[]>, geom: number): Conflict[] {
  const out = new Map<string, Conflict>()
  for (const ch of feature.chars) {
    const lane = groupKeyOf(ch)
    if (!lane || out.has(lane) || !LANES[lane]) continue
    const g = LANES[lane]
    const thr = thresholds[lane] ?? g.thresholds
    const i = Math.min(bandAt(geom, thr), g.variants.length - 1)
    const v = g.variants[i]
    if (v.label === 'default' || !v.suffix) continue            // the master shows: the frozen form shows
    // does the set substitute THIS base glyph (not just its rclt-suffixed form), and to
    // something other than the form GEOM already gives (ss18's g IS the A11Y g)?
    const name = GLYPH_OF[ch.codePointAt(0)!]
    const ssForm = name ? feature.subs[name] : undefined
    if (!ssForm || ssForm === `${name}.${v.suffix}`) continue
    const bounds = [0, ...thr, 100]
    const defaults = g.variants.map((x, k) => (x.label === 'default' ? k : -1)).filter(k => k >= 0)
    const above = defaults.find(k => k > i)
    const below = [...defaults].reverse().find(k => k < i)
    out.set(lane, {
      lane, zone: v.label, from: bounds[i], to: bounds[i + 1],
      showAbove: above === undefined ? null : bounds[above],
      showBelow: below === undefined ? null : bounds[below + 1],
    })
  }
  return [...out.values()]
}

const list = (xs: string[]): string =>
  xs.length <= 1 ? xs.join('') : xs.length === 2 ? `${xs[0]} and ${xs[1]}` : `${xs.slice(0, -1).join(', ')}, and ${xs[xs.length - 1]}`

// How the lane's current swap reads: "up to 30" / "from 59" / "everywhere".
const extent = (c: Conflict): string =>
  c.to < 100 ? (c.from > 0 ? `from ${c.from} to ${c.to}` : `up to ${c.to}`) : c.from > 0 ? `from ${c.from}` : 'everywhere'
// What clears it: the nearest GEOM where every conflicted lane is back on the master.
const way = (cs: Conflict[]): string =>
  cs.every(c => c.showAbove !== null) ? `above ${Math.max(...cs.map(c => c.showAbove as number))}`
    : cs.every(c => c.showBelow !== null) ? `below ${Math.min(...cs.map(c => c.showBelow as number))}` : ''

/** The one short line under a card's name. */
export function conflictCardLine(conflicts: Conflict[]): string {
  const c = conflicts[0]
  return `Hidden: your GEOM swaps ${list(conflicts.map(x => x.lane))} ${extent(c)}.`
}

/** The panel's note: the full sentence for one hidden set, a summary for several. `sets`
 *  pairs each conflicted set's plain name with its conflicts. */
export function conflictPanelNote(sets: { name: string; conflicts: Conflict[] }[]): string {
  if (!sets.length) return ''
  const all = sets.flatMap(s => s.conflicts)
  const lanes = [...new Set(all.map(c => c.lane))]
  const swaps = lanes.length === 1 ? `the ${lanes[0]} swap` : `the ${list(lanes)} swaps`
  if (sets.length === 1) {
    const { name, conflicts } = sets[0]
    const where = way(conflicts)
    // one lane reads with its real extent; several lanes just name what they're swapped to
    const swapped = conflicts.length === 1
      ? `${conflicts[0].lane} to the ${conflicts[0].zone} form ${extent(conflicts[0])}`
      : `${list(conflicts.map(x => x.lane))} to their ${list([...new Set(conflicts.map(x => x.zone))])} forms`
    return `Your GEOM swaps ${swapped}, so ${name} is hidden here. ` +
      `${where ? `Set GEOM ${where}, or m` : 'M'}ove ${swaps} in Type Matrix, to see it.`
  }
  // several sets: one GEOM above every one of them clears all, if they all clear upward
  const up = all.every(c => c.showAbove !== null)
  const hi = up ? Math.max(...all.map(c => c.showAbove as number)) : null
  return `${sets.length} frozen sets are hidden by your GEOM swaps: ${sets.map(s => s.name).join(', ')}. ` +
    `${hi !== null ? `Raise GEOM above ${hi} or m` : 'M'}ove ${swaps} in Type Matrix.`
}
