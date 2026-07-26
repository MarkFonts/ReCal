// The render engine — one path every canvas surface reads (docs/control-mapping.md §6).
// Generalises the classic previewVarSettings / modalVarSettings into a single function
// driven by the store's effective() axis map.
import type { AxisMap } from './store'
import type { CompareSpec } from './boot'
import type { CSSProperties } from 'react'

const AXIS_ORDER = ['wght', 'opsz', 'GEOM', 'YTAS', 'SHRP', 'ital'] as const

// Build a `font-variation-settings` string from an axis map. `opszOverride` pins opsz
// to a value; `skipOpsz` omits opsz entirely (for font-optical-sizing: auto — the
// browser then tracks opsz to each element's rendered size, per font-proofer).
export function renderVarSettings(
  axes: AxisMap,
  opts: { opszOverride?: number; skipOpsz?: boolean } = {},
): string {
  const parts: string[] = []
  for (const tag of AXIS_ORDER) {
    if (tag === 'opsz' && opts.skipOpsz) continue
    const v = tag === 'opsz' && opts.opszOverride !== undefined ? opts.opszOverride : axes[tag]
    if (v === undefined) continue
    parts.push(`'${tag}' ${tag === 'ital' ? v : Math.round(v * 10) / 10}`)
  }
  return parts.join(', ') || 'normal'
}

// Compare-mode style override (fused SEO pages): the referent font can't read Cal
// Sans's custom axes, so weight travels via font-weight (variable families track it,
// static families snap to their nearest loaded style), ital ≥ 0.5 snaps to the real
// italic style when one exists, and opsz applies only when the referent truly has the
// axis. font-variation-settings is reset so Cal Sans axis values never leak through.
export function compareStyle(
  c: CompareSpec,
  axes: AxisMap,
  opts: { opszAuto?: boolean; wghtOverride?: number; italOverride?: number } = {},
): CSSProperties {
  const [wMin, wMax] = c.wghtRange ?? [400, 700]
  const w = Math.round(Math.min(Math.max(opts.wghtOverride ?? axes.wght ?? 400, wMin), wMax))
  const italic = c.italic && (opts.italOverride ?? axes.ital ?? 0) >= 0.5
  const heavy = c.heavy && w >= c.heavy.from
  const st: CSSProperties = {
    fontFamily: heavy ? c.heavy!.family : c.family,
    fontWeight: heavy ? c.heavy!.weight : w,
    fontStyle: italic ? 'italic' : 'normal',
    fontSynthesis: 'none',
    fontVariationSettings: 'normal',
    fontOpticalSizing: 'none',
  }
  if (c.opszRange) {
    if (opts.opszAuto ?? true) st.fontOpticalSizing = 'auto'
    else if (axes.opsz !== undefined) {
      st.fontVariationSettings = `'opsz' ${Math.min(Math.max(axes.opsz, c.opszRange[0]), c.opszRange[1])}`
    }
  }
  return st
}

// opsz that a given rendered size should use under the export's multiplier: the font
// behaves as if it were at (size / multiplier), clamped to the axis range. Mirrors the
// classic app's `fontSize / opszMultiplier` mapping.
export function opszForSize(size: number, multiplier: number, min = 8, max = 45): number {
  return Math.min(Math.max(size / (multiplier || 1), min), max)
}

// Resolve opsz for a specimen element WITHOUT re-baking the font. opsz FREEZE is a
// fixed value applied live via CSS (the browser interpolates the deltas per frame —
// the ~5s instancer only ever mattered for the static download, never the preview).
// The SCALER stays baked as a cheap axis relabel, so font-optical-sizing:auto handles
// per-size mapping for free — hence no per-element opsz here for that case.
export function opszCss(
  d: { freezeOpsz: boolean; frozenOpszValue: number | null },
  opszAuto: boolean,
  opszDefault = 14,
): { renderOpts: { opszOverride?: number; skipOpsz?: boolean }; optical: 'auto' | 'none' } {
  if (d.freezeOpsz) {
    const v = Math.min(Math.max(d.frozenOpszValue ?? opszDefault, 8), 45)
    return { renderOpts: { opszOverride: v }, optical: 'none' }
  }
  if (opszAuto) return { renderOpts: { skipOpsz: true }, optical: 'auto' }
  return { renderOpts: {}, optical: 'none' }
}
