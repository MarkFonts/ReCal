// The clamp readout. An absolutely positioned tag anchored to a point, measured and
// kept inside its container, so a bubble near the pad's edge slides in rather than clips.
// `left` is the tag's CENTRE: the classes it carries (.matrix-val and kin) translate -50%.
// Nothing here is in flow, so a drag never reflows the pad.
import { useLayoutEffect, useRef } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { BandView } from './types'

export type Place = 'above' | 'below' | 'left' | 'right'
const GAP = 4

export function Tag({ x, y, place, W, H, clampY = true, className, style, children, ...data }: {
  x: number; y: number; place: Place      // anchor, px in the container, and which side of it
  W: number; H: number                    // the container
  clampY?: boolean                        // false: may leave the container vertically (the band)
  className: string; style?: CSSProperties; children: ReactNode
  'data-off'?: string; 'data-lit'?: string
}) {
  const ref = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const w = el.offsetWidth, h = el.offsetHeight
    let cx = x, ty = y - h / 2
    if (place === 'above') { ty = y - GAP - h; if (clampY && ty < 2) ty = y + GAP }
    else if (place === 'below') { ty = y + GAP; if (clampY && ty + h > H - 2) ty = y - GAP - h }
    else if (place === 'right') { cx = x + GAP + w / 2; if (cx + w / 2 > W - 2) cx = x - GAP - w / 2 }
    else { cx = x - GAP - w / 2; if (cx - w / 2 < 2) cx = x + GAP + w / 2 }
    cx = Math.max(w / 2 + 2, Math.min(W - w / 2 - 2, cx))
    if (clampY) ty = Math.max(2, Math.min(H - h - 2, ty))
    el.style.left = `${cx}px`
    el.style.top = `${ty}px`
  })
  return <span ref={ref} className={className} style={style} aria-hidden="true" {...data}>{children}</span>
}

/** The opsz band's number, in the slider's own units (stock opsz, as its ◆ field reads) and,
 *  under an Optical scale above 1×, the px size that limit lands at in the preview face. */
export const OpszValue = ({ v, mult, tag = 'opsz' }: { v: number; mult: number; tag?: string }) => <>
  <span className="clampshow-val-tag">{tag}</span><span className="tnum">{v}</span>
  {mult > 1 && <><span className="clampshow-val-sep">·</span><span className="tnum">{v * mult}</span><span className="clampshow-val-unit">px</span></>}
</>

/** The opsz band's tag: INSIDE the bar, beside its grabber (right of lo, left of hi), centred
 *  on the bar's height; on the grabber's far side when the two grabbers are close; BELOW the
 *  bar only when both sides are crowded. Never above: the Optical scale stepper and
 *  its head live there. `x` / `other` are the two grabbers' centres in px. */
export function BandTag({ x, other, side, W, H, className, children }: {
  x: number; other: number; side: 'lo' | 'hi'; W: number; H: number; className: string; children: ReactNode
}) {
  const ref = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const w = el.offsetWidth, h = el.offsetHeight, G = 8   // 8: clear of the grabber's widened 6px pill
    // 1. inside the clamp, beside the grabber; 2. outside it, on the grabber's far side (the
    // grabbers are close); 3. below the bar (both are crowded, e.g. a point clamp at an end).
    const inner = side === 'lo' ? x + G : x - G - w
    const innerFits = side === 'lo' ? inner + w <= Math.min(W - 4, other - G) : inner >= Math.max(4, other + G)
    const outer = side === 'lo' ? x - G - w : x + G
    const outerFits = side === 'lo' ? outer >= 4 : outer + w <= W - 4
    let cx: number, top: number
    if (h <= H && (innerFits || outerFits)) { cx = (innerFits ? inner : outer) + w / 2; top = (H - h) / 2 }
    else { cx = Math.max(w / 2 + 2, Math.min(W - w / 2 - 2, x)); top = H + 2 }
    el.style.left = `${cx}px`
    el.style.top = `${top}px`
  })
  return <span ref={ref} className={className} aria-hidden="true">{children}</span>
}

/** A band grabber's centre in px (the grabbers sit 6px inside the clamp's edge, 4px wide). */
export const bandX = (b: BandView, v: number, side: 'lo' | 'hi') =>
  b.W * ((v - b.min) / (b.max - b.min)) + (side === 'lo' ? 8 : -8)
