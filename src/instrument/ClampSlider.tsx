// One axis, clamped: the track slider for the ◆ default with a grabber at each end of the
// clamp and a wash over what lies outside. The primitive keeps the grip, the number field,
// the keyboard and the touch logic; the store keeps the ◆ inside the clamp (clampMath.ts),
// so the slider gets the full axis and its grip is never mispositioned against it.
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import { AxisSlider } from '../../shared/index'
import { useInstrument } from './InstrumentProvider'
import { AXIS_RANGES, effectiveAxes, effectiveLimits } from './store'
// The clamp readout (clampshow/): while a grabber is held, the new limit shows beside it.
import { BandBubble } from './clampshow/Bubble'
import type { BandView, Show } from './clampshow/types'

type Side = 'lo' | 'hi'
const clamp01 = (n: number) => Math.max(0, Math.min(1, n))

export function ClampSlider({ tag, label, nudge = 1, big = 5 }: { tag: string; label: string; nudge?: number; big?: number }) {
  const { state, dispatch } = useInstrument()
  const d = state.defaults
  const { min, max } = AXIS_RANGES[tag]
  const [lo, hi] = effectiveLimits(d, tag)
  const frozen = d.frozenAxes.includes(tag)
  const pct = (v: number) => `${((v - min) / (max - min)) * 100}%`
  const wrapRef = useRef<HTMLDivElement>(null)
  // dx: where in the grabber the pointer landed, so a grab does not jump the edge to the pointer.
  const drag = useRef<{ side: Side; rect: DOMRect; dx: number; pushed: boolean } | null>(null)
  const [held, setHeld] = useState<Side | null>(null)

  // The clamp readout: the side being shown (held or nudged), fading once let go.
  const [show, setShow] = useState<(Show & { band: Side }) | null>(null)
  const [box, setBox] = useState({ W: 0, H: 0 })
  const showTimer = useRef<number>()
  const fadeShow = () => {
    window.clearTimeout(showTimer.current)
    setShow(s => (s ? { ...s, fading: true } : s))
    showTimer.current = window.setTimeout(() => setShow(null), 240)
  }
  const flashShow = (side: Side, hold: number) => {
    window.clearTimeout(showTimer.current)
    setShow({ kind: 'edge', band: side, fading: false })
    if (hold) showTimer.current = window.setTimeout(fadeShow, hold)
  }
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setBox({ W: el.clientWidth, H: el.clientHeight }))
    ro.observe(el)
    return () => { ro.disconnect(); window.clearTimeout(showTimer.current) }
  }, [])
  const W = box.W
  // opsz reads in the exported font's units: the worker relabels the axis by the Optical scale
  // (stock 8–45 at 2× ships as 16–90), so every number on this bar is stock × m. The store
  // keeps stock units; one slider step is one stock unit.
  const m = tag === 'opsz' ? d.opszMultiplier : 1
  const band: BandView = { W, H: box.H, tag, min, max, lim: [lo, hi], mult: m, axes: effectiveAxes(state) }

  const step = (e: ReactPointerEvent) => {
    const g = drag.current
    if (!g) return
    if (!g.pushed) { dispatch({ type: 'pushHistory' }); g.pushed = true }
    const v = Math.round(min + clamp01((e.clientX - g.dx - g.rect.left) / g.rect.width) * (max - min))
    dispatch({ type: 'setLimit', tag, side: g.side, value: v })
  }
  const end = () => { if (drag.current) fadeShow(); drag.current = null; setHeld(null) }   // fadeShow: clamp-show
  const grab = (side: Side) => (e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0) return
    e.stopPropagation(); e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    const rect = wrapRef.current!.getBoundingClientRect()
    const edgeX = rect.left + rect.width * (((side === 'lo' ? lo : hi) - min) / (max - min))
    drag.current = { side, rect, dx: e.clientX - edgeX, pushed: false }
    setHeld(side)
    flashShow(side, 0)   // clamp-show
  }
  const onKey = (side: Side) => (e: ReactKeyboardEvent<HTMLElement>) => {
    const dir = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0
    if (!dir) return
    dispatch({ type: 'pushHistory' })
    dispatch({ type: 'setLimit', tag, side, value: (side === 'lo' ? lo : hi) + dir * (e.shiftKey ? big : nudge) })
    flashShow(side, 700)   // clamp-show: a nudge shows the value briefly
    e.preventDefault()
  }
  const grabber = (side: Side) => (
    <div className={`clamp-slider-grab clamp-slider-grab--${side}`}
      role="slider" tabIndex={0} aria-label={`${tag} ${side === 'lo' ? 'minimum' : 'maximum'}`}
      aria-valuemin={min * m} aria-valuemax={max * m} aria-valuenow={(side === 'lo' ? lo : hi) * m}
      data-held={held === side ? '' : undefined}
      onPointerDown={grab(side)} onPointerMove={e => { if (drag.current) step(e) }}
      onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end} onKeyDown={onKey(side)} />
  )

  return (
    <div ref={wrapRef} className="clamp-slider" data-held={held ?? undefined}
      style={{ '--lo': pct(lo), '--hi': pct(hi) } as CSSProperties}>
      <AxisSlider
        label={label} tag={tag} value={d.axes[tag] * m} min={min * m} max={max * m} step={m}
        variant="track" reference={state.shipped[tag] * m} disabled={frozen}
        onChange={v => dispatch({ type: 'setDefaultAxis', tag, value: Math.round((v as number) / m) })} />
      <div className="clamp-slider-dim clamp-slider-dim--lo" aria-hidden="true" />
      <div className="clamp-slider-dim clamp-slider-dim--hi" aria-hidden="true" />
      {!frozen && grabber('lo')}
      {!frozen && grabber('hi')}
      {W > 0 && show && <BandBubble b={band} side={show.band} show={show} />}
    </div>
  )
}
