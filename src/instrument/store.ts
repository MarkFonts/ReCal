// Instrument-model store — the three-layer state everything hangs off.
// See docs/control-mapping.md §1. Pure logic only (no React) so it stays testable.
//
//   SHIPPED  — immutable stock Cal Sans axis defaults (as released)
//   defaults — the user's ◆ re-anchored origin; what the rebuild bakes
//   preview  — transient ● overrides from play; CSS only, never baked
//
// Selectors: merged() = defaults + preview, effective() = stockHold ? SHIPPED : merged().

import { GROUP_DEFS } from '../GlyphGroups'
import type { CompareSpec } from './boot'
import { DEFAULT_VMETRICS, type VMetrics } from './vmetrics'

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
  frozenFeatures: string[]                      // ◆ ssXX/cvXX pinned as manual overrides
                                                //   (baked into the default forms + features stripped on export)
  vmetrics: VMetrics                            // ◆ OS/2 + hhea vertical metrics (baked on export)
}

export type PreviewLayer = AxisMap              // ● transient per-axis overrides (incl. ital)

export interface InstrumentState {
  shipped: AxisMap                              // SHIPPED (frozen at load)
  shippedThresholds: Record<string, number[]>   // SHIPPED GEOM swap map
  defaults: DefaultsLayer
  preview: PreviewLayer
  stockHold: boolean                            // hold-to-compare: effective() → SHIPPED
  geomDragging: boolean                         // rail GEOM slider held: flash holds colour, fades on release
  activePreset: string | null                   // engaged "start from…" entry (§3.3)
  useHoi: boolean                               // Higher-Order Interpolation (swaps to Flex VF)
  buildName: string                             // editable export family name (INFO receipt)
  recalMode: 'edit' | 'demo'                    // EDIT = build the ◆ (play dimmed); DEMO = preview (rail dimmed)
  past: DefaultsLayer[]                          // ◆ undo history (matrix drags snapshot on grab)
  future: DefaultsLayer[]                        // ◆ redo stack
  compare: CompareSpec | null                   // referent webfont on a fused compare page (BOOT)
  compareOn: boolean                            // specimen text swapped to the referent font
  rebuilding: boolean                           // Pyodide preview recompile in flight (◆ edits)
  railGroup: number                             // rail descent section: 0 tune · 1 matrix · 2 freezer · 3 vmetrics
}

const cloneThresholds = (t: Record<string, number[]>): Record<string, number[]> =>
  Object.fromEntries(Object.entries(t).map(([k, v]) => [k, [...v]]))

const cloneVMetrics = (v: VMetrics): VMetrics =>
  ({ ...v, hhea: { ...v.hhea }, typo: { ...v.typo }, win: { ...v.win } })

const cloneDefaults = (d: DefaultsLayer): DefaultsLayer =>
  ({ ...d, axes: { ...d.axes }, glyphThresholds: cloneThresholds(d.glyphThresholds), frozenFeatures: [...d.frozenFeatures], vmetrics: cloneVMetrics(d.vmetrics) })

export function shippedThresholds(): Record<string, number[]> {
  return Object.fromEntries(GROUP_DEFS.map(g => [g.glyph, [...g.defaultThresholds]]))
}

export function createInitialState(shipped: AxisMap = SHIPPED_AXES, compare: CompareSpec | null = null): InstrumentState {
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
      frozenFeatures: [],
      vmetrics: cloneVMetrics(DEFAULT_VMETRICS),
    },
    preview: {},
    stockHold: false,
    geomDragging: false,
    activePreset: null,
    useHoi: false,
    buildName: 'ReCal Sans',
    recalMode: 'edit',   // open in EDIT (building the ◆); DEMO is the preview mode you switch to
    past: [],
    future: [],
    compare,
    compareOn: false,
    rebuilding: false,
    railGroup: 0,
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

// Does the ◆ layer differ from SHIPPED at all? Drives whether "Reset" has anything to do.
export const defaultsDirty = (s: InstrumentState): boolean =>
  changedAxisTags(s).length > 0 ||
  glyphsEditedCount(s) > 0 ||
  s.defaults.opszMultiplier !== 1 ||
  s.defaults.freezeOpsz ||
  s.defaults.frozenOpszValue !== null ||
  s.defaults.autoAscender ||
  s.defaults.frozenFeatures.length > 0 ||
  s.defaults.vmetrics.preset !== DEFAULT_VMETRICS.preset ||
  s.activePreset !== null

// ── Actions / reducer ───────────────────────────────────────────────────────────
export type Action =
  | { type: 'init'; shipped: AxisMap }                        // re-seed from live axisInfo
  | { type: 'setDefaultAxis'; tag: string; value: number }    // rail ◆ pin; clears matching ●
  | { type: 'setPreview'; tag: string; value: number }        // dock / Previewer ●
  | { type: 'clearPreview' }                                  // Return pill
  | { type: 'setStockHold'; held: boolean }                   // hold-to-compare
  | { type: 'setGeomDragging'; value: boolean }               // rail GEOM slider pointer down/up
  | { type: 'setThresholds'; thresholds: Record<string, number[]> }
  | { type: 'setOpszMultiplier'; value: number }
  | { type: 'setFreezeOpsz'; value: boolean }
  | { type: 'setFrozenOpszValue'; value: number | null }
  | { type: 'setAutoAscender'; value: boolean }
  | { type: 'toggleFrozenFeature'; tag: string }             // freezer: pin/unpin an ssXX/cvXX form
  | { type: 'setVMetrics'; value: VMetrics }                 // vmetrics: preset or hand-tuned metrics
  | { type: 'setRailGroup'; group: number }                  // rail descent section (transient UI)
  | { type: 'setActivePreset'; name: string | null }
  | { type: 'setUseHoi'; value: boolean }
  | { type: 'setBuildName'; name: string }
  | { type: 'setRecalMode'; mode: 'edit' | 'demo' }           // entering 'edit' clears preview
  | { type: 'setCompareOn'; on: boolean }                     // swap specimen text to the referent font
  | { type: 'setRebuilding'; value: boolean }                 // engine → store: preview recompile state
  | { type: 'resetDefaults' }                                 // rail reset: ◆ → SHIPPED + clear preset
  | { type: 'pushHistory' }                                   // snapshot ◆ before a drag (one undo grain per drag)
  | { type: 'undo' }
  | { type: 'redo' }

export function reducer(s: InstrumentState, a: Action): InstrumentState {
  switch (a.type) {
    case 'init':
      return createInitialState(a.shipped, s.compare)
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
    case 'setCompareOn':
      return { ...s, compareOn: a.on }
    case 'setRebuilding':
      return s.rebuilding === a.value ? s : { ...s, rebuilding: a.value }
    case 'setGeomDragging':
      return s.geomDragging === a.value ? s : { ...s, geomDragging: a.value }
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
    case 'toggleFrozenFeature': {
      const cur = s.defaults.frozenFeatures
      const next = cur.includes(a.tag) ? cur.filter(t => t !== a.tag) : [...cur, a.tag]
      return { ...s, defaults: { ...s.defaults, frozenFeatures: next } }
    }
    case 'setVMetrics':
      return { ...s, defaults: { ...s.defaults, vmetrics: a.value } }
    case 'setRailGroup':
      return s.railGroup === a.group ? s : { ...s, railGroup: a.group }
    case 'setActivePreset':
      return { ...s, activePreset: a.name }
    case 'setUseHoi':
      return { ...s, useHoi: a.value }
    case 'setBuildName':
      return { ...s, buildName: a.name }
    case 'setRecalMode':
      // Entering EDIT resets the ● preview (back to the ◆ default look).
      return { ...s, recalMode: a.mode, preview: a.mode === 'edit' ? {} : s.preview }
    case 'resetDefaults': {
      // Reset every ◆ adjustment back toward SHIPPED and clear the engaged preset.
      // Preview (●) is the Return pill's job; HOI (rendering mode) and buildName
      // (naming choice) aren't bake-target adjustments — all preserved (§3.3).
      const fresh = createInitialState(s.shipped, s.compare)
      return { ...fresh, preview: { ...s.preview }, useHoi: s.useHoi, buildName: s.buildName, recalMode: s.recalMode, railGroup: s.railGroup }
    }
    case 'pushHistory':
      return { ...s, past: [...s.past, cloneDefaults(s.defaults)], future: [] }
    case 'undo': {
      if (s.past.length === 0) return s
      const prev = s.past[s.past.length - 1]
      return { ...s, defaults: prev, past: s.past.slice(0, -1), future: [cloneDefaults(s.defaults), ...s.future] }
    }
    case 'redo': {
      if (s.future.length === 0) return s
      const next = s.future[0]
      return { ...s, defaults: next, past: [...s.past, cloneDefaults(s.defaults)], future: s.future.slice(1) }
    }
    default:
      return s
  }
}
