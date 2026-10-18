// The Type Matrix graveyard, as three live options (?grave=a|b|c) for Mark to compare.
// The data is one thing for all three (store: defaults.graveyard, logic: graveLogic.ts);
// only the gesture that removes a variant and the place the removed ones wait differ.
//
//   a  Select, then ⌫     click a band (or its glyph) to select it, Delete/Backspace removes;
//                         a REMOVED strip under the lanes, click a tile to bring it back.
//   b  Drag it off        lift a glyph (press-drag; long-press on touch) and drop it off the
//                         lanes, or press Delete mid-drag (ReCal#5); a bin well under the
//                         lanes, drag a token back onto the matrix to restore it.
//   c  Hover ✕            a ✕ on the band you point at (tap first on touch); the graveyard is
//                         a mark in the Type Matrix heading that opens a list with Restore.
import './graveyard.css'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { Icon, wmConfirm } from '../../shared/index'
import { useInstrument } from './InstrumentProvider'
import { effectiveAxes } from './store'
import { renderVarSettings } from './render'
import { ZONE_COLOR } from '../zoneColors'
import { bandRange, entryName, isCollapsed, laneThresholds, needsRange, type GraveEntry } from './graveLogic'

// ── which option ───────────────────────────────────────────────────────────────
export type GraveOption = 'a' | 'b' | 'c'
const OPTIONS: { id: GraveOption; name: string; hint: string }[] = [
  { id: 'a', name: 'Select ⌫', hint: 'Click a band, press Delete. Removed strip under the lanes; click a tile to restore.' },
  { id: 'b', name: 'Drag off', hint: 'Drag a glyph off the lanes (long-press on touch). Bin under the lanes; drag a token back to restore.' },
  { id: 'c', name: 'Hover ×', hint: 'Point at a band, click its ×. The graveyard is the bin mark in the heading.' },
]
const readOption = (): GraveOption => {
  const v = new URLSearchParams(window.location.search).get('grave')
  return v === 'b' || v === 'c' ? v : 'a'
}
let current: GraveOption = readOption()
const subs = new Set<() => void>()
export function setGraveOption(o: GraveOption) {
  current = o
  const url = new URL(window.location.href)
  url.searchParams.set('grave', o)
  window.history.replaceState(null, '', url)
  subs.forEach(f => f())
}
export const useGraveOption = (): GraveOption =>
  useSyncExternalStore(f => { subs.add(f); return () => { subs.delete(f) } }, () => current)

/** Demo-only floating switcher: flips the option live, keeping whatever you removed. */
export function GraveSwitcher() {
  const opt = useGraveOption()
  return createPortal(
    <div className="grave-switch" role="group" aria-label="Graveyard option">
      <span className="grave-switch-lbl">Graveyard</span>
      <div className="grave-switch-seg">
        {OPTIONS.map(o => (
          <button key={o.id} className={opt === o.id ? 'on' : ''} aria-pressed={opt === o.id}
            title={o.hint} onClick={() => setGraveOption(o.id)}>
            <b>{o.id.toUpperCase()}</b> {o.name}
          </button>
        ))}
      </div>
    </div>,
    document.body,
  )
}

// ── shared pieces ─────────────────────────────────────────────────────────────
// GEOM at which each variant's form is drawn (its zone's natural sample point), as in the lanes.
export const NATURAL_GEOM: Record<string, number> = { A11Y: 3, UI: 22, default: 25, Base: 50, Geo: 90 }

export function useVariantStyle() {
  const { state } = useInstrument()
  const axes = effectiveAxes(state)
  return (label: string): React.CSSProperties => ({
    fontFamily: "'CalSansVF', sans-serif",
    fontVariationSettings: renderVarSettings({ ...axes, GEOM: NATURAL_GEOM[label] ?? 25 }, { opszOverride: 14 }),
    fontFeatureSettings: label === 'default' ? "'rclt' 0" : "'rclt' 1",
    fontOpticalSizing: 'none',
  })
}

export const zoneColor = (label: string) => ZONE_COLOR[label as keyof typeof ZONE_COLOR] ?? ZONE_COLOR.default

const rangeText = (e: GraveEntry) => { const [a, b] = bandRange(e.before, e.vi); return `GEOM ${a}–${b}` }
const fullName = (e: GraveEntry) => `${entryName(e)}${needsRange(e.glyph, e.label) ? ` (${rangeText(e)})` : ''}`

/** True when keystrokes belong to a text field, not to the matrix. */
export const typingInField = (t: EventTarget | null) => {
  const el = t as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
}

/** The removal is never silent: a status line under the lanes says what happened, with Undo.
 *  It reads the graveyard's own changes, so a removal by any gesture, a restore, an undo and
 *  a clear each get their sentence. */
export function GraveNotice() {
  const { state, dispatch } = useInstrument()
  const g = state.defaults.graveyard
  const prev = useRef(g)
  const [msg, setMsg] = useState<{ text: string; undo: boolean; key: number } | null>(null)
  useEffect(() => {
    const before = prev.current
    prev.current = g
    if (before === g) return
    const added = g.filter(e => !before.some(b => b.id === e.id))
    const gone = before.filter(b => !g.some(e => e.id === b.id))
    const thr = state.defaults.glyphThresholds
    let text = ''
    const cleared = gone.filter(e => isCollapsed(laneThresholds(thr, e.glyph), e.vi))
    if (added.length) text = `Removed ${fullName(added[added.length - 1])} from rclt.`
    else if (cleared.length) text = `Graveyard cleared: ${cleared.length === 1 ? 'that removal is' : `${cleared.length} removals are`} now permanent.`
    else if (gone.length) text = `${fullName(gone[gone.length - 1])} is back.`
    if (!text) return
    setMsg({ text, undo: true, key: Date.now() })
  }, [g, state.defaults.glyphThresholds])
  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(null), 6000)
    return () => clearTimeout(t)
  }, [msg])
  return (
    <p className="grave-notice" role="status" aria-live="polite">
      {msg && <span key={msg.key} className="grave-notice-in">
        {msg.text}{' '}
        <button className="grave-notice-undo" onClick={e => { wmConfirm(e.currentTarget); dispatch({ type: 'undo' }) }}>Undo</button>
        <span className="grave-notice-key"> ⌘Z</span>
      </span>}
    </p>
  )
}

// ── a: REMOVED strip, click a tile to restore ────────────────────────────────
export function GraveStrip() {
  const { state, dispatch } = useInstrument()
  const g = state.defaults.graveyard
  const vs = useVariantStyle()
  return (
    <div className="grave-strip">
      <div className="grave-head">
        <span className="grave-title">Removed{g.length > 0 && <span className="tnum"> · {g.length}</span>}</span>
        <button className="freezer-reset grave-clear" disabled={!g.length}
          title="Forget these: the variants stay removed, and can no longer be brought back from here"
          onClick={e => { wmConfirm(e.currentTarget); dispatch({ type: 'clearGraveyard' }) }}>clear</button>
      </div>
      {g.length === 0
        ? <p className="grave-empty">Nothing removed. Click a band, then press Delete.</p>
        : <div className="grave-tiles">
            {g.map(e => (
              <button key={e.id} className="grave-tile" title={`Bring back ${fullName(e)} · ${rangeText(e)}`}
                onClick={ev => { wmConfirm(ev.currentTarget); dispatch({ type: 'restoreVariant', id: e.id }) }}>
                <span className="grave-tile-glyph" style={vs(e.label)}>{e.glyph}</span>
                <span className="grave-tile-bar" style={{ background: zoneColor(e.label) }} />
                <span className="grave-tile-name">{e.label}</span>
              </button>
            ))}
          </div>}
    </div>
  )
}

// ── b: the bin well; tokens drag back onto the matrix ───────────────────────────
export function GraveBin({ armed, onTokenDown }: {
  armed: boolean                                            // a lifted glyph is over / off the lanes: release removes
  onTokenDown: (e: React.PointerEvent, entry: GraveEntry) => void
}) {
  const { state, dispatch } = useInstrument()
  const g = state.defaults.graveyard
  const vs = useVariantStyle()
  return (
    <div className={`grave-bin${armed ? ' is-armed' : ''}`} data-grave-bin="">
      <div className="grave-bin-head">
        <Icon name="delete" size={16} state={armed ? 'active' : g.length ? 'rest' : 'off'} className="grave-bin-ic" />
        <span className="grave-title">{armed ? 'Release to remove' : 'Graveyard'}{!armed && g.length > 0 && <span className="tnum"> · {g.length}</span>}</span>
        <button className="freezer-reset grave-clear" disabled={!g.length}
          title="Empty the bin: the variants stay removed, and can no longer be brought back"
          onClick={e => { wmConfirm(e.currentTarget); dispatch({ type: 'clearGraveyard' }) }}>empty</button>
      </div>
      {g.length === 0
        ? <p className="grave-empty">Drag a glyph off the lanes to remove it.</p>
        : <div className="grave-tokens">
            {g.map(e => (
              <span key={e.id} className="grave-token" role="button" tabIndex={0}
                title={`Drag ${fullName(e)} back onto the matrix · ${rangeText(e)}`}
                aria-label={`${fullName(e)}. Drag back onto the matrix, or press Enter, to restore.`}
                onPointerDown={ev => onTokenDown(ev, e)}
                onKeyDown={ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); dispatch({ type: 'restoreVariant', id: e.id }) } }}>
                <span className="grave-token-glyph" style={{ ...vs(e.label), color: zoneColor(e.label) }}>{e.glyph}</span>
              </span>
            ))}
            <span className="grave-bin-hint">drag back to restore</span>
          </div>}
    </div>
  )
}

/** b: the glyph that follows the pointer while it is lifted (out of a lane, or out of the bin). */
export function GraveGhost({ x, y, glyph, label, armed, verb }: {
  x: number; y: number; glyph: string; label: string; armed: boolean; verb: string
}) {
  const vs = useVariantStyle()
  return createPortal(
    <div className={`grave-ghost${armed ? ' is-armed' : ''}`} style={{ left: x, top: y }}>
      <span className="grave-ghost-glyph" style={{ ...vs(label), color: zoneColor(label) }}>{glyph}</span>
      <span className="grave-ghost-lbl">{label} · {verb}</span>
    </div>,
    document.body,
  )
}

// ── c: the bin mark in the Type Matrix heading, and its list ───────────────────────
export function GraveMenu() {
  const { state, dispatch } = useInstrument()
  const g = state.defaults.graveyard
  const vs = useVariantStyle()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  // A removal is the mark's receipt: it blinks (the house confirm) as the count goes up.
  const n = useRef(g.length)
  useEffect(() => {
    if (g.length > n.current) wmConfirm(btnRef.current)
    n.current = g.length
  }, [g.length])
  useEffect(() => {
    if (!open) return
    const onDoc = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('pointerdown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [open])
  return (
    <div className="grave-menu" ref={ref}>
      <button ref={btnRef} className={`wm-icon-btn grave-menu-btn${open ? ' active' : ''}`} aria-expanded={open}
        aria-label={`Graveyard, ${g.length} removed`} title={g.length ? `Graveyard · ${g.length} removed` : 'Graveyard · nothing removed'}
        onClick={() => setOpen(o => !o)}>
        <Icon name="delete" size={16} state={open ? 'active' : g.length ? 'rest' : 'off'} />
        {g.length > 0 && <span className="grave-menu-count tnum">{g.length}</span>}
      </button>
      {open && (
        <div className="grave-pop" role="dialog" aria-label="Graveyard">
          <div className="grave-head">
            <span className="grave-title">Graveyard</span>
            <button className="freezer-reset grave-clear" disabled={!g.length}
              title="Forget these: the variants stay removed, and can no longer be brought back from here"
              onClick={e => { wmConfirm(e.currentTarget); dispatch({ type: 'clearGraveyard' }) }}>clear</button>
          </div>
          {g.length === 0
            ? <p className="grave-empty">Nothing removed. Point at a band and click its ×.</p>
            : <ul className="grave-list">
                {[...g].reverse().map(e => (
                  <li key={e.id} className="grave-row">
                    <span className="grave-row-glyph" style={vs(e.label)}>{e.glyph}</span>
                    <span className="grave-row-mid">
                      <span className="grave-row-name">{e.label}</span>
                      <span className="grave-row-bar" style={{ background: zoneColor(e.label) }} />
                      <span className="grave-row-range tnum">{rangeText(e)}</span>
                    </span>
                    <button className="grave-row-restore" title={`Bring back ${fullName(e)}`}
                      onClick={ev => { wmConfirm(ev.currentTarget); dispatch({ type: 'restoreVariant', id: e.id }) }}>
                      <Icon name="undo" size={16} />Restore
                    </button>
                  </li>
                ))}
              </ul>}
        </div>
      )}
    </div>
  )
}
