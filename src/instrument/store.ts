// Instrument-model store — the three-layer state everything hangs off.
// See docs/control-mapping.md §1. Pure logic only (no React) so it stays testable.
//
//   SHIPPED  — immutable stock Cal Sans axis defaults (as released)
//   defaults — the user's ◆ re-anchored origin; what the rebuild bakes
//   preview  — transient ● overrides from play; CSS only, never baked
//
// Selectors: merged() = defaults + preview, effective() = stockHold ? SHIPPED : merged().

import { GROUP_DEFS } from '../GlyphGroups'

export type AxisMap = Record<string, number>

// Stock CalSansVF fvar defaults. Phase 2 replaces this seed with live axisInfo from
// the worker — the shape is identical, so `init` just swaps the numbers in.
export const SHIPPED_AXES: Readonly<AxisMap> = Object.freeze({
  opsz: 14, GEOM: 25, wght: 400, YTAS: 720, SHRP: 0, ital: 0,
})

export const AXIS_RANGES: Readonly<Record<string, { min: number; max: number }>> = Object.freeze({
  opsz: { min: 8, max: 45 },
  GEOM: { min: 0, max: 100 },
  wght: { min: 400, max: 700 },
  YTAS: { min: 720, max: 800 },
  SHRP: { min: 0, max: 100 },
  ital: { min: 0, max: 1 },
})

export interface DefaultsLayer {
  axes: AxisMap                                 // ◆ per-axis defaults (baked via fvar/avar)
  glyphThresholds: Record<string, number[]>     // ◆ GEOM swap map (baked via FeatureVariations)
  opszMultiplier: number                        // ◆ opsz axis rescale
  freezeOpsz: boolean                           // ◆ bake a fixed opsz
  frozenOpszValue: number | null                // ◆ the frozen value (preset-set)
  autoAscender: boolean                         // ◆ graft avar2 so YTAS tracks opsz
}

export type PreviewLayer = AxisMap              // ● transient per-axis overrides (incl. ital)

export interface InstrumentState {
  shipped: AxisMap                              // SHIPPED (frozen at load)
  shippedThresholds: Record<string, number[]>   // SHIPPED GEOM swap map
  defaults: DefaultsLayer
  preview: PreviewLayer
  stockHold: boolean                            // hold-to-compare: effective() → SHIPPED
  activePreset: string | null                   // engaged "start from…" entry (§3.3)
  useHoi: boolean                               // Higher-Order Interpolation (swaps to Flex VF)
  buildName: string                             // editable export family name (INFO receipt)
}

const cloneThresholds = (t: Record<string, number[]>): Record<string, number[]> =>
  Object.fromEntries(Object.entries(t).map(([k, v]) => [k, [...v]]))

export function shippedThresholds(): Record<string, number[]> {
  return Object.fromEntries(GROUP_DEFS.map(g => [g.glyph, [...g.defaultThresholds]]))
}

export function createInitialState(shipped: AxisMap = SHIPPED_AXES): InstrumentState {
  const th = shippedThresholds()
  return {
    shipped: { ...shipped },
    shippedThresholds: th,
    defaults: {
      axes: { ...shipped },
      glyphThresholds: cloneThresholds(th),
      opszMultiplier: 1,
      freezeOpsz: false,
      frozenOpszValue: null,
      autoAscender: false,
    },
    preview: {},
    stockHold: false,
    activePreset: null,
    useHoi: false,
    buildName: 'ReCal Sans',
  }
}

// ── Selectors ─────────────────────────────────────────────────────────────────
export const mergedAxes = (s: InstrumentState): AxisMap => ({ ...s.defaults.axes, ...s.preview })
export const effectiveAxes = (s: InstrumentState): AxisMap =>
  s.stockHold ? { ...s.shipped } : mergedAxes(s)
export const effectiveThresholds = (s: InstrumentState): Record<string, number[]> =>
  s.stockHold ? s.shippedThresholds : s.defaults.glyphThresholds
export const previewDrifted = (s: InstrumentState): boolean => Object.keys(s.preview).length > 0

// Narrator state tag (§Origin mechanisms): STOCK while held, else ● if drifted, else ◆.
export type StateTag = 'YOUR' | 'PREVIEWING' | 'STOCK'
export const stateTag = (s: InstrumentState): StateTag =>
  s.stockHold ? 'STOCK' : previewDrifted(s) ? 'PREVIEWING' : 'YOUR'

// INFO receipt — the two things only this tool can show.
// Axes whose ◆ default differs from SHIPPED (lights in accent on the receipt).
export const changedAxisTags = (s: InstrumentState): string[] =>
  Object.keys(s.defaults.axes).filter(t => s.defaults.axes[t] !== s.shipped[t])
// Total active GEOM swap points across the threshold map.
export const swapPointCount = (s: InstrumentState): number =>
  Object.values(s.defaults.glyphThresholds).reduce((n, t) => n + t.length, 0)
// Glyph groups whose thresholds differ from SHIPPED (live once the matrix edits, Phase 6).
export const glyphsEditedCount = (s: InstrumentState): number =>
  Object.keys(s.defaults.glyphThresholds).filter(
    g => JSON.stringify(s.defaults.glyphThresholds[g]) !== JSON.stringify(s.shippedThresholds[g]),
  ).length

// ── Actions / reducer ───────────────────────────────────────────────────────────
export type Action =
  | { type: 'init'; shipped: AxisMap }                        // re-seed from live axisInfo
  | { type: 'setDefaultAxis'; tag: string; value: number }    // rail ◆ pin; clears matching ●
  | { type: 'setPreview'; tag: string; value: number }        // dock / Previewer ●
  | { type: 'clearPreview' }                                  // Return pill
  | { type: 'setStockHold'; held: boolean }                   // hold-to-compare
  | { type: 'setThresholds'; thresholds: Record<string, number[]> }
  | { type: 'setOpszMultiplier'; value: number }
  | { type: 'setFreezeOpsz'; value: boolean }
  | { type: 'setFrozenOpszValue'; value: number | null }
  | { type: 'setAutoAscender'; value: boolean }
  | { type: 'setActivePreset'; name: string | null }
  | { type: 'setUseHoi'; value: boolean }
  | { type: 'setBuildName'; name: string }
  | { type: 'resetDefaults' }                                 // rail reset: ◆ → SHIPPED + clear preset

export function reducer(s: InstrumentState, a: Action): InstrumentState {
  switch (a.type) {
    case 'init':
      return createInitialState(a.shipped)
    case 'setDefaultAxis': {
      // Re-anchoring an axis clears its transient preview so the ● reflects the new ◆
      // (mirrors the classic app's handleSliderChange).
      const preview = { ...s.preview }
      delete preview[a.tag]
      return { ...s, defaults: { ...s.defaults, axes: { ...s.defaults.axes, [a.tag]: a.value } }, preview }
    }
    case 'setPreview':
      return { ...s, preview: { ...s.preview, [a.tag]: a.value } }
    case 'clearPreview':
      return previewDrifted(s) ? { ...s, preview: {} } : s
    case 'setStockHold':
      return { ...s, stockHold: a.held }
    case 'setThresholds':
      return { ...s, defaults: { ...s.defaults, glyphThresholds: a.thresholds } }
    case 'setOpszMultiplier':
      return { ...s, defaults: { ...s.defaults, opszMultiplier: a.value } }
    case 'setFreezeOpsz':
      return { ...s, defaults: { ...s.defaults, freezeOpsz: a.value } }
    case 'setFrozenOpszValue':
      return { ...s, defaults: { ...s.defaults, frozenOpszValue: a.value } }
    case 'setAutoAscender':
      return { ...s, defaults: { ...s.defaults, autoAscender: a.value } }
    case 'setActivePreset':
      return { ...s, activePreset: a.name }
    case 'setUseHoi':
      return { ...s, useHoi: a.value }
    case 'setBuildName':
      return { ...s, buildName: a.name }
    case 'resetDefaults': {
      // Reset every ◆ adjustment back toward SHIPPED and clear the engaged preset.
      // Preview (●) is the Return pill's job; HOI (rendering mode) and buildName
      // (naming choice) aren't bake-target adjustments — all preserved (§3.3).
      const fresh = createInitialState(s.shipped)
      return { ...fresh, preview: { ...s.preview }, useHoi: s.useHoi, buildName: s.buildName }
    }
    default:
      return s
  }
}
