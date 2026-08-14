// The ◆ layer as a URL, and back.
//
// Every decision that gets baked into an exported font is addressable: axis defaults, the
// GEOM switch points, the opsz treatment, pinned features, vertical metrics, and the build
// name. A configuration is a link, and the same query string feeds the OG image renderer,
// so what you share looks like what you tuned.
//
// Two rules make the links usable:
//
//   1. Only the diff from SHIPPED is written. An untouched instrument serialises to the
//      empty string; a Futura-ish setting is a dozen characters. URL length tracks how far
//      you have moved, which is also what makes a shared link readable.
//   2. Keys are short and frozen. Once a link is pasted somewhere it has to keep working,
//      so these are a public contract -- add keys, never repurpose one.
//
// Round-trip is exact: decode(encode(d)) deep-equals d for any layer reachable in the UI.

import {
  AXIS_RANGES, SHIPPED_AXES, type AxisMap, type DefaultsLayer,
} from './store'
import { DEFAULT_VMETRICS, type VMetrics } from './vmetrics'

/* Axis tag -> query key. Short, lowercase, and unambiguous against the flag keys below. */
const AXIS_KEY: Record<string, string> = {
  opsz: 'o', GEOM: 'g', wght: 'w', YTAS: 'y', SHRP: 's', ital: 'i',
}
const KEY_AXIS: Record<string, string> = Object.fromEntries(
  Object.entries(AXIS_KEY).map(([tag, k]) => [k, tag]))

/* Everything that is not an axis. */
const K = {
  thresholds: 't',      // a:70.71~y:35.40   -- only groups that moved
  multiplier: 'm',      // opsz rescale, when not 1
  frozenOpsz: 'f',      // frozen opsz value; 'f' present means freezeOpsz
  autoAscender: 'aa',   // 1
  features: 'ff',       // cv18.ss10
  name: 'n',            // build name
  vmetrics: 'vm',       // preset id, or 'custom' plus the numbers
  preset: 'p',          // the "start from…" entry this began as, for provenance
} as const

const num = (v: number) => {
  /* Trailing zeros make links look machine-written and defeat string equality on the OG
     cache key; 0.625 and 100 both need to survive. */
  const r = Math.round(v * 1000) / 1000
  return String(r)
}

const clampAxis = (tag: string, v: number) => {
  const r = AXIS_RANGES[tag]
  return r ? Math.min(Math.max(v, r.min), r.max) : v
}

/* ---------------------------------------------------------------- encode */

export function encodeDefaults(
  d: DefaultsLayer,
  opts: { shippedAxes?: AxisMap; shippedThresholds?: Record<string, number[]>
          buildName?: string; activePreset?: string | null } = {},
): string {
  const shippedAxes = opts.shippedAxes ?? SHIPPED_AXES
  const shippedThr = opts.shippedThresholds ?? {}
  const p = new URLSearchParams()

  for (const [tag, key] of Object.entries(AXIS_KEY)) {
    const v = d.axes[tag]
    if (v === undefined) continue
    if (shippedAxes[tag] !== undefined && v === shippedAxes[tag]) continue
    p.set(key, num(v))
  }

  /* Thresholds are the expensive part if written whole -- sixteen groups, most of them
     untouched on any real configuration. Only the moved ones go in. */
  const moved: string[] = []
  for (const [glyph, vals] of Object.entries(d.glyphThresholds ?? {})) {
    const base = shippedThr[glyph]
    if (base && base.length === vals.length && base.every((b, i) => b === vals[i])) continue
    moved.push(`${glyph}:${vals.map(num).join('.')}`)
  }
  if (moved.length) p.set(K.thresholds, moved.join('~'))

  if (d.opszMultiplier !== 1) p.set(K.multiplier, num(d.opszMultiplier))
  if (d.freezeOpsz) p.set(K.frozenOpsz, d.frozenOpszValue == null ? '' : num(d.frozenOpszValue))
  if (d.autoAscender) p.set(K.autoAscender, '1')
  if (d.frozenFeatures?.length) p.set(K.features, [...d.frozenFeatures].sort().join('.'))
  if (d.vmetrics && d.vmetrics.preset !== DEFAULT_VMETRICS.preset)
    p.set(K.vmetrics, d.vmetrics.preset)
  if (opts.buildName) p.set(K.name, opts.buildName)
  if (opts.activePreset) p.set(K.preset, opts.activePreset)

  return p.toString()
}

/* ---------------------------------------------------------------- decode */

export interface DecodedState {
  axes: AxisMap                                  // only the tags the URL carried
  glyphThresholds: Record<string, number[]>      // only the groups the URL carried
  opszMultiplier?: number
  freezeOpsz?: boolean
  frozenOpszValue?: number | null
  autoAscender?: boolean
  frozenFeatures?: string[]
  vmetricsPreset?: VMetrics['preset']
  buildName?: string
  activePreset?: string
}

/* A shared link is untrusted input: anything unparseable is dropped rather than thrown, so
   one bad character costs that field and not the page. */
export function decodeDefaults(search: string): DecodedState {
  const p = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const out: DecodedState = { axes: {}, glyphThresholds: {} }

  for (const [key, tag] of Object.entries(KEY_AXIS)) {
    const raw = p.get(key)
    if (raw == null) continue
    const v = Number(raw)
    if (Number.isFinite(v)) out.axes[tag] = clampAxis(tag, v)
  }

  const t = p.get(K.thresholds)
  if (t) {
    for (const entry of t.split('~')) {
      const [glyph, list] = entry.split(':')
      if (!glyph || !list) continue
      const vals = list.split('.').map(Number).filter(Number.isFinite)
      /* Thresholds must ascend, or the swap map is nonsense; a scrambled link is ignored
         for that glyph rather than producing a font nobody asked for. */
      if (!vals.length) continue
      if (vals.some((v, i) => i && v < vals[i - 1])) continue
      if (vals.some(v => v < 0 || v > 100)) continue
      out.glyphThresholds[glyph] = vals
    }
  }

  const m = Number(p.get(K.multiplier))
  if (p.has(K.multiplier) && Number.isFinite(m) && m > 0) out.opszMultiplier = m

  if (p.has(K.frozenOpsz)) {
    out.freezeOpsz = true
    const f = Number(p.get(K.frozenOpsz))
    out.frozenOpszValue = p.get(K.frozenOpsz) !== '' && Number.isFinite(f)
      ? clampAxis('opsz', f) : null
  }
  if (p.get(K.autoAscender) === '1') out.autoAscender = true

  const ff = p.get(K.features)
  if (ff) {
    const tags = ff.split('.').filter(x => /^(ss|cv)\d{2}$/.test(x))
    if (tags.length) out.frozenFeatures = tags
  }

  const vm = p.get(K.vmetrics)
  if (vm && ['wordmark', 'arrowtype', 'googlefonts', 'custom'].includes(vm))
    out.vmetricsPreset = vm as VMetrics['preset']

  const n = p.get(K.name)
  if (n) out.buildName = n.slice(0, 64)
  const pre = p.get(K.preset)
  if (pre) out.activePreset = pre.slice(0, 40)

  return out
}

/* ---------------------------------------------------------------- helpers */

/** The canonical share link for a configuration. */
export function shareUrl(origin: string, base: string, query: string): string {
  return query ? `${origin}${base}/?${query}` : `${origin}${base}/`
}

/** The OG image for that same configuration — one encoding, two consumers. */
export function ogUrl(origin: string, base: string, query: string): string {
  return query ? `${origin}${base}/og/card?${query}` : `${origin}${base}/og/default.png`
}
