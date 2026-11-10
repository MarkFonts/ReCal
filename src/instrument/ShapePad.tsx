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
import { AXIS_RANGES, effectiveAxes, effectiveLimits } from './store'
// The clamp readout (clampshow/): while an edge, corner or the frame is held, the new limits show.
import { PadBubble } from './clampshow/Bubble'
import type { PadView, Show } from './clampshow/types'
import { LANDING_ZONES } from '../GlyphGroups'
import { GEOM_INSET, axisFromClientX, axisLeft, chipColor, geomLeft, geomSpan, zoneBandBackground } from './geomAxis'

// Inset of the plotted area inside the pad, in px. CSS reads the top one as a custom
// property (--pad-top) so the knob, dots and pointer math can't drift apart.
const PAD_X = GEOM_INSET
const PAD_BOT = 24   // room for the status line under the lattice
const COLS = 17      // dot lattice: x every 1/16 of the axis (GEOM every 6.25)
const COL_PAD = 3    // horizontal padding of a column label (the pill when active)
const ROWS = 4       // dot lattice: y every 1/3 of the axis (weight every 100)
const BAND_H = 44    // the plot's height once one axis is frozen: a band, the live axis across

const clamp01 = (n: number) => Math.max(0, Math.min(1, n))

// The zone a GEOM value lies in, or none: the zones leave gaps (10–15, 30–40, 60–80), and a value
// in a gap belongs to no zone, so nothing lights and nothing is named.
export const zoneAt = (geom: number) => LANDING_ZONES.find(z => geom >= z.start && geom <= z.end)?.label

// An axis on a pad: the tag, and the keyboard step (⇧ = the big one).
interface PadAxis { tag: string; nudge: number; big: number }

// What a pointer is holding: the knob (set the ◆), one clamp edge (set a limit, pushing the ◆
// if it must), or the frame (slide the whole clamp, the ◆ rides inside). One undo grain each.
type Side = 'left' | 'right' | 'top' | 'bottom' | 'tl' | 'tr' | 'bl' | 'br'   // the last four: a corner, both axes at once (clampshow/types.ts repeats it)
type Drag = { kind: 'knob' | 'edge' | 'box'; side?: Side; pushed: boolean; x0: number; y0: number; rect: DOMRect; lx: [number, number]; ly: [number, number] }
const STATUS_IDLE = 'Drag edges to clamp axes'

function Pad({ x, y, top, height, ariaLabel, xLabel, yLabel, yAuto, knobZone, onDragState, bands, cols, bandLabel = true, aside }: {
  x: PadAxis; y: PadAxis
  top: number; height: number       // plot inset above the lattice (room for column labels), pad height
  ariaLabel: string
  xLabel: string; yLabel: string    // readout captions
  yAuto?: boolean                   // vertical locked: the knob only slides across, readout says "auto"
  knobZone?: string
  onDragState?: (dragging: boolean) => void
  bands?: ReactNode; cols?: ReactNode
  bandLabel?: boolean               // the frozen value at the band's top right (default on)
  aside?: ReactNode                 // a gutter right of the pad, past the axis maximum
}) {
  const { state, dispatch } = useInstrument()
  const xv = state.defaults.axes[x.tag]
  const yv = state.defaults.axes[y.tag]
  const { min: xMin, max: xMax } = AXIS_RANGES[x.tag]
  const { min: yMin, max: yMax } = AXIS_RANGES[y.tag]
  const lx = effectiveLimits(state.defaults, x.tag)
  const ly = effectiveLimits(state.defaults, y.tag)
  const fx = state.defaults.frozenAxes.includes(x.tag)
  const fy = state.defaults.frozenAxes.includes(y.tag) || !!yAuto
  // One axis frozen: the pad shrinks to a band along the live one (the wrappers swap the axes
  // so the live one is x), and the frozen value sits at the side where the range was.
  // Both frozen: the whole grid stays, greyed.
  const band = fy && !fx
  const dead = fx && fy
  const padH = band ? top + BAND_H + PAD_BOT : height
  const padRef = useRef<HTMLDivElement>(null)
  const [held, setHeld] = useState<Drag | null>(null)   // mirrors drag.current for the paint

  // The clamp readout: what the dragged limit becomes. `show` is the edge / corner /
  // frame being shown (held, or a keyboard nudge), `fading` once let go; it clears 240ms
  // later, the matrix bubble's fade. `size` is the pad in px, for the layers' placement.
  const [show, setShow] = useState<Show | null>(null)
  const [size, setSize] = useState<{ W: number; H: number } | null>(null)
  const showTimer = useRef<number>()
  const fadeShow = () => {
    window.clearTimeout(showTimer.current)
    setShow(s => (s ? { ...s, fading: true } : s))
    showTimer.current = window.setTimeout(() => setShow(null), 240)
  }
  const flashShow = (kind: Show['kind'], side: Side | undefined, hold: number) => {
    window.clearTimeout(showTimer.current)
    setShow({ kind, side, fading: false })
    if (hold) showTimer.current = window.setTimeout(fadeShow, hold)
  }
  useEffect(() => {
    const el = padRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ W: el.clientWidth, H: el.clientHeight }))
    ro.observe(el)
    return () => { ro.disconnect(); window.clearTimeout(showTimer.current) }
  }, [])

  const setX = (v: number) => dispatch({ type: 'setDefaultAxis', tag: x.tag, value: v })
  const setY = (v: number) => dispatch({ type: 'setDefaultAxis', tag: y.tag, value: v })

  const plotH = (r: DOMRect) => r.height - top - PAD_BOT
  const xFrom = (clientX: number, r: DOMRect) => Math.round(axisFromClientX(clientX, r, xMin, xMax))
  const yFrom = (clientY: number, r: DOMRect) => Math.round(yMax - clamp01((clientY - r.top - top) / plotH(r)) * (yMax - yMin))

  const drag = useRef<Drag | null>(null)
  const pushOnce = () => { if (drag.current && !drag.current.pushed) { dispatch({ type: 'pushHistory' }); drag.current.pushed = true } }
  const step = (e: ReactPointerEvent) => {
    const d = drag.current
    if (!d) return
    const r = d.rect
    if (d.kind === 'knob') {
      const px = fx ? xv : xFrom(e.clientX, r)
      const py = fy ? yv : yFrom(e.clientY, r)
      if (px === xv && py === yv) return
      pushOnce()
      if (px !== xv) setX(px)
      if (py !== yv) setY(py)
    } else if (d.kind === 'edge') {
      pushOnce()
      if (d.side!.length === 2) {   // corner: x and y edges together
        if (!fx) dispatch({ type: 'setLimit', tag: x.tag, side: d.side![1] === 'l' ? 'lo' : 'hi', value: xFrom(e.clientX, r) })
        if (!fy) dispatch({ type: 'setLimit', tag: y.tag, side: d.side![0] === 'b' ? 'lo' : 'hi', value: yFrom(e.clientY, r) })
      } else if (d.side === 'left' || d.side === 'right')
        dispatch({ type: 'setLimit', tag: x.tag, side: d.side === 'left' ? 'lo' : 'hi', value: xFrom(e.clientX, r) })
      else
        dispatch({ type: 'setLimit', tag: y.tag, side: d.side === 'bottom' ? 'lo' : 'hi', value: yFrom(e.clientY, r) })
    } else {
      pushOnce()
      if (!fx) dispatch({ type: 'slideLimits', tag: x.tag, lo: Math.round(d.lx[0] + (e.clientX - d.x0) / (r.width - 2 * PAD_X) * (xMax - xMin)) })
      if (!fy) dispatch({ type: 'slideLimits', tag: y.tag, lo: Math.round(d.ly[0] - (e.clientY - d.y0) / plotH(r) * (yMax - yMin)) })
    }
  }
  const end = () => {
    if (!drag.current) return
    const was = drag.current.kind
    drag.current = null
    setHeld(null)
    if (was !== 'knob') fadeShow()   // clamp-show
    if (was !== 'edge') onDragState?.(false)
  }
  // Each handle captures its own pointer; the pad root is the knob's handle (tap anywhere to
  // place the ◆, as before). The rect is taken once at grab so the mapping can't drift mid-drag.
  const grab = (kind: Drag['kind'], side?: Side) => (e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0) return
    if (fx && fy) return
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    const d: Drag = { kind, side, pushed: false, x0: e.clientX, y0: e.clientY, rect: padRef.current!.getBoundingClientRect(), lx, ly }
    drag.current = d
    setHeld(d)
    if (kind !== 'edge') onDragState?.(true)
    if (kind !== 'knob') flashShow(kind, side, 0)   // clamp-show
    step(e)
  }
  const handle = (kind: Drag['kind'], side?: Side) => ({
    onPointerDown: grab(kind, side),
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => { if (drag.current) step(e) },
    onPointerUp: end, onPointerCancel: end, onLostPointerCapture: end,
  })

  // Keyboard: ←/→ nudge x, ↑/↓ nudge y (⇧ = the big step). Like the pins, keyboard changes
  // don't set geomDragging, so swaps read as instant one-shot flashes. ↑/↓ do nothing while
  // y is locked. On a grabber the same keys move that edge.
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const big = e.shiftKey
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      if (fx) return
      const d = (e.key === 'ArrowRight' ? 1 : -1) * (big ? x.big : x.nudge)
      setX(Math.max(xMin, Math.min(xMax, xv + d)))
    } else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !fy) {
      const d = (e.key === 'ArrowUp' ? 1 : -1) * (big ? y.big : y.nudge)
      setY(Math.max(yMin, Math.min(yMax, yv + d)))
    } else return
    e.preventDefault()
  }
  const onEdgeKey = (side: Side) => (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const horiz = side === 'left' || side === 'right'
    const a = horiz ? x : y, lim = horiz ? lx : ly
    const k = e.key
    const dir = k === 'ArrowRight' || k === 'ArrowUp' ? 1 : k === 'ArrowLeft' || k === 'ArrowDown' ? -1 : 0
    if (!dir) return
    const lo = side === 'left' || side === 'bottom'
    dispatch({ type: 'pushHistory' })
    dispatch({ type: 'setLimit', tag: a.tag, side: lo ? 'lo' : 'hi', value: lim[lo ? 0 : 1] + dir * (e.shiftKey ? a.big : a.nudge) })
    flashShow('edge', side, 700)   // clamp-show: a nudge shows the value briefly
    e.preventDefault(); e.stopPropagation()
  }

  const yMid = `calc(${top}px + (100% - ${top + PAD_BOT}px) / 2)`
  const yTop = (v: number) => band ? yMid : `calc(${top}px + (100% - ${top + PAD_BOT}px) * ${1 - (v - yMin) / (yMax - yMin)})`
  const xSpan = (a: number, b: number) => `calc((100% - ${2 * PAD_X}px) * ${(b - a) / (xMax - xMin)})`
  const ySpan = (a: number, b: number) => `calc((100% - ${top + PAD_BOT}px) * ${(b - a) / (yMax - yMin)})`
  const ylab = `shape-pad-ylab geom-num tnum${fy ? ' shape-pad-ylab--off' : ''}`
  // the frame: the clamp, or the whole plot along a frozen axis (a frozen axis has no range to show)
  const bx: [number, number] = fx ? [xMin, xMax] : lx
  const by: [number, number] = fy ? [yMin, yMax] : ly
  const box: CSSProperties = {
    left: axisLeft(bx[0], xMin, xMax), width: xSpan(bx[0], bx[1]),
    top: band ? `${top}px` : yTop(by[1]), height: band ? `calc(100% - ${top + PAD_BOT}px)` : ySpan(by[0], by[1]),
  }
  const tag = (a: PadAxis) => a.tag.toUpperCase()
  const status = dead ? `${tag(x)} frozen at default`
    : !held ? STATUS_IDLE
    : held.kind === 'knob' ? 'Setting the default'
    : held.kind === 'box' ? 'Moving the range'
    : held.side!.length === 2 ? `Clamping ${tag(x)} ${held.side![1] === 'r' ? 'max' : 'min'} · ${tag(y)} ${held.side![0] === 't' ? 'max' : 'min'}`
    : `Clamping ${held.side === 'left' || held.side === 'right' ? tag(x) : tag(y)} ${held.side === 'right' || held.side === 'top' ? 'max' : 'min'}`
  const lim = (a: PadAxis, l: [number, number], frozen: boolean) => {
    const r = AXIS_RANGES[a.tag]
    return frozen ? 'froze' : l[0] === r.min && l[1] === r.max ? null : `${l[0]}–${l[1]}`
  }
  const limX = lim(x, lx, fx), limY = yAuto ? null : lim(y, ly, fy)
  // The readout captions alternate name ↔ range/froze once a second while either has one
  // (one interval, so both swap in step); still under reduced motion.
  const [alt, setAlt] = useState(false)
  const swapping = !!(limX || limY)
  useEffect(() => {
    if (!swapping || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setAlt(false); return }
    const id = window.setInterval(() => setAlt(a => !a), 1000)
    return () => window.clearInterval(id)
  }, [swapping])

  // The clamp readout layer.
  const plotTopPx = top, plotBotPx = size ? size.H - PAD_BOT : 0
  const view: PadView | null = size && {
    W: size.W, H: size.H, plotTop: plotTopPx, plotBottom: plotBotPx,
    px: v => PAD_X + (size.W - 2 * PAD_X) * ((v - xMin) / (xMax - xMin)),
    py: v => band ? (plotTopPx + plotBotPx) / 2 : plotTopPx + (plotBotPx - plotTopPx) * (1 - (v - yMin) / (yMax - yMin)),
    x: { tag: x.tag, min: xMin, max: xMax, lim: lx, value: xv, frozen: fx },
    y: { tag: y.tag, min: yMin, max: yMax, lim: ly, value: yv, frozen: fy },
    zone: x.tag === 'GEOM' ? zoneAt : undefined,
    axes: effectiveAxes(state),
  }
  const showLayer = view && show ? <PadBubble v={view} show={show} /> : null
  const dotMid = size ? `${((size.H - top - PAD_BOT) / 2) / (size.H - top - 9) * 100}%` : '50%'

  const grabber = (side: Side) => {
    const horiz = side === 'top' || side === 'bottom'
    const pos: CSSProperties = horiz
      ? { left: axisLeft((lx[0] + lx[1]) / 2, xMin, xMax), top: yTop(side === 'top' ? ly[1] : ly[0]) }
      : { left: axisLeft(side === 'left' ? lx[0] : lx[1], xMin, xMax), top: yTop((ly[0] + ly[1]) / 2) }
    const v = horiz ? ly[side === 'top' ? 1 : 0] : lx[side === 'left' ? 0 : 1]
    const a = horiz ? y : x
    return (
      <div key={side} className={`shape-pad-grab shape-pad-grab--${horiz ? 'h' : 'v'}`} style={pos}
        role="slider" tabIndex={0} aria-label={`${a.tag} ${side === 'right' || side === 'top' ? 'maximum' : 'minimum'}`}
        aria-valuemin={AXIS_RANGES[a.tag].min} aria-valuemax={AXIS_RANGES[a.tag].max} aria-valuenow={v}
        data-held={held?.kind === 'edge' && held.side === side ? '' : undefined}
        onKeyDown={onEdgeKey(side)} {...handle('edge', side)} />
    )
  }

  const corner = (side: 'tl' | 'tr' | 'bl' | 'br') => (
    <div key={side} className={`shape-pad-grab shape-pad-grab--c shape-pad-grab--${side}`}
      style={{ left: axisLeft(side[1] === 'l' ? lx[0] : lx[1], xMin, xMax), top: yTop(side[0] === 't' ? ly[1] : ly[0]) }}
      aria-hidden="true" data-held={held?.kind === 'edge' && held.side === side ? '' : undefined}
      {...handle('edge', side)} />
  )

  return (
    <>
     <div className="shape-pad-row">
      <div ref={padRef} className="shape-pad" tabIndex={0} role="group"
        style={{ '--pad-h': `${padH}px`, '--pad-top': `${top}px` } as CSSProperties}
        aria-label={`${ariaLabel}. Arrow keys nudge.`}
        aria-disabled={dead || undefined}
        data-held={held?.kind}
        {...handle('knob')}
        onKeyDown={onKeyDown}>
        {bands}
        <svg className="shape-pad-dots" aria-hidden="true">
          {Array.from({ length: (band ? 1 : ROWS) * COLS }, (_, i) => (
            <circle key={i} cx={`${(i % COLS) / (COLS - 1) * 100}%`} cy={band ? dotMid : `${Math.floor(i / COLS) / (ROWS - 1) * 100}%`} r="1" />
          ))}
        </svg>
        {cols}
        {/* outside the clamp the pad goes under a wash: the range is the lit part */}
        <div className="shape-pad-dim" style={{ left: 0, width: axisLeft(bx[0], xMin, xMax), top: 0, bottom: 0 }} />
        <div className="shape-pad-dim" style={{ left: axisLeft(bx[1], xMin, xMax), right: 0, top: 0, bottom: 0 }} />
        {!band && <div className="shape-pad-dim" style={{ left: box.left, width: box.width, top: 0, height: box.top }} />}
        {!band && <div className="shape-pad-dim" style={{ left: box.left, width: box.width, top: yTop(by[0]), bottom: 0 }} />}
        {band
          ? bandLabel && <span className={ylab} style={{ top: top - 6 }} aria-hidden="true">{yAuto ? 'auto' : Math.round(yv)}</span>   /* where the max sat: clear of the right grabber */
          : <>
              <span className={ylab} style={{ top: top - 6 }} aria-hidden="true">{yMax}</span>
              <span className={ylab} style={{ bottom: PAD_BOT - 3 }} aria-hidden="true">{yMin}</span>
            </>}
        {/* the clamp: a frame you can drag by its edge; its visual twin underneath takes no pointer */}
        <div className="shape-pad-box" style={box} aria-hidden="true" />
        {!dead && <div className="shape-pad-frame" style={box} {...handle('box')} />}
        {!fx && grabber('left')}
        {!fx && grabber('right')}
        {!fy && grabber('top')}
        {!fy && grabber('bottom')}
        {!fx && !fy && (['tl', 'tr', 'bl', 'br'] as const).map(corner)}
        {/* the knob takes its own pointer, last in the stack: where it sits on the clamp frame or a grabber, the knob wins */}
        <div className="shape-pad-knob" data-zone={knobZone} style={{ left: axisLeft(xv, xMin, xMax), top: yTop(yv) }} {...(dead ? {} : handle('knob'))} />
        {showLayer}
        <span className="shape-pad-status" aria-live="polite">{status}</span>
      </div>
      {aside}
     </div>
      <div className="shape-readout">
        <div data-frozen={fx || undefined}><span>{alt && limX ? <em className="shape-readout-alt tnum">{limX}</em> : xLabel}</span><span className="tnum">{Math.round(xv)}</span></div>
        <div data-frozen={fy && !yAuto || undefined}><span>{alt && limY ? <em className="shape-readout-alt tnum">{limY}</em> : yLabel}</span><span className="tnum">{yAuto ? 'auto' : Math.round(yv)}</span></div>
      </div>
    </>
  )
}

// Column labels sit centered on their band, clamped so none crosses the plot's inner edge.
// Widths are measured (the glyphs are variable and the font loads late), so positions are px.
function ZoneCols({ active, lim }: { active?: string; lim: [number, number] }) {
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
          data-out={z.label !== active && (z.mid < lim[0] || z.mid > lim[1]) ? '' : undefined}
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

// GEOM frozen: its zone's column turns sideways. The strip runs along the band, and the "Cal"
// heading sits in a gutter right of the pad, past the weight maximum. Frozen in a gap between
// zones: the gutter stays, empty.
function ZoneAside({ zone, top }: { zone?: string; top: number }) {
  const z = LANDING_ZONES.find(z => z.label === zone)
  return (
    <div className="shape-pad-aside" style={{ paddingTop: top + BAND_H / 2 - 11 }} aria-hidden="true">
      {z && (
        <span className="shape-pad-col on" data-zone={zone}
          style={{ fontVariationSettings: `'GEOM' ${z.sampleGeom}, 'wght' ${AXIS_RANGES.wght.min}, 'opsz' 8.2`, letterSpacing: '0.03em', color: 'var(--bg)' }}>Cal</span>
      )}
    </div>
  )
}

// Row 1: GEOM across, weight up, with the four zones as bands and "Cal" columns.
const GEOM_AXIS: PadAxis = { tag: 'GEOM', nudge: 1, big: 10 }
const WGHT_AXIS: PadAxis = { tag: 'wght', nudge: 10, big: 50 }
const SHRP_AXIS: PadAxis = { tag: 'SHRP', nudge: 1, big: 10 }
const YTAS_AXIS: PadAxis = { tag: 'YTAS', nudge: 10, big: 50 }

export function ShapePad() {
  const { state, dispatch } = useInstrument()
  const geom = state.defaults.axes.GEOM
  const wght = state.defaults.axes.wght
  const active = zoneAt(geom)
  const frozen = (tag: string) => state.defaults.frozenAxes.includes(tag)
  // GEOM frozen, weight live: weight goes across; the frozen zone keeps a strip and heading at the right
  const swap = frozen('GEOM') && !frozen('wght')
  const geomLabel = active ? `GEOM ${active}` : 'GEOM'   // a gap between zones names none
  return (
    <Pad
      x={swap ? WGHT_AXIS : GEOM_AXIS} y={swap ? GEOM_AXIS : WGHT_AXIS}
      top={swap ? 12 : 42} height={213} bandLabel={!swap}
      aside={swap ? <ZoneAside zone={active} top={12} /> : undefined}
      ariaLabel={`Shape: GEOM ${Math.round(geom)}, weight ${Math.round(wght)}`}
      xLabel={swap ? 'Weight' : geomLabel} yLabel={swap ? geomLabel : 'Weight'}
      knobZone={active}
      onDragState={value => dispatch({ type: 'setGeomDragging', value })}
      bands={swap ? active && <div className="shape-pad-band" style={{ left: 0, right: 0, top: 12, bottom: PAD_BOT, background: zoneBandBackground(active) }} /> : LANDING_ZONES.map(z => (
        <div key={z.label} className="shape-pad-band"
          style={{
            left: geomLeft(z.start), width: geomSpan(z.start, z.end),
            background: zoneBandBackground(z.label),
          }} />
      ))}
      cols={swap ? undefined : <ZoneCols active={active} lim={effectiveLimits(state.defaults, 'GEOM')} />} />
  )
}

// Row 3: Sharpness across, Ascender up. SHRP has no zones, so the pad is bare. With Auto
// ascender on, YTAS follows the optical size, so the vertical locks and the pad is a band.
// Sharpness frozen with the ascender live: the ascender goes across instead.
export function AscenderPad() {
  const { state } = useInstrument()
  const { SHRP, YTAS } = state.defaults.axes
  const auto = state.defaults.autoAscender
  const frozen = (tag: string) => state.defaults.frozenAxes.includes(tag)
  const swap = frozen('SHRP') && !auto && !frozen('YTAS')
  return (
    <Pad
      x={swap ? YTAS_AXIS : SHRP_AXIS} y={swap ? SHRP_AXIS : YTAS_AXIS}
      top={12} height={165}
      ariaLabel={`Ascender and Sharpness: Sharpness ${Math.round(SHRP)}, ascender ${auto ? 'auto' : Math.round(YTAS)}`}
      xLabel={swap ? 'Ascender' : 'Sharpness'} yLabel={swap ? 'Sharpness' : 'Ascender'} yAuto={auto && !swap} />
  )
}
