// The Type Matrix graveyard: taking a variant out of its glyph's rclt condition, and putting
// it back. Pure (no React, no DOM), so the store, the Matrix and the three demo UIs
// (?grave=a|b|c) share one answer.
//
// A lane is a run of bands on GEOM 0-100: bounds B = [0, ...thresholds, 100], band k is
// [B[k], B[k+1]). The worker (_rebuild_fv) builds one FeatureVariations segment per gap
// between distinct thresholds and asks each glyph which variant it shows at the segment's
// MIDPOINT, so a band of zero width never fires anywhere. That is what "removed" means here:
//
//   - the band's width goes to 0, and the nearest LIVE band ABOVE absorbs its range (the
//     same direction classic applyDelete took: first variant t[0]=0, last t[i-1]=100);
//   - with nothing live above (the band is the lane's last live one), the nearest live band
//     BELOW absorbs it instead.
//
// applyDelete collapsed a MIDDLE band to one unit (t[i] = t[i-1] + 1). The worker still
// fires that band on GEOM t..t+1, so a "removed" Base j came back at 39.5. Here a middle
// band collapses to zero (t[i] = t[i-1]), which the worker, lanes.variantIndex and the
// Matrix's own active-band test all read as "never".
//
// Restore: the entry keeps the lane's thresholds from before AND after the removal.
//   - Lane untouched since (it still equals `after`): `before` comes back exactly.
//   - Lane edited since: the variant gets its old GEOM range [a, b] back, clipped so every
//     band that is live NOW keeps at least 1 unit. The live band below it ends at a, the
//     live band above starts at b; any buried band in between stays buried (zero width)
//     at that edge. If the clip leaves nothing (the neighbours were dragged right across
//     where it used to be), it comes back at the point where it was buried, with its old
//     width, as far as the neighbours allow.

import { GROUP_DEFS, type VariantLabel } from '../GlyphGroups'

export interface GraveEntry {
  id: string            // `${glyph}:${vi}` — a band can only be buried once at a time
  glyph: string         // the lane (GROUP_DEFS headline)
  vi: number            // band index in that lane
  label: VariantLabel   // A11Y | UI | default | Base | Geo
  before: number[]      // the lane's thresholds just before it was removed
  after: number[]       // ...and just after (the exact-restore test)
  at: number            // order of removal (Date.now), newest last
}

export const graveId = (glyph: string, vi: number) => `${glyph}:${vi}`

export const laneDef = (glyph: string) => GROUP_DEFS.find(d => d.glyph === glyph)

export const laneThresholds = (thr: Record<string, number[]>, glyph: string): number[] =>
  [...(thr[glyph] ?? laneDef(glyph)?.defaultThresholds ?? [])]

const boundsOf = (t: number[]) => [0, ...t, 100]
const width = (B: number[], k: number) => B[k + 1] - B[k]

/** GEOM range [a, b] of band vi in a lane. */
export const bandRange = (t: number[], vi: number): [number, number] => {
  const B = boundsOf(t)
  return [B[vi], B[vi + 1]]
}

/** Is band vi collapsed (zero width)? */
export const isCollapsed = (t: number[], vi: number) => width(boundsOf(t), vi) <= 0

/** Bands with any width at all. */
export const liveBands = (t: number[]): number[] => {
  const B = boundsOf(t)
  return B.slice(0, -1).map((_, k) => k).filter(k => width(B, k) > 0)
}

/** A band can go only if it is live and something else in the lane stays live. */
export const canRemove = (t: number[], vi: number) => {
  const live = liveBands(t)
  return live.includes(vi) && live.length > 1
}

/** Thresholds with band vi removed (zero width; see the header for who absorbs it). */
export function removeBand(t: number[], vi: number): number[] {
  const B = boundsOf(t)
  const n = B.length - 1
  if (!canRemove(t, vi)) return [...t]
  let q = -1
  for (let k = vi + 1; k < n; k++) if (width(B, k) > 0) { q = k; break }
  if (q >= 0) {
    for (let k = vi + 1; k <= q; k++) B[k] = B[vi]          // the band above grows down
  } else {
    let p = -1
    for (let k = vi - 1; k >= 0; k--) if (width(B, k) > 0) { p = k; break }
    for (let k = p + 1; k <= vi; k++) B[k] = B[vi + 1]      // the band below grows up
  }
  return B.slice(1, -1)
}

/** Thresholds with the entry's band put back (exactly, or re-inserted; see the header). */
export function restoreBand(cur: number[], e: GraveEntry): number[] {
  if (cur.length === e.after.length && cur.every((v, i) => v === e.after[i])) return [...e.before]
  const B = boundsOf(cur)
  const n = B.length - 1
  const vi = e.vi
  const [a0, b0] = bandRange(e.before, vi)
  let p = -1, q = -1
  for (let k = vi - 1; k >= 0; k--) if (width(B, k) > 0) { p = k; break }
  for (let k = vi + 1; k < n; k++) if (width(B, k) > 0) { q = k; break }
  // Every live neighbour keeps at least one unit; with no live band on a side the
  // restored band runs to that end of the axis (the buried ones there stay buried).
  const lo = p >= 0 ? B[p] + 1 : 0
  const hi = q >= 0 ? B[q + 1] - 1 : 100
  let a = p >= 0 ? Math.max(a0, lo) : 0
  let b = q >= 0 ? Math.min(b0, hi) : 100
  if (b <= a) {
    const x = B[vi], w = Math.max(1, b0 - a0)
    a = Math.max(lo, Math.min(x, hi - 1))
    b = Math.min(hi, a + w)
    if (b <= a) { a = lo; b = Math.max(lo + 1, hi) }
  }
  for (let k = p + 1; k <= vi; k++) B[k] = a               // live band below ends at a
  for (let k = vi + 1; k <= (q >= 0 ? q : n - 1); k++) B[k] = b   // live band above starts at b
  if (q < 0) for (let k = vi + 1; k < n; k++) B[k] = 100
  return B.slice(1, -1)
}

/** Drop entries whose band is no longer collapsed (an undo, a reset, a preset put it back). */
export const pruneGraveyard = (g: GraveEntry[], thr: Record<string, number[]>): GraveEntry[] => {
  const next = g.filter(e => isCollapsed(laneThresholds(thr, e.glyph), e.vi))
  return next.length === g.length ? g : next
}

/** Buried band indices of one lane (in the graveyard and still collapsed). */
export const buriedIn = (g: GraveEntry[], glyph: string): Set<number> =>
  new Set(g.filter(e => e.glyph === glyph).map(e => e.vi))

/** Handles a lane draws. A buried band sits at zero width between two others, so the
 *  boundaries on either side of it coincide: they are drawn as ONE handle that moves them
 *  together (dragging it can never reopen the buried band), and a boundary that only
 *  separates buried bands from the axis end is not drawn at all. Without a graveyard this
 *  is exactly one handle per threshold, as before. */
export function laneHandles(t: number[], buried: Set<number>): { idxs: number[]; value: number }[] {
  const bands = t.length + 1
  const shown = Array.from({ length: bands }, (_, k) => k).filter(k => !buried.has(k))
  const out: { idxs: number[]; value: number }[] = []
  for (let s = 0; s < shown.length - 1; s++) {
    const p = shown[s], q = shown[s + 1]
    const idxs: number[] = []
    for (let k = p; k < q; k++) idxs.push(k)   // handle k is the boundary between band k and k+1
    out.push({ idxs, value: t[q - 1] })
  }
  return out
}

/** "a · A11Y", with the range when a lane has the same label twice (f: default…default). */
export const entryName = (e: Pick<GraveEntry, 'glyph' | 'vi' | 'label'>) => `${e.glyph} · ${e.label}`
export const needsRange = (glyph: string, label: string) =>
  (laneDef(glyph)?.variants.filter(v => v.label === label).length ?? 0) > 1
