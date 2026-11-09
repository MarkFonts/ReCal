// REVIEW-ONLY (clamp-show) — option B: the axis numbers themselves become the clamp. While a
// y edge is held the pad's 400 / 700 slide off their corners onto the frame's edges and read
// the limits; while an x edge is held the same knocked-out numbers stand on the plot's floor
// at the frame's sides (GEOM ones carry the zone name, in its colour). The number that is
// changing is acid, its partner stays dim. The readout pill's range lights the same number.
// On release they fade and the corner numbers come back.
import { useLayoutEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { chipColor } from '../geomAxis'
import { moving } from './types'
import type { BandView, PadView, Show } from './types'
import { Tag } from './Tag'

/** Is this Show moving the pad's y limits (so the static corner numbers step aside)? */
export const yLabelsLive = (show: Show | null, yFrozen: boolean) => {
  const m = moving(show)
  return !!show && !show.fading && !yFrozen && (m.ylo || m.yhi)
}
/** …and its x limits (so the status line gives the gutter to the x numbers). */
export const xLabelsLive = (show: Show | null, xFrozen: boolean) => {
  const m = moving(show)
  return !!show && !show.fading && !xFrozen && (m.xlo || m.xhi)
}

export function PadLabels({ v, show }: { v: PadView; show: Show | null }) {
  const m = moving(show)
  const on = !!show && !show.fading
  const yOn = on && !v.y.frozen && (m.ylo || m.yhi)
  const xOn = on && !v.x.frozen && (m.xlo || m.xhi)
  const refs = useRef<(HTMLSpanElement | null)[]>([])
  // Place the four numbers in px: y ones centred on their edge (the high one lifted if the two
  // would touch); x ones exactly in the status line's box (bottom 5px, its type; the status steps aside),
  // centred under their edge, kept inside the pad and pushed apart if they meet.
  useLayoutEffect(() => {
    const [yl, yh, xl, xh] = refs.current
    if (!yl || !yh || !xl || !xh) return
    const loTop = v.py(v.y.lim[0]) - 6
    const hiTop = Math.min(v.py(v.y.lim[1]) - 6, loTop - 12)
    yl.style.top = `${loTop}px`; yh.style.top = `${hiTop}px`
    const wl = xl.offsetWidth, wh = xh.offsetWidth
    let cl = Math.max(wl / 2 + 2, Math.min(v.W - wl / 2 - 2, v.px(v.x.lim[0])))
    let ch = Math.max(wh / 2 + 2, Math.min(v.W - wh / 2 - 2, v.px(v.x.lim[1])))
    const gap = (ch - wh / 2) - (cl + wl / 2) - 6
    if (gap < 0) { cl += gap / 2; ch -= gap / 2 }
    for (const [el, c] of [[xl, cl], [xh, ch]] as const) { el.style.left = `${c}px`; el.style.top = '' }   // vertical: the status line's box, in CSS
  })
  const xNum = (val: number) => v.zone
    ? <><span style={{ color: chipColor(v.zone(val)) }}>{v.zone(val)}</span> {val}</>
    : <>{val}</>
  const lab = (i: number, live: boolean, lit: boolean, axis: 'x' | 'y', body: ReactNode) => (
    <span key={i} ref={el => { refs.current[i] = el }} aria-hidden="true"
      className={`shape-pad-ylab geom-num tnum clampshow-lab clampshow-lab--${axis}`}
      data-off={live ? undefined : ''} data-lit={lit ? '' : undefined}>{body}</span>
  )
  return <>
    {lab(0, yOn, m.ylo, 'y', v.y.lim[0])}
    {lab(1, yOn, m.yhi, 'y', v.y.lim[1])}
    {lab(2, xOn, m.xlo, 'x', xNum(v.x.lim[0]))}
    {lab(3, xOn, m.xhi, 'x', xNum(v.x.lim[1]))}
  </>
}

/** The readout's "400–519", with the moving number lit while held (it fades with the drag). */
export function LitRange({ l, lo, hi, on }: { l: [number, number]; lo: boolean; hi: boolean; on: boolean }) {
  return <>
    <span className="clampshow-lit" data-lit={on && lo ? '' : undefined}>{l[0]}</span>–
    <span className="clampshow-lit" data-lit={on && hi ? '' : undefined}>{l[1]}</span>
  </>
}

/** The band: the same numbers under the bar, one at each grabber, the moving one acid. They
 *  read in the slider's own units (its ◆ field is stock opsz) plus px under the Optical scale. */
export function BandLabels({ b, side, on }: { b: BandView; side: 'lo' | 'hi'; on: boolean }) {
  const x = (v: number, s: 'lo' | 'hi') => b.W * ((v - b.min) / (b.max - b.min)) + (s === 'lo' ? 8 : -8)
  return <>{(['lo', 'hi'] as const).map(s => {
    const v = b.lim[s === 'lo' ? 0 : 1]
    return (
      <Tag key={s} x={x(v, s)} y={b.H} place="below" W={b.W} H={0} clampY={false}
        className="geom-num tnum clampshow-lab clampshow-lab--band" data-off={on ? undefined : ''} data-lit={s === side ? '' : undefined}>
        {v}{b.mult > 1 && <span className="clampshow-lab-px"> · {v * b.mult}px</span>}
      </Tag>
    )
  })}</>
}
