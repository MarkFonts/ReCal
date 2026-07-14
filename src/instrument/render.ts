// The render engine — one path every canvas surface reads (docs/control-mapping.md §6).
// Generalises the classic previewVarSettings / modalVarSettings into a single function
// driven by the store's effective() axis map.
import type { AxisMap } from './store'

const AXIS_ORDER = ['wght', 'opsz', 'GEOM', 'YTAS', 'SHRP', 'ital'] as const

// Build a `font-variation-settings` string from an axis map. `opszOverride` lets a
// surface pin opsz (e.g. optical-size scaling) independent of the stored value.
export function renderVarSettings(axes: AxisMap, opszOverride?: number): string {
  const parts: string[] = []
  for (const tag of AXIS_ORDER) {
    const v = tag === 'opsz' && opszOverride !== undefined ? opszOverride : axes[tag]
    if (v === undefined) continue
    parts.push(`'${tag}' ${tag === 'ital' ? v : Math.round(v * 10) / 10}`)
  }
  return parts.join(', ') || 'normal'
}

// opsz that a given rendered size should use under the export's multiplier: the font
// behaves as if it were at (size / multiplier), clamped to the axis range. Mirrors the
// classic app's `fontSize / opszMultiplier` mapping.
export function opszForSize(size: number, multiplier: number, min = 8, max = 45): number {
  return Math.min(Math.max(size / (multiplier || 1), min), max)
}
