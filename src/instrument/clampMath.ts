// Clamp math for the rail pads — pure functions, no React, no store import (so `node --test`
// can load it without pulling in JSX). The store calls these after every limits/axes action
// so the invariants hold in ONE place:
//   1. min <= lo <= hi <= max           (a clamp may collapse to a point)
//   2. lo <= default <= hi              (an edge drag pushes the default; a slide carries it)
//   3. a slide keeps hi - lo constant   (clamped to [min, max - span])

export type Range = { min: number; max: number }
export type Limits = Record<string, [number, number]>

const clip = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Fix one axis: order and clip its limits to the range, then pull the default inside. */
export function normalizeAxis(value: number, [lo, hi]: [number, number], r: Range): { value: number; limits: [number, number] } {
  let a = clip(Math.round(lo), r.min, r.max), b = clip(Math.round(hi), r.min, r.max)
  if (a > b) [a, b] = [b, a]
  return { value: clip(Math.round(value), a, b), limits: [a, b] }
}

/** Move one edge. The other edge is a wall: dragging past it collapses the clamp to a point. */
export function setLimit(limits: [number, number], side: 'lo' | 'hi', v: number): [number, number] {
  const [lo, hi] = limits
  return side === 'lo' ? [Math.min(v, hi), hi] : [lo, Math.max(v, lo)]
}

/** Slide the whole clamp so its low edge lands on `lo`, keeping the span. */
export function slideLimits(limits: [number, number], lo: number, r: Range): [number, number] {
  const span = limits[1] - limits[0]
  const a = clip(Math.round(lo), r.min, r.max - span)
  return [a, a + span]
}
