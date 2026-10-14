// GEOM swap editor — the type matrix, ported into the instrument rail with instrument
// tokens. One horizontal lane per glyph group; every variant is rendered as its own
// glyph, sitting in the GEOM band where it's active, over a zone-colored bar (the
// palette / Rosetta-Stone principle — the colors only mean something next to the
// shapes they name). Variant glyphs use the unmodified CalSansVF at each variant's
// natural GEOM, so their forms stay distinct regardless of the user's thresholds.
// Drag a boundary to move a swap → dispatch setThresholds → Shell's rebuild effect
// regenerates the CalSansPreview face. ⌘Z routes through the store's history.
import { useLayoutEffect, useRef, useState } from 'react'
import { GROUP_DEFS, LANDING_ZONES } from '../GlyphGroups'
import { geomFromClientX, geomLeft, geomPx, geomSpan, zoneBandBackground } from './geomAxis'
import { useInstrument } from './InstrumentProvider'
import { effectiveAxes } from './store'
import { renderVarSettings } from './render'

type Drag = { glyph: string; idx: number; value: number }

// GEOM value at which each variant's form is shown (its zone's natural sample point).
const NATURAL_GEOM: Record<string, number> = { A11Y: 3, UI: 22, default: 25, Base: 50, Geo: 90 }

export function Matrix() {
  const { state, dispatch } = useInstrument()
  const thresholds = state.defaults.glyphThresholds
  const geom = state.defaults.axes.GEOM
  const axes = effectiveAxes(state)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [geomDragging, setGeomDragging] = useState(false)
  const [fading, setFading] = useState<{ key: string; value: number } | null>(null)
  const laneRefs = useRef<Record<string, HTMLDivElement | null>>({})
  // The value chip lingers ~240ms after release, fading down toward the dial it came from.
  const fade = (key: string, value: number) => {
    setFading({ key, value })
    setTimeout(() => setFading(f => (f && f.key === key ? null : f)), 240)
  }

  const startDrag = (glyph: string, idx: number, e: React.PointerEvent) => {
    e.preventDefault()
    const lane = laneRefs.current[glyph]
    if (!lane) return
    const rect = lane.getBoundingClientRect()
    const cur = thresholds[glyph] ?? []
    const clampAt = (clientX: number) => {
      const v = Math.round(geomFromClientX(clientX, rect))
      const lo = idx > 0 ? cur[idx - 1] + 1 : 0
      const hi = idx < cur.length - 1 ? cur[idx + 1] - 1 : 100
      return Math.max(lo, Math.min(hi, v))
    }
    let pushed = false
    const move = (ev: PointerEvent) => {
      if (!pushed) { dispatch({ type: 'pushHistory' }); pushed = true }
      const value = clampAt(ev.clientX)
      setDrag({ glyph, idx, value })
      dispatch({ type: 'setThresholdDrag', drag: { glyph, idx, value } })   // the specimen colors the glyph from the live value
    }
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      if (pushed) {   // only commit / snapshot / fade if the drag actually moved
        const val = clampAt(ev.clientX)
        const next = [...cur]; next[idx] = val
        dispatch({ type: 'setThresholds', thresholds: { ...thresholds, [glyph]: next } })
        fade(`${glyph}:${idx}`, val)
      }
      setDrag(null)
      dispatch({ type: 'setThresholdDrag', drag: null })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  // The continuous GEOM-default line is itself a scrubber: drag it to set the default.
  const rowsRef = useRef<HTMLDivElement | null>(null)
  const startGeomDrag = (e: React.PointerEvent) => {
    e.preventDefault()
    const rows = rowsRef.current
    if (!rows) return
    const rect = rows.getBoundingClientRect()
    setGeomDragging(true)
    dispatch({ type: 'setGeomDragging', value: true })   // the line + its tag go HDR white while held, as on the pad
    let pushed = false, last = geom
    const move = (ev: PointerEvent) => {
      if (!pushed) { dispatch({ type: 'pushHistory' }); pushed = true }
      last = Math.round(geomFromClientX(ev.clientX, rect))
      dispatch({ type: 'setDefaultAxis', tag: 'GEOM', value: last })
    }
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up)
      setGeomDragging(false)
      dispatch({ type: 'setGeomDragging', value: false })
      if (pushed) fade('geom', last)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  // "Default NN" sits in the 0/50/100 row with its NUMBER centered on the bar's x, clamped to
  // the matrix edges, and covers whatever tick it lands on.
  const axisRef = useRef<HTMLDivElement | null>(null)
  const tagRef = useRef<HTMLSpanElement | null>(null)
  const numRef = useRef<HTMLSpanElement | null>(null)
  const [tagLeft, setTagLeft] = useState<number | null>(null)
  useLayoutEffect(() => {
    const place = () => {
      const axis = axisRef.current, tag = tagRef.current, num = numRef.current
      if (!axis || !tag || !num) return
      const w = axis.clientWidth
      const want = geomPx(geom, w) - (num.offsetLeft + num.offsetWidth / 2)
      const next = Math.max(0, Math.min(w - tag.offsetWidth, want))
      setTagLeft(prev => (prev !== null && Math.abs(prev - next) < 0.25 ? prev : next))
      // A tick the tag touches goes under it entirely, never half-covered.
      axis.querySelectorAll<HTMLElement>('.matrix-axis-tick').forEach(t => {
        const c = geomPx(Number(t.dataset.v), w), half = t.offsetWidth / 2
        t.style.visibility = c + half > next && c - half < next + tag.offsetWidth ? 'hidden' : ''
      })
    }
    place()
    const ro = new ResizeObserver(place)
    if (axisRef.current) ro.observe(axisRef.current)
    document.fonts?.ready.then(place)
    return () => ro.disconnect()
  }, [geom])

  const glyphStyle = (label: string) => ({
    fontFamily: "'CalSansVF', sans-serif",
    fontVariationSettings: renderVarSettings({ ...axes, GEOM: NATURAL_GEOM[label] ?? 25 }, { opszOverride: 14 }),
    fontFeatureSettings: label === 'default' ? "'rclt' 0" : "'rclt' 1",
    fontOpticalSizing: 'none' as const,
  })


  return (
    <div className="matrix">
      <div className="matrix-axis" ref={axisRef}>
        {[0, 50, 100].map(v => (
          <span key={v} className="matrix-axis-tick geom-num tnum" data-v={v} style={{ left: geomLeft(v) }}>{v}</span>
        ))}
        <span ref={tagRef} className={`matrix-default-tag geom-num${state.geomDragging ? ' is-dragging' : ''}`}
          style={{ left: tagLeft ?? 0, visibility: tagLeft === null ? 'hidden' : 'visible' }}>
          Default <span ref={numRef} className="tnum">{Math.round(geom)}</span>
        </span>
      </div>
      <div className="matrix-rows" ref={rowsRef}>
        {LANDING_ZONES.map(z => (
          <div key={z.label} className="matrix-zone"
            style={{ left: geomLeft(z.start), width: geomSpan(z.start, z.end), background: zoneBandBackground(z.label) }} />
        ))}
        {GROUP_DEFS.map(def => {
          const base = thresholds[def.glyph] ?? def.defaultThresholds
          const shown = drag && drag.glyph === def.glyph
            ? base.map((v, i) => (i === drag.idx ? drag.value : v))
            : base
          const bounds = [0, ...shown, 100]
          // Half-open bands [b, next) so a value lands in exactly one — except the last,
          // which has to include its own upper bound. Without that, geom === 100 matched no
          // band, findIndex returned -1, and EVERY lane rendered inactive: at 99 the rows
          // lit up, at 100 the whole editor looked switched off.
          const activeIdx = bounds.findIndex((b, i) =>
            i < bounds.length - 1 && geom >= b && (i === bounds.length - 2 ? geom <= bounds[i + 1] : geom < bounds[i + 1]))
          return (
            <div className="matrix-lane" key={def.glyph} ref={el => { laneRefs.current[def.glyph] = el }}>
              {(state.shippedThresholds[def.glyph] ?? []).map((v, i) => (
                <div key={`s${i}`} className="matrix-shipped" style={{ left: geomLeft(v) }}
                  title={`Cal Sans default · GEOM ${v}`} />
              ))}
              {def.variants.map((variant, vi) => {
                const a = bounds[vi], b = bounds[vi + 1], mid = (a + b) / 2
                const on = vi === activeIdx
                return (
                  <div key={vi}>
                    <div className={`matrix-band${on ? ' on' : ''}`}
                      data-zone={variant.label}
                      /* No inline background while ON: the HDR swatch is in CSS, and an
                         inline colour would win over it and flatten the band to SDR. */
                      style={on
                        ? { left: geomLeft(a), width: geomSpan(a, b) }
                        : { left: geomLeft(a), width: geomSpan(a, b), background: variant.color }} />
                    <span className={`matrix-vglyph${on ? ' on' : ''}`}
                      style={{ left: geomLeft(mid), ...glyphStyle(variant.label) }}
                      title={`${variant.label} · GEOM ${a}–${b}`}>{def.glyph}</span>
                  </div>
                )
              })}
              {shown.map((v, i) => (
                <div key={`h${i}`} className="matrix-handle" style={{ left: geomLeft(v) }}
                  onPointerDown={e => startDrag(def.glyph, i, e)} title={`your swap · GEOM ${v}`} />
              ))}
              {drag && drag.glyph === def.glyph && (
                <span className="matrix-val matrix-val--in tnum" style={{ left: geomLeft(drag.value) }}>{drag.value}</span>
              )}
              {fading && fading.key.startsWith(`${def.glyph}:`) && (
                <span className="matrix-val matrix-val--out tnum" style={{ left: geomLeft(fading.value) }}>{fading.value}</span>
              )}
            </div>
          )
        })}
        {/* the default: a line through every lane, ringed like the pad's knob */}
        <div className={`matrix-default${state.geomDragging ? ' is-dragging' : ''}`} style={{ left: geomLeft(geom) }} />
        <div className="matrix-geom" style={{ left: geomLeft(geom) }} onPointerDown={startGeomDrag} />
        {geomDragging && (
          <span className="matrix-val matrix-val--in matrix-val--geom tnum" style={{ left: geomLeft(geom) }}>{geom}</span>
        )}
        {fading && fading.key === 'geom' && (
          <span className="matrix-val matrix-val--out matrix-val--geom tnum" style={{ left: geomLeft(fading.value) }}>{fading.value}</span>
        )}
      </div>

      <p className="matrix-note">
        Every variant sits in the GEOM band where it’s active. Drag a boundary to move a swap;
        the line marks your default (<span className="tnum">{geom}</span>).
      </p>
    </div>
  )
}
