import { useRef } from 'react'

type VariantLabel = 'A11Y' | 'UI' | 'default' | 'Text' | 'Geo'
type Variant = { label: VariantLabel; color: string }

export type GroupDef = {
  glyph: string
  variants: Variant[]
  defaultThresholds: number[]
}

const V: Record<VariantLabel, Variant> = {
  A11Y:    { label: 'A11Y',    color: '#c97050' },
  UI:      { label: 'UI',      color: '#999' },
  default: { label: 'default', color: '#666' },
  Text:    { label: 'Text',    color: '#4a7fd4' },
  Geo:     { label: 'Geo',     color: '#4aad5c' },
}

export const GROUP_DEFS: GroupDef[] = [
  { glyph: 'I', variants: [V.A11Y, V.default], defaultThresholds: [5] },
  { glyph: 'l', variants: [V.A11Y, V.default], defaultThresholds: [11] },
  { glyph: 'a', variants: [V.A11Y, V.default, V.Text], defaultThresholds: [14, 35] },
  { glyph: 'G', variants: [V.UI, V.default], defaultThresholds: [41] },
  { glyph: 'g', variants: [V.A11Y, V.default], defaultThresholds: [16] },
  { glyph: 'f', variants: [V.default, V.Text], defaultThresholds: [40] },
  { glyph: 'j', variants: [V.default, V.Text, V.Geo], defaultThresholds: [40, 76] },
  { glyph: 't', variants: [V.default, V.Text, V.Geo], defaultThresholds: [40, 76] },
  { glyph: 'y', variants: [V.default, V.Text, V.Geo], defaultThresholds: [40, 61] },
  { glyph: 'u', variants: [V.default, V.Geo], defaultThresholds: [60] },
  { glyph: 'C', variants: [V.default, V.Geo], defaultThresholds: [79] },
  { glyph: 'c', variants: [V.default, V.Geo], defaultThresholds: [79] },
  { glyph: 'M', variants: [V.default, V.Geo], defaultThresholds: [79] },
]

export const LANDING_ZONES = [
  { label: 'A11Y', start: 0,  end: 10,  mid: 5,  color: '#c97050' },
  { label: 'UI',   start: 15, end: 30,  mid: 22, color: '#999' },
  { label: 'Text', start: 40, end: 60,  mid: 50, color: '#4a7fd4' },
  { label: 'Geo',  start: 80, end: 100, mid: 90, color: '#4aad5c' },
]

const HATCH = 'repeating-linear-gradient(-45deg, rgba(140,120,0,0.07) 0px, rgba(140,120,0,0.07) 1px, transparent 1px, transparent 10px)'

const ZONE_BG = [
  { start: 0,  end: 10,  bg: 'rgba(201,112,80,0.06)' },
  { start: 10, end: 15,  bg: HATCH },
  { start: 15, end: 30,  bg: 'rgba(160,160,160,0.04)' },
  { start: 30, end: 40,  bg: HATCH },
  { start: 40, end: 60,  bg: 'rgba(74,127,212,0.05)' },
  { start: 60, end: 80,  bg: HATCH },
  { start: 80, end: 100, bg: 'rgba(74,173,92,0.05)' },
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
            <span key={v.label}
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
            <div key={v.label}
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

export const PREVIEW_WORDS = ["I\u2019ll jag", 'Guy', 'Mact', '2160'] as const

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
                    fontSize: previewSize,
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
