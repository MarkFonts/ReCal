// Shape pad — GEOM (horizontal) × weight (vertical) in one drag. Replaces the old
// Geometric-form chips + GEOM and Weight pins; it dispatches the same actions they did.
//
// The swap flashes depend on `geomDragging` exactly as the GEOM pin's drag set it: true on
// grab, false on release, so a swapping glyph holds its zone color while you drag and fades
// when you let go (useGeomFlash in scenes.tsx; the Freezer gold reads the same flag).
// Column labels are GLYPHS, not zone names: "Cal" set at each zone's sample GEOM.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import { useInstrument } from './InstrumentProvider'
import { AXIS_RANGES } from './store'
import { LANDING_ZONES } from '../GlyphGroups'
import { GEOM_INSET, chipColor, geomFromClientX, geomLeft, geomSpan, zoneBandBackground } from './geomAxis'

// Inset of the plotted area inside the pad, in px. CSS reads them as custom properties so
// the knob, dots and pointer math can't drift apart.
const PAD_X = GEOM_INSET
const PAD_TOP = 42
const PAD_BOT = 9
const COLS = 17      // dot lattice: GEOM every 6.25
const COL_PAD = 4    // horizontal padding of a column label (the pill when active)
const ROWS = 4       // dot lattice: weight every 100

const clamp01 = (n: number) => Math.max(0, Math.min(1, n))

export const nearestZone = (geom: number) =>
  LANDING_ZONES.reduce((best, z) => (Math.abs(z.mid - geom) < Math.abs(best.mid - geom) ? z : best)).label

export function ShapePad() {
  const { state, dispatch } = useInstrument()
  const geom = state.defaults.axes.GEOM
  const wght = state.defaults.axes.wght
  const { min: wMin, max: wMax } = AXIS_RANGES.wght
  const { min: gMin, max: gMax } = AXIS_RANGES.GEOM
  const padRef = useRef<HTMLDivElement>(null)
  // Column labels sit centered on their band, clamped so none crosses the plot's inner edge.
  // Widths are measured (the glyphs are variable and the font loads late), so positions are px.
  const colRefs = useRef<(HTMLSpanElement | null)[]>([])
  const [colX, setColX] = useState<number[] | null>(null)
  const measureCols = () => {
    const pad = padRef.current
    if (!pad) return
    const plotW = pad.clientWidth - 2 * PAD_X
    const next = LANDING_ZONES.map((z, i) => {
      const el = colRefs.current[i]
      const w = Math.max(0, (el?.offsetWidth ?? 0) - 2 * COL_PAD)   // the word, not its pill
      const c = PAD_X + plotW * (((z.start + z.end) / 2 - gMin) / (gMax - gMin))
      return Math.max(PAD_X + w / 2, Math.min(pad.clientWidth - PAD_X - w / 2, c))
    })
    setColX(prev => (prev && prev.length === next.length && prev.every((v, i) => Math.abs(v - next[i]) < 0.25) ? prev : next))
  }
  useLayoutEffect(measureCols)
  useEffect(() => {
    const pad = padRef.current
    if (!pad) return
    const ro = new ResizeObserver(measureCols)
    ro.observe(pad)
    colRefs.current.forEach(el => el && ro.observe(el))
    document.fonts?.ready.then(measureCols)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setGeom = (v: number) => dispatch({ type: 'setDefaultAxis', tag: 'GEOM', value: v })
  const setWght = (v: number) => dispatch({ type: 'setDefaultAxis', tag: 'wght', value: v })

  const fromPointer = (e: { clientX: number; clientY: number }) => {
    const r = padRef.current!.getBoundingClientRect()
    const y = clamp01((e.clientY - r.top - PAD_TOP) / (r.height - PAD_TOP - PAD_BOT))
    return { g: Math.round(geomFromClientX(e.clientX, r)), w: Math.round(wMax - y * (wMax - wMin)) }
  }

  // Grab: one undo grain per drag (like a matrix drag), snapshotted on the first real move.
  const drag = useRef<{ pushed: boolean } | null>(null)
  const apply = (e: ReactPointerEvent) => {
    const { g, w } = fromPointer(e)
    if (g === geom && w === wght) return
    if (drag.current && !drag.current.pushed) { dispatch({ type: 'pushHistory' }); drag.current.pushed = true }
    if (g !== geom) setGeom(g)
    if (w !== wght) setWght(w)
  }
  const end = () => {
    if (!drag.current) return
    drag.current = null
    dispatch({ type: 'setGeomDragging', value: false })
  }
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { pushed: false }
    dispatch({ type: 'setGeomDragging', value: true })
    apply(e)
  }

  // Keyboard: ←/→ nudge GEOM by 1, ↑/↓ nudge weight by 10 (⇧ = 10× / 5×). Like the pins,
  // keyboard changes don't set geomDragging, so swaps read as instant one-shot flashes.
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const big = e.shiftKey
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const d = (e.key === 'ArrowRight' ? 1 : -1) * (big ? 10 : 1)
      setGeom(Math.max(gMin, Math.min(gMax, geom + d)))
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const d = (e.key === 'ArrowUp' ? 1 : -1) * (big ? 50 : 10)
      setWght(Math.max(wMin, Math.min(wMax, wght + d)))
    } else return
    e.preventDefault()
  }

  const gPct = geomLeft
  const active = nearestZone(geom)
  const wPct = (w: number) => `calc(${PAD_TOP}px + (100% - ${PAD_TOP + PAD_BOT}px) * ${1 - (w - wMin) / (wMax - wMin)})`

  return (
    <>
      <div ref={padRef} className="shape-pad" tabIndex={0} role="group"
        aria-label={`Shape: GEOM ${Math.round(geom)}, weight ${Math.round(wght)}. Arrow keys nudge.`}
        onPointerDown={onPointerDown}
        onPointerMove={e => { if (drag.current) apply(e) }}
        onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end}
        onKeyDown={onKeyDown}>
        {LANDING_ZONES.map(z => (
          <div key={z.label} className="shape-pad-band"
            style={{
              left: gPct(z.start), width: geomSpan(z.start, z.end),
              background: zoneBandBackground(z.label),
            }} />
        ))}
        <svg className="shape-pad-dots" aria-hidden="true">
          {Array.from({ length: ROWS * COLS }, (_, i) => (
            <circle key={i} cx={`${(i % COLS) / (COLS - 1) * 100}%`} cy={`${Math.floor(i / COLS) / (ROWS - 1) * 100}%`} r="1" />
          ))}
        </svg>
        <div className="shape-pad-cols" aria-hidden="true">
          {LANDING_ZONES.map((z, i) => (
            <span key={z.label} className={`shape-pad-col${z.label === active ? ' on' : ''}`}
              data-zone={z.label}
              ref={el => { colRefs.current[i] = el }}
              style={{
                fontVariationSettings: `'GEOM' ${z.sampleGeom}, 'wght' ${wMin}, 'opsz' 8.2`,
                letterSpacing: '0.03em',
                color: z.label === active ? 'var(--bg)' : chipColor(z.label),
                left: colX ? colX[i] : gPct((z.start + z.end) / 2),
                transform: 'translateX(calc(-50% + 0.015em))',
                visibility: colX ? 'visible' : 'hidden',
              }}>Cal</span>
          ))}
        </div>
        <span className="shape-pad-ylab geom-num tnum" style={{ top: PAD_TOP - 6 }} aria-hidden="true">{wMax}</span>
        <span className="shape-pad-ylab geom-num tnum" style={{ bottom: PAD_BOT - 3 }} aria-hidden="true">{wMin}</span>
        <div className="shape-pad-knob" data-zone={active} style={{ left: gPct(geom), top: wPct(wght) }} />
      </div>
      <div className="shape-readout">
        <div><span>GEOM {nearestZone(geom)}</span><span className="tnum">{Math.round(geom)}</span></div>
        <div><span>Weight</span><span className="tnum">{Math.round(wght)}</span></div>
      </div>
    </>
  )
}
