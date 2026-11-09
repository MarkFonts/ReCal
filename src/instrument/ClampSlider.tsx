// One axis, clamped: the track slider for the ◆ default with a grabber at each end of the
// clamp and a wash over what lies outside. The primitive keeps the grip, the number field,
// the keyboard and the touch logic; the store keeps the ◆ inside the clamp (clampMath.ts),
// so the slider gets the full axis and its grip is never mispositioned against it.
import { useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import { AxisSlider } from '../../shared/index'
import { useInstrument } from './InstrumentProvider'
import { AXIS_RANGES, effectiveLimits } from './store'

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

  const step = (e: ReactPointerEvent) => {
    const g = drag.current
    if (!g) return
    if (!g.pushed) { dispatch({ type: 'pushHistory' }); g.pushed = true }
    const v = Math.round(min + clamp01((e.clientX - g.dx - g.rect.left) / g.rect.width) * (max - min))
    dispatch({ type: 'setLimit', tag, side: g.side, value: v })
  }
  const end = () => { drag.current = null; setHeld(null) }
  const grab = (side: Side) => (e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0) return
    e.stopPropagation(); e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    const rect = wrapRef.current!.getBoundingClientRect()
    const edgeX = rect.left + rect.width * (((side === 'lo' ? lo : hi) - min) / (max - min))
    drag.current = { side, rect, dx: e.clientX - edgeX, pushed: false }
    setHeld(side)
  }
  const onKey = (side: Side) => (e: ReactKeyboardEvent<HTMLElement>) => {
    const dir = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0
    if (!dir) return
    dispatch({ type: 'pushHistory' })
    dispatch({ type: 'setLimit', tag, side, value: (side === 'lo' ? lo : hi) + dir * (e.shiftKey ? big : nudge) })
    e.preventDefault()
  }
  const grabber = (side: Side) => (
    <div className={`clamp-slider-grab clamp-slider-grab--${side}`}
      role="slider" tabIndex={0} aria-label={`${tag} ${side === 'lo' ? 'minimum' : 'maximum'}`}
      aria-valuemin={min} aria-valuemax={max} aria-valuenow={side === 'lo' ? lo : hi}
      data-held={held === side ? '' : undefined}
      onPointerDown={grab(side)} onPointerMove={e => { if (drag.current) step(e) }}
      onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end} onKeyDown={onKey(side)} />
  )

  return (
    <div ref={wrapRef} className="clamp-slider" data-held={held ?? undefined}
      style={{ '--lo': pct(lo), '--hi': pct(hi) } as CSSProperties}>
      <AxisSlider
        label={label} tag={tag} value={d.axes[tag]} min={min} max={max} step={1}
        variant="track" reference={state.shipped[tag]} disabled={frozen}
        onChange={v => dispatch({ type: 'setDefaultAxis', tag, value: v as number })} />
      <div className="clamp-slider-dim clamp-slider-dim--lo" aria-hidden="true" />
      <div className="clamp-slider-dim clamp-slider-dim--hi" aria-hidden="true" />
      {!frozen && grabber('lo')}
      {!frozen && grabber('hi')}
    </div>
  )
}
