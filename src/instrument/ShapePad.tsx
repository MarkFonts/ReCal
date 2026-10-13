// Shape pad — GEOM (horizontal) × weight (vertical) in one drag. Replaces the old
// Geometric-form chips + GEOM and Weight pins; it dispatches the same actions they did.
//
// The swap flashes depend on `geomDragging` exactly as the GEOM pin's drag set it: true on
// grab, false on release, so a swapping glyph holds its zone color while you drag and fades
// when you let go (useGeomFlash in scenes.tsx; the Freezer gold reads the same flag).
// Column labels are GLYPHS, not zone names: "ay" set at each zone's sample GEOM.
import { useRef } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import { useInstrument } from './InstrumentProvider'
import { AXIS_RANGES } from './store'
import { LANDING_ZONES } from '../GlyphGroups'
import { ZONE_CHIP_COLOR } from '../zoneColors'

// Inset of the plotted area inside the pad, in px. CSS reads them as custom properties so
// the knob, dots and pointer math can't drift apart.
const PAD_X = 9
const PAD_TOP = 42
const PAD_BOT = 9
const COLS = 17      // dot lattice: GEOM every 6.25
const ROWS = 4       // dot lattice: weight every 100

const chipColor = (label: string) =>
  ZONE_CHIP_COLOR[(label === 'A11Y' ? 'A11y' : label) as keyof typeof ZONE_CHIP_COLOR]

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

  const setGeom = (v: number) => dispatch({ type: 'setDefaultAxis', tag: 'GEOM', value: v })
  const setWght = (v: number) => dispatch({ type: 'setDefaultAxis', tag: 'wght', value: v })

  const fromPointer = (e: { clientX: number; clientY: number }) => {
    const r = padRef.current!.getBoundingClientRect()
    const x = clamp01((e.clientX - r.left - PAD_X) / (r.width - 2 * PAD_X))
    const y = clamp01((e.clientY - r.top - PAD_TOP) / (r.height - PAD_TOP - PAD_BOT))
    return { g: Math.round(gMin + x * (gMax - gMin)), w: Math.round(wMax - y * (wMax - wMin)) }
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

  const gPct = (g: number) => `calc(${PAD_X}px + (100% - ${2 * PAD_X}px) * ${(g - gMin) / (gMax - gMin)})`
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
              left: gPct(z.start), width: `calc((100% - ${2 * PAD_X}px) * ${(z.end - z.start) / (gMax - gMin)})`,
              background: `color-mix(in srgb, ${chipColor(z.label)} 7%, transparent)`,
            }} />
        ))}
        <svg className="shape-pad-dots" aria-hidden="true">
          {Array.from({ length: ROWS * COLS }, (_, i) => (
            <circle key={i} cx={`${(i % COLS) / (COLS - 1) * 100}%`} cy={`${Math.floor(i / COLS) / (ROWS - 1) * 100}%`} r="1" />
          ))}
        </svg>
        <div className="shape-pad-cols" aria-hidden="true">
          {LANDING_ZONES.map((z, i) => (
            <span key={z.label} className="shape-pad-col"
              style={{
                fontVariationSettings: `'GEOM' ${z.sampleGeom}, 'wght' ${wMin}, 'opsz' 8`,
                color: chipColor(z.label),
                // First label sits inside the left edge, last inside the right edge.
                ...(i === 0 ? { left: PAD_X + 3, transform: 'none' }
                  : i === LANDING_ZONES.length - 1 ? { left: 'auto', right: PAD_X + 3, transform: 'none' }
                  : { left: gPct(z.sampleGeom) }),
              }}>ay</span>
          ))}
        </div>
        <span className="shape-pad-ylab" style={{ top: PAD_TOP - 6 }} aria-hidden="true">{wMax}</span>
        <span className="shape-pad-ylab" style={{ bottom: PAD_BOT - 3 }} aria-hidden="true">{wMin}</span>
        <div className="shape-pad-knob" style={{ left: gPct(geom), top: wPct(wght) }} />
      </div>
      <div className="shape-readout">
        <div><span>GEOM {nearestZone(geom)}</span><span className="tnum">{Math.round(geom)}</span></div>
        <div><span>Weight</span><span className="tnum">{Math.round(wght)}</span></div>
      </div>
    </>
  )
}
