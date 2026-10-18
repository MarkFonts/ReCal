// GEOM swap editor — the type matrix, ported into the instrument rail with instrument
// tokens. One horizontal lane per glyph group; every variant is rendered as its own
// glyph, sitting in the GEOM band where it's active, over a zone-colored bar (the
// palette / Rosetta-Stone principle — the colors only mean something next to the
// shapes they name). Variant glyphs use the unmodified CalSansVF at each variant's
// natural GEOM, so their forms stay distinct regardless of the user's thresholds.
// Drag a boundary to move a swap → dispatch setThresholds → Shell's rebuild effect
// regenerates the CalSansPreview face. ⌘Z routes through the store's history.
//
// A variant can also be REMOVED from its rclt condition (its band collapses to zero width,
// graveLogic.ts) and brought back from the graveyard. How you remove it and where it waits
// is one of three live options, ?grave=a|b|c (Graveyard.tsx). A buried band draws no glyph
// and no band, and the two boundaries that meet over it draw as one ◆ that moves both.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { GROUP_DEFS, LANDING_ZONES } from '../GlyphGroups'
import { geomFromClientX, geomLeft, geomPx, geomSpan, zoneBandBackground } from './geomAxis'
import { useInstrument } from './InstrumentProvider'
import { Icon } from '../../shared/index'
import { bandRange, buriedIn, canRemove, laneHandles, restoreBand, type GraveEntry } from './graveLogic'
import {
  GraveBin, GraveGhost, GraveNotice, GraveStrip, useGraveOption, useVariantStyle, typingInField,
} from './Graveyard'

type Drag = { glyph: string; idxs: number[]; value: number }
type Band = { glyph: string; vi: number }
// b: a glyph lifted out of its lane (to remove), or a token lifted out of the bin (to restore).
type Lift =
  | { kind: 'out'; glyph: string; vi: number; label: string; x: number; y: number; armed: boolean }
  | { kind: 'back'; entry: GraveEntry; x: number; y: number; armed: boolean }

const MOVE_PX = 6          // movement before a press becomes a drag (GESTURES.md §0)
const LONG_PRESS_MS = 350  // touch: hold this long to lift, so a swipe still scrolls the rail

const coarse = () => window.matchMedia('(pointer: coarse)').matches

export function Matrix() {
  const { state, dispatch } = useInstrument()
  const opt = useGraveOption()
  const thresholds = state.defaults.glyphThresholds
  const grave = state.defaults.graveyard
  const geom = state.defaults.axes.GEOM
  const [drag, setDrag] = useState<Drag | null>(null)
  const [geomDragging, setGeomDragging] = useState(false)
  const [fading, setFading] = useState<{ key: string; value: number } | null>(null)
  const laneRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const glyphStyle = useVariantStyle()
  // The value chip lingers ~240ms after release, fading down toward the dial it came from.
  const fade = (key: string, value: number) => {
    setFading({ key, value })
    setTimeout(() => setFading(f => (f && f.key === key ? null : f)), 240)
  }

  // ── boundary drag. `idxs` is one threshold, or the run of them that meets over a buried
  // band; they move together, so the buried band stays shut. ──
  const startDrag = (glyph: string, idxs: number[], e: React.PointerEvent) => {
    e.preventDefault()
    const lane = laneRefs.current[glyph]
    if (!lane) return
    const rect = lane.getBoundingClientRect()
    const cur = thresholds[glyph] ?? GROUP_DEFS.find(d => d.glyph === glyph)?.defaultThresholds ?? []
    const first = idxs[0], last = idxs[idxs.length - 1]
    const clampAt = (clientX: number) => {
      const v = Math.round(geomFromClientX(clientX, rect))
      const lo = first > 0 ? cur[first - 1] + 1 : 0
      const hi = last < cur.length - 1 ? cur[last + 1] - 1 : 100
      return Math.max(lo, Math.min(hi, v))
    }
    let pushed = false
    const move = (ev: PointerEvent) => {
      if (!pushed) { dispatch({ type: 'pushHistory' }); pushed = true }
      const value = clampAt(ev.clientX)
      setDrag({ glyph, idxs, value })
      dispatch({ type: 'setThresholdDrag', drag: { glyph, idx: first, to: last, value } })   // the specimen colors the glyph from the live value
    }
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      if (pushed) {   // only commit / snapshot / fade if the drag actually moved
        const val = clampAt(ev.clientX)
        const next = cur.map((v, i) => (idxs.includes(i) ? val : v))
        dispatch({ type: 'setThresholds', thresholds: { ...thresholds, [glyph]: next } })
        fade(`${glyph}:${first}`, val)
      }
      setDrag(null)
      dispatch({ type: 'setThresholdDrag', drag: null })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  // The continuous GEOM-default line is itself a scrubber: drag it to set the default.
  const rowsRef = useRef<HTMLDivElement | null>(null)
  const startGeomDrag = (e: React.PointerEvent) => {
    e.preventDefault()
    const rows = rowsRef.current
    if (!rows) return
    const rect = rows.getBoundingClientRect()
    setGeomDragging(true)
    dispatch({ type: 'setGeomDragging', value: true })   // the line + its tag go HDR white while held, as on the pad
    let pushed = false, last = geom
    const move = (ev: PointerEvent) => {
      if (!pushed) { dispatch({ type: 'pushHistory' }); pushed = true }
      last = Math.round(geomFromClientX(ev.clientX, rect))
      dispatch({ type: 'setDefaultAxis', tag: 'GEOM', value: last })
    }
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up)
      setGeomDragging(false)
      dispatch({ type: 'setGeomDragging', value: false })
      if (pushed) fade('geom', last)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  // ── removal gestures (one per option) ─────────────────────────────────────────
  const [sel, setSel] = useState<Band | null>(null)      // a: the selected band
  const [hover, setHover] = useState<Band | null>(null)  // c: the band showing its ×
  const [lift, setLift] = useState<Lift | null>(null)    // b: what is in the hand
    useEffect(() => { setSel(null); setHover(null); setLift(null) }, [opt])
  const bury = (b: Band) => { dispatch({ type: 'buryVariant', glyph: b.glyph, vi: b.vi }); setSel(null); setHover(null) }
  const laneT = (glyph: string) => thresholds[glyph] ?? GROUP_DEFS.find(d => d.glyph === glyph)?.defaultThresholds ?? []

  // a: Delete / Backspace removes the selected band (never while typing in a field);
  // Escape or a press anywhere off the lanes lets go of it.
  useEffect(() => {
    if (opt !== 'a' || !sel) return
    const onKey = (e: KeyboardEvent) => {
      if (typingInField(e.target)) return
      if (e.key === 'Escape') { setSel(null); return }
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      e.preventDefault()
      if (canRemove(laneT(sel.glyph), sel.vi)) bury(sel)
    }
    const onDoc = (e: PointerEvent) => {
      const t = e.target as HTMLElement
      if (!t.closest('.matrix-hit, .matrix-armchip')) setSel(null)
    }
    window.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDoc)
    return () => { window.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', onDoc) }
  })

  // c: on touch there is no hover, so a tap shows the × and a press elsewhere hides it.
  useEffect(() => {
    if (opt !== 'c' || !hover) return
    const onDoc = (e: PointerEvent) => {
      const t = e.target as HTMLElement
      if (!t.closest('.matrix-lane')) setHover(null)
    }
    document.addEventListener('pointerdown', onDoc)
    return () => document.removeEventListener('pointerdown', onDoc)
  }, [opt, hover])

  // b: one pointer session for both directions. `begin` waits for 6px of movement (mouse,
  // pen) or a 350ms hold (touch, from a lane: a plain swipe still scrolls the rail), then
  // lifts; from then on the pointer carries the glyph and nothing scrolls.
  // A touch lift has to stop the rail scrolling under it, and only a touchmove listener that
  // is already there (non-passive) at touchstart can: one added mid-gesture is passive by
  // then. So the matrix holds one for good and cancels only while something is lifted.
  const lifting = useRef(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const stop = (ev: TouchEvent) => { if (lifting.current && ev.cancelable) ev.preventDefault() }
    el.addEventListener('touchmove', stop, { passive: false })
    return () => el.removeEventListener('touchmove', stop)
  }, [])
  const beginLift = (e: React.PointerEvent, make: (x: number, y: number) => Lift, holdOnTouch: boolean) => {
    if (e.button !== 0) return
    const sx = e.clientX, sy = e.clientY, touch = e.pointerType === 'touch'
    if (!touch) e.preventDefault()   // no text selection trailing the mouse
    let live: Lift | null = null, timer = 0
    // What is actually under the pointer, not a rect: the lanes scroll under the docked
    // graveyard and the pinned rows, and those are not "on the matrix".
    const overLanes = (x: number, y: number) => !!document.elementFromPoint(x, y)?.closest('.matrix-rows')
    const armedAt = (l: Lift, x: number, y: number) => (l.kind === 'out' ? !overLanes(x, y) : overLanes(x, y))
    const start = (x: number, y: number) => {
      document.documentElement.classList.add('grave-lifting')
      lifting.current = true
      live = make(x, y)
      setLift(live)
      setSel(null)
    }
    const move = (ev: PointerEvent) => {
      if (!live) {
        if (touch && holdOnTouch) { if (Math.abs(ev.clientX - sx) > MOVE_PX || Math.abs(ev.clientY - sy) > MOVE_PX) end() ; return }
        if (Math.abs(ev.clientX - sx) < MOVE_PX && Math.abs(ev.clientY - sy) < MOVE_PX) return
        start(ev.clientX, ev.clientY)
      }
      const l = live!
      live = { ...l, x: ev.clientX, y: ev.clientY, armed: armedAt(l, ev.clientX, ev.clientY) } as Lift
      setLift(live)
    }
    const key = (ev: KeyboardEvent) => {
      if (!live) return
      if (ev.key === 'Escape') { ev.preventDefault(); live = null; end() }
      else if (live.kind === 'out' && (ev.key === 'Delete' || ev.key === 'Backspace') && !typingInField(ev.target)) {
        ev.preventDefault()   // ReCal#5: Delete while dragging removes it, wherever it is
        bury({ glyph: live.glyph, vi: live.vi }); live = null; end()
      }
    }
    const up = () => {
      if (live?.armed) {
        if (live.kind === 'out') bury({ glyph: live.glyph, vi: live.vi })
        else dispatch({ type: 'restoreVariant', id: live.entry.id })
      }
      end()
    }
    const end = () => {
      clearTimeout(timer)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', end)
      window.removeEventListener('keydown', key)
      document.documentElement.classList.remove('grave-lifting')
      lifting.current = false
      live = null
      setLift(null)
    }
    if (touch && holdOnTouch) timer = window.setTimeout(() => start(sx, sy), LONG_PRESS_MS)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', end)
    window.addEventListener('keydown', key)
  }
  const liftOut = (e: React.PointerEvent, glyph: string, vi: number, label: string) => {
    if (!canRemove(laneT(glyph), vi)) return
    beginLift(e, (x, y) => ({ kind: 'out', glyph, vi, label, x, y, armed: false }), true)
  }
  const liftBack = (e: React.PointerEvent, entry: GraveEntry) => {
    e.preventDefault()
    beginLift(e, (x, y) => ({ kind: 'back', entry, x, y, armed: false }), false)
  }

  // "Default NN" sits in the 0/50/100 row with its NUMBER centered on the bar's x, clamped to
  // the matrix edges, and covers whatever tick it lands on.
  const axisRef = useRef<HTMLDivElement | null>(null)
  const tagRef = useRef<HTMLSpanElement | null>(null)
  const numRef = useRef<HTMLSpanElement | null>(null)
  const [tagLeft, setTagLeft] = useState<number | null>(null)
  useLayoutEffect(() => {
    const place = () => {
      const axis = axisRef.current, tag = tagRef.current, num = numRef.current
      if (!axis || !tag || !num) return
      const w = axis.clientWidth
      const want = geomPx(geom, w) - (num.offsetLeft + num.offsetWidth / 2)
      const next = Math.max(0, Math.min(w - tag.offsetWidth, want))
      setTagLeft(prev => (prev !== null && Math.abs(prev - next) < 0.25 ? prev : next))
      // A tick the tag touches goes under it entirely, never half-covered.
      axis.querySelectorAll<HTMLElement>('.matrix-axis-tick').forEach(t => {
        const c = geomPx(Number(t.dataset.v), w), half = t.offsetWidth / 2
        t.style.visibility = c + half > next && c - half < next + tag.offsetWidth ? 'hidden' : ''
      })
    }
    place()
    const ro = new ResizeObserver(place)
    if (axisRef.current) ro.observe(axisRef.current)
    document.fonts?.ready.then(place)
    return () => ro.disconnect()
  }, [geom])

  const isSel = (g: string, vi: number) => !!sel && sel.glyph === g && sel.vi === vi
  const isHover = (g: string, vi: number) => !!hover && hover.glyph === g && hover.vi === vi
  const isLifted = (g: string, vi: number) => lift?.kind === 'out' && lift.glyph === g && lift.vi === vi
  const backTo = lift?.kind === 'back' ? lift.entry : null

  return (
    <div className={`matrix matrix--grave-${opt}`} ref={rootRef}>
      <div className="matrix-axis" ref={axisRef}>
        {[0, 50, 100].map(v => (
          <span key={v} className="matrix-axis-tick geom-num tnum" data-v={v} style={{ left: geomLeft(v) }}>{v}</span>
        ))}
        <span ref={tagRef} className={`matrix-default-tag geom-num${state.geomDragging ? ' is-dragging' : ''}`}
          style={{ left: tagLeft ?? 0, visibility: tagLeft === null ? 'hidden' : 'visible' }}>
          Default <span ref={numRef} className="tnum">{Math.round(geom)}</span>
        </span>
      </div>
      <div className={`matrix-rows${lift?.kind === 'out' && lift.armed ? ' is-dropping-out' : ''}${backTo && lift?.armed ? ' is-receiving' : ''}`} ref={rowsRef}>
        {LANDING_ZONES.map(z => (
          <div key={z.label} className="matrix-zone"
            style={{ left: geomLeft(z.start), width: geomSpan(z.start, z.end), background: zoneBandBackground(z.label) }} />
        ))}
        {GROUP_DEFS.map(def => {
          const base = thresholds[def.glyph] ?? def.defaultThresholds
          const shown = drag && drag.glyph === def.glyph
            ? base.map((v, i) => (drag.idxs.includes(i) ? drag.value : v))
            : base
          const buried = buriedIn(grave, def.glyph)
          const handles = laneHandles(shown, buried)
          const bounds = [0, ...shown, 100]
          // Half-open bands [b, next) so a value lands in exactly one — except the last,
          // which has to include its own upper bound. Without that, geom === 100 matched no
          // band, findIndex returned -1, and EVERY lane rendered inactive: at 99 the rows
          // lit up, at 100 the whole editor looked switched off.
          const activeIdx = bounds.findIndex((b, i) =>
            i < bounds.length - 1 && geom >= b && (i === bounds.length - 2 ? geom <= bounds[i + 1] : geom < bounds[i + 1]))
          // b: dragging a token back over the matrix previews where its own lane will put it.
          const preview = backTo && lift?.armed && backTo.glyph === def.glyph
            ? bandRange(restoreBand(base, backTo), backTo.vi) : null
          return (
            <div className={`matrix-lane${preview ? ' is-target' : ''}`} key={def.glyph} ref={el => { laneRefs.current[def.glyph] = el }}
              onPointerLeave={opt === 'c' ? e => { if (e.pointerType === 'mouse') setHover(null) } : undefined}>
              {(state.shippedThresholds[def.glyph] ?? []).map((v, i) => (
                <div key={`s${i}`} className="matrix-shipped" style={{ left: geomLeft(v) }}
                  title={`Cal Sans default · GEOM ${v}`} />
              ))}
              {def.variants.map((variant, vi) => {
                if (buried.has(vi)) return null
                const a = bounds[vi], b = bounds[vi + 1], mid = (a + b) / 2
                const on = vi === activeIdx
                const removable = canRemove(shown, vi)
                const armed = isSel(def.glyph, vi) || isHover(def.glyph, vi) || (isLifted(def.glyph, vi) && !!lift?.armed)
                const name = `${def.glyph} · ${variant.label} · GEOM ${a}–${b}`
                return (
                  <div key={vi}>
                    <div className={`matrix-band${on ? ' on' : ''}${armed ? ' is-armed' : ''}`}
                      data-zone={variant.label}
                      /* No inline background while ON: the HDR swatch is in CSS, and an
                         inline colour would win over it and flatten the band to SDR. */
                      style={on || armed
                        ? { left: geomLeft(a), width: geomSpan(a, b) }
                        : { left: geomLeft(a), width: geomSpan(a, b), background: variant.color }} />
                    <span className={`matrix-vglyph${on ? ' on' : ''}${armed ? ' is-armed' : ''}${isLifted(def.glyph, vi) ? ' is-lifted' : ''}`}
                      style={{ left: geomLeft(mid), ...glyphStyle(variant.label) }}
                      title={`${variant.label} · GEOM ${a}–${b}`}>{def.glyph}</span>
                    {/* The band's hit area: the whole lane height over its GEOM span, under the
                        ◆ handles and the default line's grabber. */}
                    {b > a && (
                      <div className={`matrix-hit${removable ? '' : ' is-last'}`} data-glyph={def.glyph} data-vi={vi}
                        style={{ left: geomLeft(a), width: geomSpan(a, b) }}
                        role={opt === 'b' ? undefined : 'button'} tabIndex={opt === 'b' ? -1 : 0}
                        aria-label={removable ? `${name}. ${opt === 'a' ? 'Select, then press Delete to remove.' : 'Remove with the × button.'}` : `${name}. The lane's only form left.`}
                        title={removable ? undefined : `The only ${def.glyph} left in this lane; it can't be removed`}
                        onFocus={opt === 'a' ? () => setSel({ glyph: def.glyph, vi }) : opt === 'c' ? () => setHover({ glyph: def.glyph, vi }) : undefined}
                        onPointerEnter={opt === 'c' ? e => { if (e.pointerType === 'mouse' && removable) setHover({ glyph: def.glyph, vi }) } : undefined}
                        onPointerDown={
                          opt === 'a' ? () => setSel(isSel(def.glyph, vi) ? null : { glyph: def.glyph, vi })
                          : opt === 'b' ? e => liftOut(e, def.glyph, vi, variant.label)
                          : e => { if (e.pointerType !== 'mouse' && removable) setHover(isHover(def.glyph, vi) ? null : { glyph: def.glyph, vi }) }} />
                    )}
                    {opt === 'a' && isSel(def.glyph, vi) && (
                      <button className={`matrix-armchip${mid < 25 ? ' is-l' : mid > 75 ? ' is-r' : ''}`} style={{ left: geomLeft(mid) }} disabled={!removable}
                        onClick={() => bury({ glyph: def.glyph, vi })}>
                        {removable
                          ? <>{variant.label} · {coarse() ? 'tap to remove' : <><kbd>Delete</kbd> removes</>}</>
                          : <>only {def.glyph} left</>}
                      </button>
                    )}
                    {opt === 'c' && isHover(def.glyph, vi) && removable && (
                      <button className="matrix-x" style={{ left: geomLeft(mid) }}
                        aria-label={`Remove ${def.glyph} · ${variant.label}`} title={`Remove ${def.glyph} · ${variant.label} from rclt`}
                        onPointerDown={e => e.stopPropagation()}
                        onClick={() => bury({ glyph: def.glyph, vi })}>
                        <Icon name="close" size={12} />
                      </button>
                    )}
                  </div>
                )
              })}
              {preview && (
                <div className="matrix-restore-preview" style={{ left: geomLeft(preview[0]), width: geomSpan(preview[0], preview[1]),
                  ['--zone-color' as string]: def.variants[backTo!.vi].color }} />
              )}
              {handles.map(h => (
                <div key={`h${h.idxs[0]}`} className={`matrix-handle${h.idxs.length > 1 ? ' is-merged' : ''}`} style={{ left: geomLeft(h.value) }}
                  onPointerDown={e => startDrag(def.glyph, h.idxs, e)}
                  title={h.idxs.length > 1 ? `your swap · GEOM ${h.value} (a removed variant sits here)` : `your swap · GEOM ${h.value}`} />
              ))}
              {drag && drag.glyph === def.glyph && (
                <span className="matrix-val matrix-val--in tnum" style={{ left: geomLeft(drag.value) }}>{drag.value}</span>
              )}
              {fading && fading.key.startsWith(`${def.glyph}:`) && (
                <span className="matrix-val matrix-val--out tnum" style={{ left: geomLeft(fading.value) }}>{fading.value}</span>
              )}
            </div>
          )
        })}
        {/* the default: a line through every lane, ringed like the pad's knob */}
        <div className={`matrix-default${state.geomDragging ? ' is-dragging' : ''}`} style={{ left: geomLeft(geom) }} />
        <div className="matrix-geom" style={{ left: geomLeft(geom) }} onPointerDown={startGeomDrag} />
        {geomDragging && (
          <span className="matrix-val matrix-val--in matrix-val--geom tnum" style={{ left: geomLeft(geom) }}>{geom}</span>
        )}
        {fading && fading.key === 'geom' && (
          <span className="matrix-val matrix-val--out matrix-val--geom tnum" style={{ left: geomLeft(fading.value) }}>{fading.value}</span>
        )}
      </div>

      {/* Docked to the foot of the rail's viewport while the lanes scroll under it, so a
          removal always lands somewhere you can see (16 lanes outrun most windows). */}
      <div className={`grave-dock grave-dock--${opt}`}>
        <GraveNotice />
        {opt === 'a' && <GraveStrip />}
        {opt === 'b' && <GraveBin armed={lift?.kind === 'out' && lift.armed} onTokenDown={liftBack} />}
      </div>
      {lift && (lift.kind === 'out'
        ? <GraveGhost x={lift.x} y={lift.y} glyph={lift.glyph} label={lift.label} armed={lift.armed}
            verb={lift.armed ? 'release to remove' : 'drag off to remove'} />
        : <GraveGhost x={lift.x} y={lift.y} glyph={lift.entry.glyph} label={lift.entry.label} armed={lift.armed}
            verb={lift.armed ? 'release to restore' : 'drop on the matrix'} />)}

      <p className="matrix-note">
        Every variant sits in the GEOM band where it’s active. Drag a boundary to move a swap;
        the line marks your default (<span className="tnum">{geom}</span>).{' '}
        {opt === 'a' && 'Click a band and press Delete to take that form out of the swap.'}
        {opt === 'b' && 'Drag a glyph off the lanes to take that form out of the swap.'}
        {opt === 'c' && 'Point at a band and click its × to take that form out of the swap.'}
      </p>
    </div>
  )
}
