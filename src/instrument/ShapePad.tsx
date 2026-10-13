// Two-axis pads. `Pad` is the shared 2D control: x across, y up, one drag, a dot lattice, a
// knob, two readouts under it. Row 1's Shape pad (GEOM × weight, with zone bands and column
// labels) and row 3's Ascender & Sharpness pad (SHRP × YTAS, bare) are both configs of it.
//
// Shape replaces the old Geometric-form chips + GEOM and Weight pins and dispatches the same
// actions they did. Its swap flashes depend on `geomDragging` exactly as the GEOM pin's drag
// set it: true on grab, false on release, so a swapping glyph holds its zone color while you
// drag and fades when you let go (useGeomFlash in scenes.tsx; the Freezer gold reads the same
// flag). Only the Shape pad sets it (`onDragState`).
// Column labels are GLYPHS, not zone names: "Cal" set at each zone's sample GEOM.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { useInstrument } from './InstrumentProvider'
import { AXIS_RANGES } from './store'
import { LANDING_ZONES } from '../GlyphGroups'
import { GEOM_INSET, axisFromClientX, axisLeft, chipColor, geomLeft, geomSpan, zoneBandBackground } from './geomAxis'

// Inset of the plotted area inside the pad, in px. CSS reads the top one as a custom
// property (--pad-top) so the knob, dots and pointer math can't drift apart.
const PAD_X = GEOM_INSET
const PAD_BOT = 9
const COLS = 17      // dot lattice: x every 1/16 of the axis (GEOM every 6.25)
const COL_PAD = 4    // horizontal padding of a column label (the pill when active)
const ROWS = 4       // dot lattice: y every 1/3 of the axis (weight every 100)

const clamp01 = (n: number) => Math.max(0, Math.min(1, n))

export const nearestZone = (geom: number) =>
  LANDING_ZONES.reduce((best, z) => (Math.abs(z.mid - geom) < Math.abs(best.mid - geom) ? z : best)).label

// An axis on a pad: the tag, and the keyboard step (⇧ = the big one).
interface PadAxis { tag: string; nudge: number; big: number }

function Pad({ x, y, top, height, ariaLabel, xLabel, yLabel, yAuto, knobZone, onDragState, bands, cols }: {
  x: PadAxis; y: PadAxis
  top: number; height: number       // plot inset above the lattice (room for column labels), pad height
  ariaLabel: string
  xLabel: string; yLabel: string    // readout captions
  yAuto?: boolean                   // vertical locked: the knob only slides across, readout says "auto"
  knobZone?: string
  onDragState?: (dragging: boolean) => void
  bands?: ReactNode; cols?: ReactNode
}) {
  const { state, dispatch } = useInstrument()
  const xv = state.defaults.axes[x.tag]
  const yv = state.defaults.axes[y.tag]
  const { min: xMin, max: xMax } = AXIS_RANGES[x.tag]
  const { min: yMin, max: yMax } = AXIS_RANGES[y.tag]
  const padRef = useRef<HTMLDivElement>(null)

  const setX = (v: number) => dispatch({ type: 'setDefaultAxis', tag: x.tag, value: v })
  const setY = (v: number) => dispatch({ type: 'setDefaultAxis', tag: y.tag, value: v })

  const fromPointer = (e: { clientX: number; clientY: number }) => {
    const r = padRef.current!.getBoundingClientRect()
    const t = clamp01((e.clientY - r.top - top) / (r.height - top - PAD_BOT))
    return {
      px: Math.round(axisFromClientX(e.clientX, r, xMin, xMax)),
      py: yAuto ? yv : Math.round(yMax - t * (yMax - yMin)),
    }
  }

  // Grab: one undo grain per drag (like a matrix drag), snapshotted on the first real move.
  const drag = useRef<{ pushed: boolean } | null>(null)
  const apply = (e: ReactPointerEvent) => {
    const { px, py } = fromPointer(e)
    if (px === xv && py === yv) return
    if (drag.current && !drag.current.pushed) { dispatch({ type: 'pushHistory' }); drag.current.pushed = true }
    if (px !== xv) setX(px)
    if (py !== yv) setY(py)
  }
  const end = () => {
    if (!drag.current) return
    drag.current = null
    onDragState?.(false)
  }
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { pushed: false }
    onDragState?.(true)
    apply(e)
  }

  // Keyboard: ←/→ nudge x, ↑/↓ nudge y (⇧ = the big step). Like the pins, keyboard changes
  // don't set geomDragging, so swaps read as instant one-shot flashes. ↑/↓ do nothing while
  // y is locked.
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const big = e.shiftKey
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const d = (e.key === 'ArrowRight' ? 1 : -1) * (big ? x.big : x.nudge)
      setX(Math.max(xMin, Math.min(xMax, xv + d)))
    } else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !yAuto) {
      const d = (e.key === 'ArrowUp' ? 1 : -1) * (big ? y.big : y.nudge)
      setY(Math.max(yMin, Math.min(yMax, yv + d)))
    } else return
    e.preventDefault()
  }

  const yTop = (v: number) => `calc(${top}px + (100% - ${top + PAD_BOT}px) * ${1 - (v - yMin) / (yMax - yMin)})`
  const ylab = `shape-pad-ylab geom-num tnum${yAuto ? ' shape-pad-ylab--off' : ''}`

  return (
    <>
      <div ref={padRef} className="shape-pad" tabIndex={0} role="group"
        style={{ height, '--pad-top': `${top}px` } as CSSProperties}
        aria-label={`${ariaLabel}. Arrow keys nudge.`}
        onPointerDown={onPointerDown}
        onPointerMove={e => { if (drag.current) apply(e) }}
        onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end}
        onKeyDown={onKeyDown}>
        {bands}
        <svg className="shape-pad-dots" aria-hidden="true">
          {Array.from({ length: ROWS * COLS }, (_, i) => (
            <circle key={i} cx={`${(i % COLS) / (COLS - 1) * 100}%`} cy={`${Math.floor(i / COLS) / (ROWS - 1) * 100}%`} r="1" />
          ))}
        </svg>
        {cols}
        <span className={ylab} style={{ top: top - 6 }} aria-hidden="true">{yMax}</span>
        <span className={ylab} style={{ bottom: PAD_BOT - 3 }} aria-hidden="true">{yMin}</span>
        <div className="shape-pad-knob" data-zone={knobZone} style={{ left: axisLeft(xv, xMin, xMax), top: yTop(yv) }} />
      </div>
      <div className="shape-readout">
        <div><span>{xLabel}</span><span className="tnum">{Math.round(xv)}</span></div>
        <div><span>{yLabel}</span><span className="tnum">{yAuto ? 'auto' : Math.round(yv)}</span></div>
      </div>
    </>
  )
}

// Column labels sit centered on their band, clamped so none crosses the plot's inner edge.
// Widths are measured (the glyphs are variable and the font loads late), so positions are px.
function ZoneCols({ active }: { active: string }) {
  const { min: gMin, max: gMax } = AXIS_RANGES.GEOM
  const { min: wMin } = AXIS_RANGES.wght
  const colsRef = useRef<HTMLDivElement>(null)
  const colRefs = useRef<(HTMLSpanElement | null)[]>([])
  const [colX, setColX] = useState<number[] | null>(null)
  const measureCols = () => {
    const pad = colsRef.current?.parentElement
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
    const pad = colsRef.current?.parentElement
    if (!pad) return
    const ro = new ResizeObserver(measureCols)
    ro.observe(pad)
    colRefs.current.forEach(el => el && ro.observe(el))
    document.fonts?.ready.then(measureCols)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div ref={colsRef} className="shape-pad-cols" aria-hidden="true">
      {LANDING_ZONES.map((z, i) => (
        <span key={z.label} className={`shape-pad-col${z.label === active ? ' on' : ''}`}
          data-zone={z.label}
          ref={el => { colRefs.current[i] = el }}
          style={{
            fontVariationSettings: `'GEOM' ${z.sampleGeom}, 'wght' ${wMin}, 'opsz' 8.2`,
            letterSpacing: '0.03em',
            color: z.label === active ? 'var(--bg)' : chipColor(z.label),
            left: colX ? colX[i] : geomLeft((z.start + z.end) / 2),
            transform: 'translateX(calc(-50% + 0.015em))',
            visibility: colX ? 'visible' : 'hidden',
          }}>Cal</span>
      ))}
    </div>
  )
}

// Row 1: GEOM across, weight up, with the four zones as bands and "Cal" columns.
export function ShapePad() {
  const { state, dispatch } = useInstrument()
  const geom = state.defaults.axes.GEOM
  const wght = state.defaults.axes.wght
  const active = nearestZone(geom)
  return (
    <Pad
      x={{ tag: 'GEOM', nudge: 1, big: 10 }} y={{ tag: 'wght', nudge: 10, big: 50 }}
      top={42} height={198}
      ariaLabel={`Shape: GEOM ${Math.round(geom)}, weight ${Math.round(wght)}`}
      xLabel={`GEOM ${active}`} yLabel="Weight"
      knobZone={active}
      onDragState={value => dispatch({ type: 'setGeomDragging', value })}
      bands={LANDING_ZONES.map(z => (
        <div key={z.label} className="shape-pad-band"
          style={{
            left: geomLeft(z.start), width: geomSpan(z.start, z.end),
            background: zoneBandBackground(z.label),
          }} />
      ))}
      cols={<ZoneCols active={active} />} />
  )
}

// Row 3: Sharpness across, Ascender up. SHRP has no zones, so the pad is bare. With Auto
// ascender on, YTAS follows the optical size, so the vertical locks.
export function AscenderPad() {
  const { state } = useInstrument()
  const { SHRP, YTAS } = state.defaults.axes
  const auto = state.defaults.autoAscender
  return (
    <Pad
      x={{ tag: 'SHRP', nudge: 1, big: 10 }} y={{ tag: 'YTAS', nudge: 10, big: 50 }}
      top={12} height={150}
      ariaLabel={`Ascender and Sharpness: Sharpness ${Math.round(SHRP)}, ascender ${auto ? 'auto' : Math.round(YTAS)}`}
      xLabel="Sharpness" yLabel="Ascender" yAuto={auto} />
  )
}
