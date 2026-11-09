// REVIEW-ONLY (clamp-show) — option C: show what the limit BECOMES. A chip by the dragged edge
// carries "Cal" set at the limit (the rest of the axes at their defaults) over a caption that
// names it: the zone and its GEOM number in the zone's colour, or "wght 519". A corner's chip
// is the corner instance itself (both limits at once); a frame slide shows the two far
// corners, the lightest-most-humanist and the heaviest-most-geometric the range now allows.
// Same placement and in/out motion as the matrix bubble; the chip is the bubble with a glyph.
import type { CSSProperties } from 'react'
import { OpszValue, Tag } from './Tag'
import type { Place } from './Tag'
import { renderVarSettings } from '../render'
import { chipColor } from '../geomAxis'
import { moving } from './types'
import type { BandView, PadView, Show } from './types'
import type { AxisMap } from '../store'

const cls = (s: Show) => `clampshow-chip ${s.fading ? 'matrix-val--out' : 'matrix-val--in'}`
// The stock face, as the Type Matrix samples it: its own GEOM swaps, opsz pinned at 14.
const calStyle = (axes: AxisMap, opsz = 14): CSSProperties => ({
  fontFamily: "'CalSansVF', sans-serif",
  fontVariationSettings: renderVarSettings(axes, { opszOverride: opsz }),
  fontOpticalSizing: 'none',
})

export function PadSample({ v, show }: { v: PadView; show: Show }) {
  const m = moving(show)
  const { x, y } = v
  const name = (tag: string, val: number) => tag === 'GEOM' && v.zone
    ? <span key={tag}><span style={{ color: chipColor(v.zone(val)) }}>{v.zone(val)}</span> <span className="tnum">{val}</span></span>
    : <span key={tag}><span className="clampshow-val-tag">{tag}</span><span className="tnum">{val}</span></span>
  const chips: { k: string; ax: number; ay: number; place: Place; axes: AxisMap; cap: JSX.Element[] }[] = []
  const corner = (k: string, xi: 0 | 1, yi: 0 | 1, place: Place) => {
    const axes = { ...v.axes }, cap: JSX.Element[] = []
    if (!x.frozen) { axes[x.tag] = x.lim[xi]; cap.push(name(x.tag, x.lim[xi])) }
    if (!y.frozen) { axes[y.tag] = y.lim[yi]; cap.push(name(y.tag, y.lim[yi])) }
    chips.push({ k, ax: v.px(x.lim[xi]), ay: v.py(y.lim[yi]), place, axes, cap })
  }
  if (show.kind === 'box') { corner('bl', 0, 0, 'below'); corner('tr', 1, 1, 'above') }
  else if (show.side && show.side.length === 2) corner(show.side, m.xlo ? 0 : 1, m.ylo ? 0 : 1, show.side[0] === 't' ? 'above' : 'below')
  else if (m.xlo || m.xhi) {
    const val = x.lim[m.xlo ? 0 : 1]
    chips.push({ k: 'x', ax: v.px(val), ay: v.py((y.lim[0] + y.lim[1]) / 2) - 14, place: 'above', axes: { ...v.axes, [x.tag]: val }, cap: [name(x.tag, val)] })
  } else {
    const val = y.lim[m.ylo ? 0 : 1]
    chips.push({ k: 'y', ax: v.px((x.lim[0] + x.lim[1]) / 2) + 14, ay: v.py(val), place: 'right', axes: { ...v.axes, [y.tag]: val }, cap: [name(y.tag, val)] })
  }
  return <>{chips.map(c => (
    <Tag key={c.k} x={c.ax} y={c.ay} place={c.place} W={v.W} H={v.H} className={cls(show)}>
      <span className="clampshow-chip-cal" style={calStyle(c.axes)}>Cal</span>
      <span className="clampshow-chip-cap">{c.cap.map((e, i) => <span key={i}>{i > 0 && <span className="clampshow-val-sep">·</span>}{e}</span>)}</span>
    </Tag>
  ))}</>
}

// The opsz band: "Cal" at the optical size the limit lands on, set AT that size (capped so a
// display size fits the chip). In the stock face opsz N is the preview face's N × scale.
export function BandSample({ b, side, show }: { b: BandView; side: 'lo' | 'hi'; show: Show }) {
  const v = b.lim[side === 'lo' ? 0 : 1]
  const px = v * b.mult
  const x = b.W * ((v - b.min) / (b.max - b.min)) + (side === 'lo' ? 8 : -8)
  return (
    <Tag x={x} y={0} place="above" W={b.W} H={0} clampY={false} className={cls(show)}>
      <span className="clampshow-chip-cal clampshow-chip-cal--opsz" style={{ ...calStyle(b.axes, v), fontSize: `${Math.max(10, Math.min(32, px))}px` }}>Cal</span>
      <span className="clampshow-chip-cap"><OpszValue v={v} mult={b.mult} /></span>
    </Tag>
  )
}
