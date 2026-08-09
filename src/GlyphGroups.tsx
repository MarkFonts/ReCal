import { useRef } from 'react'
import { ZONE_COLOR } from './zoneColors'
import { SUBS } from './data/substitutions'

export type VariantLabel = 'A11Y' | 'UI' | 'default' | 'Base' | 'Geo'
type Variant = { label: VariantLabel; color: string }

export type GroupDef = {
  glyph: string
  variants: Variant[]
  defaultThresholds: number[]
}

const V: Record<VariantLabel, Variant> = {
  A11Y:    { label: 'A11Y',    color: ZONE_COLOR.A11Y },
  UI:      { label: 'UI',      color: ZONE_COLOR.UI },
  default: { label: 'default', color: ZONE_COLOR.default },
  Base:    { label: 'Base',    color: ZONE_COLOR.Base },
  Geo:     { label: 'Geo',     color: ZONE_COLOR.Geo },
}

// Derived from the canonical substitution table (VISION §7 — src/data/substitutions.json,
// generated from CalSansVF's own FeatureVariations). Threshold band edges + variant
// sequence come from the font; colours from V. Non-monotonic reverts (f: default →
// Base → default) and the exact onsets are all font-authoritative — no hand values to
// drift. Regenerate: .venv/bin/python scripts/gen_substitutions.py
export const GROUP_DEFS: GroupDef[] = SUBS.geomGroups.map(g => ({
  glyph: g.headline,
  variants: g.variants.map(v => V[v.label as VariantLabel]),
  defaultThresholds: g.thresholds,
}))

export const LANDING_ZONES = [
  { label: 'A11Y', start: 0,  end: 10,  mid: 5,  sampleGeom: 3,  color: ZONE_COLOR.A11Y },
  { label: 'UI',   start: 15, end: 30,  mid: 22, sampleGeom: 22, color: ZONE_COLOR.UI },
  { label: 'Base', start: 40, end: 60,  mid: 50, sampleGeom: 50, color: ZONE_COLOR.Base },
  { label: 'Geo',  start: 80, end: 100, mid: 90, sampleGeom: 90, color: ZONE_COLOR.Geo },
]

const HATCH = 'repeating-linear-gradient(-45deg, rgba(140,120,0,0.07) 0px, rgba(140,120,0,0.07) 1px, transparent 1px, transparent 10px)'

const ZONE_BG = [
  { start: 0,  end: 10,  bg: 'color-mix(in srgb, var(--zone-a11y) 6%, transparent)' },
  { start: 10, end: 15,  bg: HATCH },
  { start: 15, end: 30,  bg: 'color-mix(in srgb, var(--zone-ui) 4%, transparent)' },
  { start: 30, end: 40,  bg: HATCH },
  { start: 40, end: 60,  bg: 'color-mix(in srgb, var(--zone-base) 5%, transparent)' },
  { start: 60, end: 80,  bg: HATCH },
  { start: 80, end: 100, bg: 'color-mix(in srgb, var(--zone-geo) 5%, transparent)' },
]

const RULER_TICKS = [0, 10, 15, 30, 40, 60, 80, 100]
const LABELS_WIDTH = 28

function ZoneBg() {
  return (
    <div className="gg-zone-bg" aria-hidden>
      {ZONE_BG.map(z => (
        <div key={z.start} style={{
          position: 'absolute', left: `${z.start}%`, width: `${z.end - z.start}%`,
          top: 0, bottom: 0, background: z.bg,
        }} />
      ))}
    </div>
  )
}

function variantGeom(def: GroupDef, vi: number, thresholds: number[]): number {
  const start = vi === 0 ? 0 : thresholds[vi - 1]
  const end = vi === def.variants.length - 1 ? 100 : thresholds[vi]
  return (start + end) / 2
}

function GlyphRow({ def, thresholds, geomDefault, otherDefaults, opszDefault, onChange, onDragStart }: {
  def: GroupDef
  thresholds: number[]
  geomDefault: number
  otherDefaults: Record<string, number>
  opszDefault: number
  onChange: (t: number[]) => void
  onDragStart?: () => void
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const activeIdx = thresholds.reduce((acc, t) => (geomDefault >= t ? acc + 1 : acc), 0)

  function startDrag(handleIdx: number) {
    return (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault()
      onDragStart?.()
      const el = e.currentTarget
      el.setPointerCapture(e.pointerId)
      const track = trackRef.current!
      const onMove = (ev: Event) => {
        const pev = ev as PointerEvent
        const rect = track.getBoundingClientRect()
        const raw = Math.round(((pev.clientX - rect.left) / rect.width) * 100)
        const lo = handleIdx > 0 ? thresholds[handleIdx - 1] + 2 : 1
        const hi = handleIdx < thresholds.length - 1 ? thresholds[handleIdx + 1] - 2 : 99
        const next = [...thresholds]
        next[handleIdx] = Math.min(Math.max(raw, lo), hi)
        onChange(next)
      }
      el.addEventListener('pointermove', onMove)
      el.addEventListener('pointerup', () => el.removeEventListener('pointermove', onMove), { once: true })
    }
  }

  const rowHeight = def.variants.length * 20

  return (
    <div className="gg-row" style={{ height: rowHeight }}>
      <div className="gg-labels">
        {def.variants.map((v, vi) => {
          const geomVal = variantGeom(def, vi, thresholds)
          const varSettings = [
            ...Object.entries(otherDefaults)
              .filter(([tag]) => tag !== 'GEOM')
              .map(([tag, val]) => `'${tag}' ${val}`),
            `'GEOM' ${geomVal}`,
            `'opsz' ${opszDefault}`,
          ].join(', ')
          return (
            <span key={vi}
              className={`gg-label${vi === activeIdx ? ' active' : ''}`}
              style={{
                color: v.color,
                fontFamily: "'CalSansVF', sans-serif",
                fontFeatureSettings: "'rclt' 1",
                fontOpticalSizing: 'none',
                fontVariationSettings: varSettings,
                height: 20, lineHeight: '20px',
              } as React.CSSProperties}
            >
              {def.glyph}
            </span>
          )
        })}
      </div>
      <div className="gg-track" ref={trackRef} style={{ height: rowHeight }}>
        <ZoneBg />
        {def.variants.map((v, vi) => {
          const segStart = vi === 0 ? 0 : thresholds[vi - 1]
          const segEnd = vi === def.variants.length - 1 ? 100 : thresholds[vi]
          return (
            <div key={vi}
              className={`gg-bar${vi === activeIdx ? ' active' : ''}`}
              style={{ top: vi * 20 + 8, left: `${segStart}%`, width: `${segEnd - segStart}%`, background: v.color }}
            />
          )
        })}
        {thresholds.map((t, ti) => (
          <div key={ti} className="gg-handle" style={{ left: `${t}%` }} onPointerDown={startDrag(ti)} />
        ))}
      </div>
    </div>
  )
}

export const PREVIEW_WORDS = ['2160 just', 'Groovy,', 'I\u2019ll', 'Magic'] as const

export type ZoneToken = {
  glyph: string
  variantIdx: number
  variantLabel: VariantLabel
  isDefault: boolean
  defaultActivation: number  // GEOM value for sort order (lower = left)
}

function tokenZone(def: GroupDef, vi: number, thresholds: number[]): string | null {
  const lo = vi === 0 ? 0 : thresholds[vi - 1]
  const hi = vi === def.variants.length - 1 ? 100 : thresholds[vi]

  // Primary: zone that contains the key threshold for this variant.
  // vi=0 (first): deactivating threshold is hi; check zone containing (hi-1)
  //   using strict interior (hi-1 > start && hi-1 < end) to avoid zones that
  //   START exactly at hi (e.g. G threshold 41 landing at Text start 40).
  // vi>0 (others): activating threshold is lo; check zone containing lo
  //   using [start, end) so lo=40 lands in Text (40-60) not the gutter before it.
  let keyZone: typeof LANDING_ZONES[0] | undefined
  if (vi === 0) {
    const key = hi - 1
    keyZone = LANDING_ZONES.find(z => key > z.start && key < z.end)
  } else {
    keyZone = LANDING_ZONES.find(z => lo >= z.start && lo < z.end)
  }
  if (keyZone) return keyZone.label

  // Fallback: max overlap
  let best: string | null = null
  let bestOverlap = 0
  for (const z of LANDING_ZONES) {
    const overlap = Math.max(0, Math.min(hi, z.end) - Math.max(lo, z.start))
    if (overlap > bestOverlap) { bestOverlap = overlap; best = z.label }
  }
  return best
}

function activeVariantAt(def: GroupDef, geom: number, thresholds: number[]): number {
  return thresholds.reduce((acc, t) => (geom >= t ? acc + 1 : acc), 0)
}

export function getZoneTokens(glyphThresholds: Record<string, number[]>): Record<string, ZoneToken[]> {
  const map: Record<string, ZoneToken[]> = {}

  const defActivation = (def: GroupDef, vi: number): number =>
    vi === 0
      ? (def.defaultThresholds[0] ?? 100)
      : (def.defaultThresholds[vi - 1] ?? 0)

  // Pass 1: place named-variant tokens using max-overlap zone assignment
  for (const def of GROUP_DEFS) {
    for (let vi = 0; vi < def.variants.length; vi++) {
      if (def.variants[vi].label === 'default') continue
      const t = glyphThresholds[def.glyph] ?? [...def.defaultThresholds]
      const zone = tokenZone(def, vi, t)
      if (!zone) continue
      if (!map[zone]) map[zone] = []
      map[zone].push({ glyph: def.glyph, variantIdx: vi, variantLabel: def.variants[vi].label, isDefault: false, defaultActivation: defActivation(def, vi) })
    }
  }

  // Pass 2: billiards default tokens — appears in zone Z when a threshold falls in [prevZone.start, z.start)
  for (let zi = 1; zi < LANDING_ZONES.length; zi++) {
    const z = LANDING_ZONES[zi]
    const prevZone = LANDING_ZONES[zi - 1]
    if (!map[z.label]) map[z.label] = []
    const placed = new Set(map[z.label].map(t => t.glyph))
    for (const def of GROUP_DEFS) {
      if (placed.has(def.glyph)) continue
      const t = glyphThresholds[def.glyph] ?? [...def.defaultThresholds]
      const vi = activeVariantAt(def, z.sampleGeom, t)
      if (def.variants[vi].label !== 'default') continue
      const hasThresholdInWindow = t.some(thresh => thresh >= prevZone.start && thresh < z.start)
      if (!hasThresholdInWindow) continue
      map[z.label].push({ glyph: def.glyph, variantIdx: vi, variantLabel: 'default', isDefault: true, defaultActivation: Infinity })
    }
  }

  // Sort each bin: named tokens left→right by default activation order, defaults last
  for (const key of Object.keys(map)) {
    map[key].sort((a, b) => a.defaultActivation - b.defaultActivation)
  }

  return map
}

const ZONE_ORDER = LANDING_ZONES.map(z => z.label)

// Thresholds land in the gutter midpoint between zones, leaving a sliver of the
// variant visible in the transition band rather than cutting off at the zone edge.
export const ZONE_DEACT = Object.fromEntries(LANDING_ZONES.map((z, i) => {
  const next = LANDING_ZONES[i + 1]
  return [z.label, next ? Math.round((z.end + next.start) / 2) : z.end]
}))
// A11Y→UI gutter: 12, UI→Base gutter: 35, Base→Geo gutter: 70
const ZONE_ACT = Object.fromEntries(LANDING_ZONES.map((z, i) => {
  const prev = LANDING_ZONES[i - 1]
  return [z.label, prev ? Math.round((prev.end + z.start) / 2) : z.start]
}))

export function applyDrop(
  glyph: string,
  variantIdx: number,
  targetZone: string | null,
  glyphThresholds: Record<string, number[]>
): Record<string, number[]> {
  const def = GROUP_DEFS.find(d => d.glyph === glyph)
  if (!def) return glyphThresholds

  // Current zone for each non-default variant
  const currentMap = getZoneTokens(glyphThresholds)
  const assignments: Record<number, string | null> = {}
  for (const z of LANDING_ZONES) {
    for (const tok of (currentMap[z.label] ?? [])) {
      if (tok.glyph === glyph) assignments[tok.variantIdx] = z.label
    }
  }
  assignments[variantIdx] = targetZone

  // Non-default variants in axis order
  const nonDef = def.variants
    .map((v, vi) => ({ label: v.label, vi }))
    .filter(x => x.label !== 'default')

  const zi = (z: string | null | undefined) =>
    z == null ? -1 : ZONE_ORDER.indexOf(z as string)

  // Cascade: axis ordering (vi1 before vi2) must be preserved.
  // Always push the HIGHER-vi (later-axis) token forward — never push lower-vi backward.
  // This prevents a backward drag from pocketing earlier-axis variants.
  for (let pass = 0; pass < nonDef.length + 2; pass++) {
    let changed = false
    for (let i = 0; i < nonDef.length - 1; i++) {
      const vi1 = nonDef[i].vi   // lower axis index → must be in earlier zone
      const vi2 = nonDef[i + 1].vi  // higher axis index → must be in later zone
      if (zi(assignments[vi1]) >= zi(assignments[vi2])) {
        const next = zi(assignments[vi1]) + 1
        assignments[vi2] = next >= ZONE_ORDER.length ? null : ZONE_ORDER[next]
        changed = true
      }
    }
    if (!changed) break
  }

  // Thresholds from assignments — snap to gutter midpoints for a transition sliver
  const newT = [...(glyphThresholds[glyph] ?? def.defaultThresholds)]
  for (let ti = 0; ti < def.variants.length - 1; ti++) {
    const lLabel = def.variants[ti].label
    const rLabel = def.variants[ti + 1].label
    if (rLabel !== 'default') {
      const z = assignments[ti + 1]
      newT[ti] = z == null ? 100 : ZONE_ACT[z]
    } else if (lLabel !== 'default') {
      const z = assignments[ti]
      newT[ti] = z == null ? 0 : ZONE_DEACT[z]
    }
    newT[ti] = Math.max(0, Math.min(100, newT[ti]))
  }
  for (let i = 1; i < newT.length; i++) {
    newT[i] = Math.max(newT[i], newT[i - 1] + 1)
  }

  // Post-process: if the dragged variant's threshold didn't land it inside the
  // target zone (can happen when gutter midpoints collide for 3-variant glyphs),
  // force the activation threshold to the zone's start so tokenZone agrees.
  if (targetZone !== null) {
    const actualZone = tokenZone(def, variantIdx, newT)
    if (actualZone !== targetZone) {
      const tz = LANDING_ZONES.find(z => z.label === targetZone)
      if (tz) {
        if (variantIdx > 0) {
          newT[variantIdx - 1] = tz.start
        } else {
          newT[0] = tz.end - 1
        }
        for (let i = 1; i < newT.length; i++) {
          newT[i] = Math.max(newT[i], newT[i - 1] + 1)
        }
      }
    }
  }

  return { ...glyphThresholds, [glyph]: newT }
}

// Delete a variant while dragging: collapse its range to zero so the flanking
// non-default variants expand to fill 0–100.
export function applyDelete(
  glyph: string,
  variantIdx: number,
  sourceZone: string,
  glyphThresholds: Record<string, number[]>
): Record<string, number[]> {
  const def = GROUP_DEFS.find(d => d.glyph === glyph)
  if (!def) return glyphThresholds
  const t = [...(glyphThresholds[glyph] ?? [...def.defaultThresholds])]
  const isDefaultVariant = def.variants[variantIdx].label === 'default'

  if (isDefaultVariant) {
    const vi = variantIdx
    if (vi === 0) {
      // default is first — next variant takes the whole range
      t[0] = 0
    } else if (vi === def.variants.length - 1) {
      // default is last — previous variant takes the whole range
      t[vi - 1] = 100
    } else {
      // default is in the middle (e.g. a: [A11Y, default, Base])
      // Lower variant expands to fill sourceZone; upper starts at next zone.
      const deact = ZONE_DEACT[sourceZone as keyof typeof ZONE_DEACT] ?? 99
      t[vi - 1] = Math.min(deact, 99)
      t[vi]     = Math.min(deact + 1, 100)
    }
  } else {
    // Non-default: remove from rclt (collapse its range to 0 / 1 unit).
    // The flanking default/other variants expand to fill the vacated range.
    if (variantIdx === 0) {
      // First variant (e.g. A11Y): threshold → 0, so geom is never below it.
      t[0] = 0
    } else if (variantIdx === def.variants.length - 1) {
      // Last variant (e.g. Base in [default, Base]): push activation threshold
      // to 100 so it only fires at exactly geom=100 — effectively never.
      t[variantIdx - 1] = 100
    } else {
      // Middle non-default: compress range to 1 unit at current position.
      t[variantIdx] = t[variantIdx - 1] + 1
    }
  }

  for (let i = 0; i < t.length; i++) t[i] = Math.max(0, Math.min(100, t[i]))
  return { ...glyphThresholds, [glyph]: t }
}

// Drop a default billiards token onto a new zone: moves the threshold that
// placed the billiards to the gutter before targetZone.
export function applyDefaultDrop(
  glyph: string,
  sourceZone: string,
  targetZone: string,
  glyphThresholds: Record<string, number[]>
): Record<string, number[]> {
  const def = GROUP_DEFS.find(d => d.glyph === glyph)
  if (!def) return glyphThresholds
  const t = [...(glyphThresholds[glyph] ?? [...def.defaultThresholds])]

  const srcIdx = LANDING_ZONES.findIndex(z => z.label === sourceZone)
  const tgtIdx = LANDING_ZONES.findIndex(z => z.label === targetZone)
  if (srcIdx < 1 || tgtIdx < 0 || srcIdx === tgtIdx) return glyphThresholds

  // The threshold that caused the billiards is the one in the window
  // [prevZone.start, sourceZone.start).
  const prevZone = LANDING_ZONES[srcIdx - 1]
  const srcStart = LANDING_ZONES[srcIdx].start
  const triggerIdx = t.findIndex(thresh => thresh >= prevZone.start && thresh < srcStart)
  if (triggerIdx < 0) return glyphThresholds

  // Move it to the gutter before targetZone (or zone start if no prevZone).
  if (tgtIdx === 0) return glyphThresholds  // A11Y has no gutter before it
  const tgtPrevZone = LANDING_ZONES[tgtIdx - 1]
  t[triggerIdx] = ZONE_DEACT[tgtPrevZone.label as keyof typeof ZONE_DEACT] ?? tgtPrevZone.end

  // Re-sort and clamp
  t.sort((a, b) => a - b)
  for (let i = 1; i < t.length; i++) t[i] = Math.max(t[i], t[i - 1] + 1)
  for (let i = 0; i < t.length; i++) t[i] = Math.max(0, Math.min(100, t[i]))
  return { ...glyphThresholds, [glyph]: t }
}

export function GlyphGroups({ thresholds, geomDefault, defaults, opszDefault, onThresholdChange, onGeomChange, varSettingsForGeom, previewSize, hidePreviewWords, onThresholdDragStart }: {
  thresholds: Record<string, number[]>
  geomDefault: number
  defaults: Record<string, number>
  opszDefault: number
  onThresholdChange: (glyph: string, t: number[]) => void
  onGeomChange: (v: number) => void
  varSettingsForGeom: (geom: number) => string
  previewSize: number
  hidePreviewWords?: boolean
  onThresholdDragStart?: () => void
}) {
  const rulerRef = useRef<HTMLDivElement>(null)

  function startGeomDrag(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault()
    const el = e.currentTarget
    el.setPointerCapture(e.pointerId)
    const track = rulerRef.current!
    const onMove = (ev: Event) => {
      const pev = ev as PointerEvent
      const rect = track.getBoundingClientRect()
      const raw = Math.round(((pev.clientX - rect.left) / rect.width) * 100)
      onGeomChange(Math.min(Math.max(raw, 0), 100))
    }
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', () => el.removeEventListener('pointermove', onMove), { once: true })
  }

  const activeZone = LANDING_ZONES.find(z => geomDefault >= z.start && geomDefault <= z.end)

  return (
    <div className="glyph-groups">
      <div className="gg-sticky-header">
        {/* Zone preview words aligned to zone left edges */}
        {!hidePreviewWords && <div className="gg-preview-row">
          <div style={{ width: LABELS_WIDTH, flexShrink: 0 }} />
          <div className="gg-preview-track" style={{ height: previewSize * 1.2 * 4 + 6 }}>
            {LANDING_ZONES.map(z => (
              <div key={z.label}
                className="gg-preview-group"
                style={{
                  left: `${z.start}%`,
                  opacity: activeZone ? (activeZone.label === z.label ? 1 : 0.3) : 1,
                }}
              >
                {PREVIEW_WORDS.map(word => (
                  <p key={word} className="gg-preview-word" style={{
                    fontSize: `${previewSize}pt`,
                    fontVariationSettings: varSettingsForGeom(z.mid),
                  }}>
                    {word}
                  </p>
                ))}
              </div>
            ))}
          </div>
        </div>}

        {/* Ruler with zone bars + GEOM handle */}
        <div className="gg-ruler-row">
        <div className="gg-labels">
          <span className="gg-geom-axis-label">GEOM</span>
        </div>
        <div className="gg-ruler-track" ref={rulerRef}>
          <ZoneBg />
          {/* Landing zone color bars */}
          {LANDING_ZONES.map(z => (
            <div key={z.label}
              className={`gg-zone-bar${activeZone?.label === z.label ? ' active' : ''}`}
              style={{ left: `${z.start}%`, width: `${z.end - z.start}%`, '--zone-color': z.color } as React.CSSProperties}
              onClick={() => onGeomChange(z.mid)}
            />
          ))}
          {/* Tick marks */}
          {RULER_TICKS.map(m => (
            <span key={m} className="gg-tick" style={{ left: `${m}%` }}>{m}</span>
          ))}
          {/* Active zone label */}
          {activeZone && (
            <span className="gg-active-zone-label" style={{ left: `${(activeZone.start + activeZone.end) / 2}%`, color: activeZone.color }}>
              {activeZone.label}
            </span>
          )}
          {/* Draggable GEOM default handle */}
          <div className="gg-geom-handle" style={{ left: `${geomDefault}%` }} onPointerDown={startGeomDrag}>
            <div className="gg-geom-tooltip">{Math.round(geomDefault)}</div>
            <div className="gg-geom-circle">
              <span className="gg-arrow">‹</span>
              <div className="gg-geom-dot" />
              <span className="gg-arrow">›</span>
            </div>
          </div>
        </div>
        </div>
      </div>

      {/* Glyph rows with shared vertical marker line */}
      <div className="gg-rows" style={{ '--labels-w': `${LABELS_WIDTH}px` } as React.CSSProperties}>
        <div className="gg-marker-layer" aria-hidden>
          <div className="gg-marker-line" style={{ left: `${geomDefault}%` }} />
        </div>
        {GROUP_DEFS.map(def => (
          <GlyphRow key={def.glyph} def={def}
            thresholds={thresholds[def.glyph] ?? [...def.defaultThresholds]}
            geomDefault={geomDefault}
            otherDefaults={defaults}
            opszDefault={opszDefault}
            onChange={(t) => onThresholdChange(def.glyph, t)}
            onDragStart={onThresholdDragStart}
          />
        ))}
      </div>
    </div>
  )
}
