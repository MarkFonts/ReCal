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

// The preview font keeps the STOCK opsz axis (8–45): the Optical scale is pure arithmetic in
// CSS, never a rebuild. A size px under scale m renders at stock opsz px / m, held inside the
// export's clamp [lo, hi] (stock units). That is exactly what the exported font does at px:
// its axis is the stock one relabelled ×m, so its opsz px is stock px / m. Changing the scale
// is therefore instant, and the numbers and the face can never disagree mid-rebuild.
export const opszPreviewForSize = (px: number, multiplier = 1, limits: [number, number] = [8, 45]): number =>
  Math.min(Math.max(px / (multiplier || 1), limits[0]), limits[1])

// The Try bar's opsz is given in the export's units (stock × scale); in stock units for CSS.
export const clampTryOpsz = (v: number, multiplier = 1, limits: [number, number] = [8, 45]): number =>
  opszPreviewForSize(v, multiplier, limits)

// Is the export's opsz clamp narrower than the stock axis? Then auto can't be left to the browser.
export const opszClamped = (limits?: [number, number]): boolean =>
  !!limits && (limits[0] > 8 || limits[1] < 45)

// Resolve opsz for a specimen element WITHOUT re-baking the font. opsz FREEZE is a
// fixed value applied live via CSS (the browser interpolates the deltas per frame —
// the ~5s instancer only ever mattered for the static download, never the preview).
// At scale 1× with the stock range, font-optical-sizing:auto is already right. Under any
// other scale, or a clamp (which auto ignores), each element sets stock opsz
// clamp(px / m, lo, hi) itself, from its rendered size. With no size known (the Glyphs grid
// mixes sizes) it stays on auto: right at 1×, stock sizing otherwise.
export function opszCss(
  d: { freezeOpsz: boolean; frozenOpszValue: number | null; opszMultiplier?: number },
  opszAuto: boolean,
  opszDefault = 14,
  tryOpsz: number | null = null,
  clamp: { sizePx?: number; limits?: [number, number] } = {},
): { renderOpts: { opszOverride?: number; skipOpsz?: boolean }; optical: 'auto' | 'none' } {
  if (d.freezeOpsz) {
    const v = Math.min(Math.max(d.frozenOpszValue ?? opszDefault, 8), 45)
    return { renderOpts: { opszOverride: v }, optical: 'none' }
  }
  const narrow = opszClamped(clamp.limits)
  const m = d.opszMultiplier ?? 1
  // The Try bar's opsz: preview only, given in the export's units (stock × scale), and held
  // inside the clamp — the export cannot render a value outside it.
  if (tryOpsz !== null) {
    return { renderOpts: { opszOverride: clampTryOpsz(tryOpsz, m, narrow ? clamp.limits : undefined) }, optical: 'none' }
  }
  if (opszAuto && (narrow || m !== 1) && clamp.sizePx !== undefined) {
    return { renderOpts: { opszOverride: opszPreviewForSize(clamp.sizePx, d.opszMultiplier, clamp.limits) }, optical: 'none' }
  }
  if (opszAuto) return { renderOpts: { skipOpsz: true }, optical: 'auto' }
  return { renderOpts: {}, optical: 'none' }
}
