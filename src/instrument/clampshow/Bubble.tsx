// REVIEW-ONLY (clamp-show) — option A: the new limit rides the grabber in the Type Matrix's
// value bubble (.matrix-val, --in while held, --out on release). A side edge's bubble sits
// above its grabber, a top / bottom edge's beside it; a corner shows both numbers; a frame
// slide shows the two far corners (low-low and high-high), the whole range in two bubbles.
import { BandTag, OpszValue, Tag, bandX } from './Tag'
import type { Place } from './Tag'
import { moving } from './types'
import type { BandView, PadView, Show } from './types'

const cls = (s: Show) => `matrix-val clampshow-val ${s.fading ? 'matrix-val--out' : 'matrix-val--in'} tnum`
const Num = ({ tag, v }: { tag: string; v: number }) => <><span className="clampshow-val-tag">{tag}</span>{v}</>

export function PadBubble({ v, show }: { v: PadView; show: Show }) {
  const m = moving(show)
  const { x, y } = v
  const xt = x.tag.toUpperCase(), yt = y.tag.toUpperCase()
  const midX = v.px((x.lim[0] + x.lim[1]) / 2), midY = v.py((y.lim[0] + y.lim[1]) / 2)
  const tags: { k: string; ax: number; ay: number; place: Place; body: JSX.Element }[] = []
  const corner = (k: string, xi: 0 | 1, yi: 0 | 1, place: Place) => {
    const parts = [!x.frozen && <Num key="x" tag={xt} v={x.lim[xi]} />, !y.frozen && <Num key="y" tag={yt} v={y.lim[yi]} />].filter(Boolean)
    tags.push({ k, ax: v.px(x.lim[xi]), ay: v.py(y.lim[yi]), place, body: <>{parts[0]}{parts[1] && <span className="clampshow-val-sep">·</span>}{parts[1]}</> })
  }
  if (show.kind === 'box') { corner('bl', 0, 0, 'below'); corner('tr', 1, 1, 'above') }
  else if (show.side && show.side.length === 2) corner(show.side, m.xlo ? 0 : 1, m.ylo ? 0 : 1, show.side[0] === 't' ? 'above' : 'below')
  else if (m.xlo || m.xhi) { const i = m.xlo ? 0 : 1; tags.push({ k: 'x', ax: v.px(x.lim[i]), ay: midY - 14, place: 'above', body: <Num tag={xt} v={x.lim[i]} /> }) }
  else { const i = m.ylo ? 0 : 1; tags.push({ k: 'y', ax: midX + 14, ay: v.py(y.lim[i]), place: 'right', body: <Num tag={yt} v={y.lim[i]} /> }) }
  return <>{tags.map(t => <Tag key={t.k} x={t.ax} y={t.ay} place={t.place} W={v.W} H={v.H} className={cls(show)}>{t.body}</Tag>)}</>
}

// The opsz band: the value sits INSIDE the bar beside its grabber, in the bar's own micro
// type on a knock-out (BandTag; below the bar if the grabbers are too close). OpszValue: the
// slider's own number, plus the px it lands at under the Optical scale.
export function BandBubble({ b, side, show }: { b: BandView; side: 'lo' | 'hi'; show: Show }) {
  const v = b.lim[side === 'lo' ? 0 : 1]
  const o = side === 'lo' ? 'hi' : 'lo'
  return (
    <BandTag x={bandX(b, v, side)} other={bandX(b, b.lim[o === 'lo' ? 0 : 1], o)} side={side} W={b.W} H={b.H}
      className={`clampshow-bandval ${show.fading ? 'matrix-val--out' : 'matrix-val--in'}`}>
      <OpszValue v={v} mult={b.mult} tag={b.tag} />
    </BandTag>
  )
}
