// "Start from…" presets, ported from the classic app. Each applies through the store:
// reset ◆ → SHIPPED, then set axis defaults / opsz / thresholds / activePreset.
// Threshold-modifying presets won't visibly change GEOM swaps until the Pyodide
// rebuild (Phase 6); axis + opsz changes are visible now.
import { applyDrop, applyDelete } from '../GlyphGroups'
import { shippedThresholds, type Action } from './store'

type Thresholds = Record<string, number[]>
export type Preset = {
  name: string
  geom?: number
  ytas?: number
  shrp?: number
  opszMultiplier?: number
  frozenOpsz?: number
  thresholds?: (base: Thresholds) => Thresholds
  /**
   * Features the preset freezes — fused into the default cmap on download by the
   * worker's _freeze_features, and previewed live via font-feature-settings, so what
   * you see is what you bake. This is the preset's GLYPH half; `thresholds` is its
   * GEOM half, and the two are different mechanisms: a threshold edit rewrites when
   * rclt fires, a freeze picks a drawing outright and needs no rebuild to preview.
   *
   * A set where the set is exact, a character variant where it is not. ss16 is
   * precisely six + nine. ss10 would swap seven letters to move the y, and its
   * a→a.ss01 collides with cv02's a→a.ss02 in any preset naming both — so y is cv22
   * and a is cv02/cv03. Mirrors scripts/seo-presets.mjs, which states the same
   * decisions for the static pages that cannot run the baker.
   */
  frozen?: string[]
}

export const PRESETS: Preset[] = [
  { name: 'Mobile UI', geom: 25, thresholds: b => ({ ...b, l: [26] }) },
  { name: 'Display', geom: 50 },
  { name: 'Wayfinding', geom: 5, opszMultiplier: 6 },
  { name: 'Futura', geom: 100, ytas: 800, shrp: 100, frozenOpsz: 16 },
  {
    name: 'Neutra 2', geom: 25, ytas: 800, shrp: 100, opszMultiplier: 0.625,
    frozen: ['cv02', 'cv22'],
    thresholds: b => { let t = applyDelete('a', 0, 'A11Y', b); t = applyDrop('y', 2, 'UI', t); return t },
  },
  { name: 'Inter', geom: 25, opszMultiplier: 0.625, frozen: ['ss16'] },
  {
    name: 'Circular', geom: 25, frozenOpsz: 20, frozen: ['cv30', 'cv31'],
    // Keep only y's Geo-zone rclt swap (y.rcltGeo); nuke the Base-zone one (y.rcltBase)
    // by collapsing its range to a 1-unit sliver right after default, per applyDelete's
    // middle-non-default case.
    thresholds: b => applyDelete('y', 1, 'Base', b),
  },
  { name: 'Geist', geom: 50, frozenOpsz: 16, frozen: ['cv03', 'cv11', 'ss16'],
    thresholds: b => applyDrop('a', 0, 'Base', b) },
  { name: 'Poppins', geom: 50, frozenOpsz: 10, frozen: ['cv22', 'ss16'],
    thresholds: b => applyDrop('y', 2, 'Base', b) },
  { name: 'Gotham', geom: 25, frozenOpsz: 10, frozen: ['cv02', 'ss16'],
    thresholds: b => applyDelete('a', 0, 'A11Y', b) },
  { name: 'GT America', geom: 25, frozenOpsz: 8, frozen: ['cv02'],
    thresholds: b => applyDelete('a', 0, 'A11Y', b) },
]

export function applyPreset(dispatch: (a: Action) => void, p: Preset) {
  dispatch({ type: 'resetDefaults' })
  if (p.geom !== undefined) dispatch({ type: 'setDefaultAxis', tag: 'GEOM', value: p.geom })
  if (p.ytas !== undefined) dispatch({ type: 'setDefaultAxis', tag: 'YTAS', value: p.ytas })
  if (p.shrp !== undefined) dispatch({ type: 'setDefaultAxis', tag: 'SHRP', value: p.shrp })
  if (p.opszMultiplier !== undefined) dispatch({ type: 'setOpszMultiplier', value: p.opszMultiplier })
  if (p.frozenOpsz !== undefined) {
    dispatch({ type: 'setFreezeOpsz', value: true })
    dispatch({ type: 'setFrozenOpszValue', value: p.frozenOpsz })
  }
  if (p.thresholds) dispatch({ type: 'setThresholds', thresholds: p.thresholds(shippedThresholds()) })
  // resetDefaults above rebuilt state from scratch, so frozenFeatures is empty here and
  // toggling is the same as setting.
  for (const tag of p.frozen ?? []) dispatch({ type: 'toggleFrozenFeature', tag })
  dispatch({ type: 'setActivePreset', name: p.name })
}
