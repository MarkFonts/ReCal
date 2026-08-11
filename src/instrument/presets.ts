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
}

export const PRESETS: Preset[] = [
  { name: 'Mobile UI', geom: 25, thresholds: b => ({ ...b, l: [26] }) },
  { name: 'Display', geom: 50 },
  { name: 'Wayfinding', geom: 5, opszMultiplier: 6 },
  { name: 'Futura', geom: 100, ytas: 800, shrp: 100, frozenOpsz: 16 },
  {
    name: 'Neutra 2', geom: 25, ytas: 800, shrp: 100, opszMultiplier: 0.625,
    thresholds: b => { let t = applyDelete('a', 0, 'A11Y', b); t = applyDrop('y', 2, 'UI', t); return t },
  },
  { name: 'Inter', geom: 25, opszMultiplier: 0.625 },
  { name: 'Circular', geom: 25, frozenOpsz: 20 },
  { name: 'Geist', geom: 50, frozenOpsz: 16, thresholds: b => applyDrop('a', 0, 'Base', b) },
  { name: 'Poppins', geom: 50, frozenOpsz: 10, thresholds: b => applyDrop('y', 2, 'Base', b) },
  { name: 'Gotham', geom: 25, frozenOpsz: 10, thresholds: b => applyDelete('a', 0, 'A11Y', b) },
  { name: 'GT America', geom: 25, frozenOpsz: 8, thresholds: b => applyDelete('a', 0, 'A11Y', b) },
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
  dispatch({ type: 'setActivePreset', name: p.name })
}
