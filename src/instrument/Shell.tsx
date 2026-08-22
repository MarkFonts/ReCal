// Phase 2 shell — rail / canvas / floor, every control wired to the store.
// Live font via CalSansVF + effective(); GEOM glyph swaps render through the font's
// stock rclt (custom swap-point *editing* is Phase 6). No scenes/gestures yet.
import './shell.css'
import './holo.css'
import { useState, useRef, useEffect } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { useInstrument } from './InstrumentProvider'
import { StyleScopeList, InlineEmphasisBubble, AxisSlider, nbMinus,
  AlignmentButtons, FittingControls, fittingMode, FLATTERSATZ_DEFAULTS,
  type FitOptions } from '../../shared/index' // wm-primitives (git submodule)
import { ZONE_CHIP_COLOR } from '../zoneColors'
import {
  AXIS_RANGES, effectiveAxes, mergedAxes, previewDrifted, stateTag, defaultsDirty, glyphsEditedCount,
} from './store'
import { renderVarSettings, opszForSize } from './render'
import { BOOT } from './boot'
import {
  Modebar, Scene, SceneControls, FEATURE_CHIPS, SS_FEATURES, SCENES, type SceneMode,
  DEFAULT_PARA_STYLES, PARA_STYLE_ORDER, PARA_STYLE_LABEL,
  type ParaStyleKey, type ParaStyle, type ParaStyles,
  SCALE_TIERS, DEFAULT_SCALE_STYLES, type ScaleTierStyle, type ScaleStyles,
} from './scenes'
import Info from './Info'
import { PRESETS, applyPreset } from './presets'
import { useFontEngine } from './useFontEngine'
import { Matrix } from './Matrix'
import { Freezer } from './Freezer'
import { VMetricsPanel, VMetricsScene } from './VMetricsView'

const TAG_TEXT: Record<ReturnType<typeof stateTag>, { label: string; color: string }> = {
  YOUR: { label: 'YOUR ◆', color: 'var(--marker-default)' },
  PREVIEWING: { label: 'PREVIEWING ●', color: 'var(--marker-preview)' },
  STOCK: { label: 'STOCK — original Cal Sans', color: 'var(--state-stock)' },
}

const SIZE_DEFAULT = 88
const FEATS_DEFAULT = ['liga']   // default-on OpenType features (ligatures)
const featsDrifted = (feats: Set<string>): boolean =>
  feats.size !== FEATS_DEFAULT.length || !FEATS_DEFAULT.every(t => feats.has(t))

// Circular-arrow reset glyph, ported from the classic app / font-proofer.
function ResetIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">
      <path d="M8,14.2909c-3.47461,0-6.30127-2.81629-6.30127-6.2909,0-2.57326,1.51851-3.90145,2.46222-4.67831.19366-.15897.47817-.12995.6365.06182.15865.19272.10866.45416-.06182.6365-.72266.77296-1.63651,1.99428-1.63651,3.97999,0,2.70215,2.19824,4.91247,4.90088,4.91247,2.70215,0,4.90039-2.21033,4.90039-4.91247,0-2.70264-2.19824-4.90088-4.90039-4.90088-.38672,0-.7002-.31348-.7002-.7002s.31348-.7002.7002-.7002c3.47461,0,6.30078,2.82666,6.30078,6.30127s-2.82617,6.2909-6.30078,6.2909Z"/>
      <path d="M4.84717,6.89648c-.38672,0-.7002-.31348-.7002-.7002v-2.12169h-2.10645c-.38672,0-.7002-.31032-.7002-.69704s.31348-.68811.7002-.68811h2.80664c.38672,0,.7002.31348.7002.7002v2.80664c0,.38672-.31348.7002-.7002.7002Z"/>
    </svg>
  )
}

// Instrument zone anchors — each chip pins GEOM to one exact value (owner spec).
const ZONES = [
  { label: 'A11y', geom: 0, color: ZONE_CHIP_COLOR.A11y },
  { label: 'UI', geom: 25, color: ZONE_CHIP_COLOR.UI },
  { label: 'Base', geom: 50, color: ZONE_CHIP_COLOR.Base },
  { label: 'Geo', geom: 100, color: ZONE_CHIP_COLOR.Geo },
]
const nearestZoneLabel = (geom: number) =>
  ZONES.reduce((best, z) => (Math.abs(z.geom - geom) < Math.abs(best.geom - geom) ? z : best)).label

// ── Rail: the font mutator (◆) ────────────────────────────────────────────────
function Pin({ tag, label, dragSignal }: { tag: string; label: string; dragSignal?: boolean }) {
  const { state, dispatch } = useInstrument()
  const { min, max } = AXIS_RANGES[tag]
  const v = state.defaults.axes[tag]
  // While this slider is held, GEOM-swap flashes hold their zone color (live map)
  // and only fade on release. Window-level pointerup ends it even if released
  // outside the thumb; keyboard changes don't set it (they read as instant jumps).
  const onRangePointerDown = dragSignal
    ? () => {
        dispatch({ type: 'setGeomDragging', value: true })
        const up = () => { dispatch({ type: 'setGeomDragging', value: false }); window.removeEventListener('pointerup', up) }
        window.addEventListener('pointerup', up)
      }
    : undefined
  return (
    <AxisSlider
      label={label}
      tag={tag}
      value={v}
      min={min}
      max={max}
      step={tag === 'ital' ? 0.01 : 1}
      variant="diamond"
      reference={state.shipped[tag]}
      onRangePointerDown={onRangePointerDown}
      onChange={val => dispatch({ type: 'setDefaultAxis', tag, value: val as number })}
    />
  )
}

// Down chevron for the descent seams. Both seams point down: clicking the holo one
// travels down into the matrix; clicking the muted one pushes the matrix back down.
function SeamChevron() {
  return (
    <svg className="rail-seam-chv" viewBox="0 0 22 10" aria-hidden="true">
      <path d="M1 1.5 11 8.5 21 1.5" fill="none" stroke="currentColor" strokeWidth="2.2"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function Rail({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { state, dispatch } = useInstrument()
  // Descent: 0 = tune (ReCal Builder) · 1 = Type Matrix · 2 = Freezer · 3 = Vertical Metrics.
  // Lives in the store so the canvas can swap to the metrics preview on group 3.
  const group = state.railGroup
  const [leaving, setLeaving] = useState(false)
  const [dir, setDir] = useState<'fwd' | 'back'>('fwd')
  // Descend (down-seam): current slides up + out, next rides up from below.
  // Ascend (up-seam): the opposite — current slides down + out, next comes from above.
  const go = (i: number, d: 'fwd' | 'back') => { setDir(d); setLeaving(true); setTimeout(() => { dispatch({ type: 'setRailGroup', group: i }); setLeaving(false) }, 150) }
  const tag = TAG_TEXT[stateTag(state)]
  // ⌘Z / ⇧⌘Z — undo/redo ◆ edits (matrix drags snapshot on grab). Ignored in text fields.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      e.preventDefault()
      dispatch({ type: e.shiftKey ? 'redo' : 'undo' })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dispatch])
  // Collapsed (narrow window): a strip showing just the label; clicking it expands.
  // Otherwise it's the normal rail; touching it enters EDIT as before.
  return (
    <div className={`rail${state.recalMode === 'demo' ? ' rail--demo' : ''}${collapsed ? ' rail--collapsed' : ''}`}
      onPointerDown={() => { if (!collapsed && state.recalMode !== 'edit') dispatch({ type: 'setRecalMode', mode: 'edit' }) }}
      onClick={collapsed ? onToggle : undefined}>
      <div className="rail-collapsed-label">ReCal Builder</div>
      <div className="rail-header">
        <div className="rail-header-top">
          <div className="rail-title">ReCal Builder</div>
          <button className="rail-reset" title="Reset all defaults to original Cal Sans"
            disabled={!defaultsDirty(state)}
            onClick={() => dispatch({ type: 'resetDefaults' })}>Reset</button>
        </div>
        <div className="rail-sub">◆ your defaults — baked into the export</div>
      </div>

      <div key={group} className={`rail-descent rail-descent--${dir}${leaving ? ' rail-descent--leaving' : ''}`}>
      {group === 0 && (<>
      <div className="rail-group">
        <div className="rail-group-label">Start from</div>
        <select className="rail-preset" value={state.activePreset ?? ''}
          onChange={e => {
            const p = PRESETS.find(x => x.name === e.target.value)
            if (p) applyPreset(dispatch, p)
            else dispatch({ type: 'resetDefaults' })
          }}>
          <option value="">Cal Sans (default)</option>
          {PRESETS.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
        </select>
      </div>

      <div className="rail-group">
        <div className="rail-group-label">Geometric form</div>
        <div className="zone-chips">
          {ZONES.map(z => {
            const on = nearestZoneLabel(state.defaults.axes.GEOM) === z.label
            return (
              <button key={z.label}
                className={`zone-chip${on ? ' on' : ''}`}
                style={on ? { background: z.color } : { color: z.color }}
                data-label={z.label}
                onClick={() => {
                  dispatch({ type: 'setDefaultAxis', tag: 'GEOM', value: z.geom })
                  dispatch({ type: 'clearPreview' })
                }}>
                <span>{z.label}</span>
              </button>
            )
          })}
        </div>
        <Pin tag="GEOM" label="GEOM" dragSignal />
      </div>

      <div className="rail-group">
        <div className="rail-group-head">
          <span className="rail-group-label">Optical</span>
          <label className="rail-toggle">
            <input type="checkbox" checked={state.defaults.freezeOpsz}
              onChange={e => dispatch({ type: 'setFreezeOpsz', value: e.target.checked })} />
            Freeze opsz
          </label>
        </div>
        {/* Optical size — only meaningful when frozen: off = the browser scales opsz to
            size (auto); on = pin the opsz axis to this value for a fixed display size. */}
        {/* opsz uses the canonical allowAuto affordance: field shows "auto" until you
            edit it (type a value to freeze, `a` to go auto); the Freeze checkbox stays
            in sync. Diamond thumb + burned stock reference like the other rail axes. */}
        <AxisSlider
          label="Optical size"
          tag="opsz"
          value={state.defaults.freezeOpsz ? (state.defaults.frozenOpszValue ?? 14) : 'auto'}
          min={AXIS_RANGES.opsz.min}
          max={AXIS_RANGES.opsz.max}
          step={1}
          allowAuto
          autoValue={state.defaults.frozenOpszValue ?? 14}
          variant="diamond"
          disabled={!state.defaults.freezeOpsz}
          reference={state.shipped.opsz}
          onChange={val => {
            if (val === 'auto') { dispatch({ type: 'setFreezeOpsz', value: false }) }
            else { dispatch({ type: 'setFreezeOpsz', value: true }); dispatch({ type: 'setFrozenOpszValue', value: val }) }
          }}
        />
        <div className="pin">
          <div className="pin-head"><span className="pin-label">Optical scale</span>
            <span className="pin-val tnum">{state.defaults.opszMultiplier}×</span></div>
          <div className="stepper">
            {[1, 2, 3, 4, 5, 6].map(n => (
              <button key={n} className={state.defaults.opszMultiplier === n ? 'on' : ''}
                onClick={() => dispatch({ type: 'setOpszMultiplier', value: n })}>{n}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="rail-group">
        <div className="rail-group-label">Weight &amp; slant</div>
        <Pin tag="wght" label="Weight" />
      </div>

      <div className="rail-group">
        <div className="rail-group-label">Parametric</div>
        <Pin tag="YTAS" label="Ascender" />
        <Pin tag="SHRP" label="Sharp" />
      </div>

      <div className="rail-group">
        <div className="rail-group-label">Construction</div>
        <label className="rail-toggle">
          <input type="checkbox" checked={state.useHoi}
            onChange={e => dispatch({ type: 'setUseHoi', value: e.target.checked })} />
          HOI interpolation
        </label>
        <label className="rail-toggle">
          <input type="checkbox" checked={state.defaults.autoAscender}
            onChange={e => dispatch({ type: 'setAutoAscender', value: e.target.checked })} />
          Auto ascender (YTAS tracks opsz)
        </label>
      </div>

      <button className="rail-seam rail-seam--down" onClick={() => go(1, 'fwd')}>
        <span className="rail-seam-lbl"><span className="rail-seam-chv-t">V</span>TYPE MATRIX<span className="rail-seam-chv-t">V</span></span>
      </button>
      </>)}

      {group === 1 && (
      <div className="rail-matrix">
        <button className="rail-seam rail-seam--up" onClick={() => go(0, 'back')}>
          <span className="rail-seam-lbl"><span className="rail-seam-chv-t">V</span>TYPE MATRIX<span className="rail-seam-chv-t">V</span></span>
        </button>
        <Matrix />
        <button className="rail-seam rail-seam--down" onClick={() => go(2, 'fwd')}>
          <span className="rail-seam-lbl"><span className="rail-seam-chv-t">V</span>FREEZER<span className="rail-seam-chv-t">V</span></span>
        </button>
      </div>
      )}

      {group === 2 && (
      <div className="rail-freezer">
        <button className="rail-seam rail-seam--up" onClick={() => go(1, 'back')}>
          <span className="rail-seam-lbl"><span className="rail-seam-chv-t">V</span>FREEZER<span className="rail-seam-chv-t">V</span></span>
        </button>
        <Freezer />
        <button className="rail-seam rail-seam--down" onClick={() => go(3, 'fwd')}>
          <span className="rail-seam-lbl"><span className="rail-seam-chv-t">V</span>VERTICAL METRICS<span className="rail-seam-chv-t">V</span></span>
        </button>
      </div>
      )}

      {group === 3 && (
      <div className="rail-vmetrics">
        <button className="rail-seam rail-seam--up" onClick={() => go(2, 'back')}>
          <span className="rail-seam-lbl"><span className="rail-seam-chv-t">V</span>VERTICAL METRICS<span className="rail-seam-chv-t">V</span></span>
        </button>
        <VMetricsPanel ytasPin={<Pin tag="YTAS" label="Ascender" />} />
        {/* Vertical Metrics is the last section — no down-seam (its rule + chevrons removed).
            Restore this button if a section is ever added below it.
        <button className="rail-seam rail-seam--down" onClick={() => go(0, 'fwd')} title="Back to square one">
          <span className="rail-seam-lbl"><span className="rail-seam-chv-t">V</span><span className="rail-seam-chv-t">V</span></span>
        </button> */}
      </div>
      )}
      </div>{/* /rail-descent */}

      {/* YOUR ◆ state tag — hidden for now
      <div className="rail-footer">
        <span className="state-tag" style={{ color: tag.color }}>{tag.label}</span>
      </div>
      */}
    </div>
  )
}

// Mode label, below the scene tabs (left). Reads the CURRENT mode; throbs in EDIT.
// Modes switch by touching the trays (rail → EDIT, play → DEMO); leaving EDIT plays
// a save animation (spinning throbber → green check).
function ModeLabel() {
  const { state } = useInstrument()
  const prev = useRef(state.recalMode)
  const [saving, setSaving] = useState<'spin' | 'check' | null>(null)
  useEffect(() => {
    const leaving = prev.current === 'edit' && state.recalMode === 'demo'
    prev.current = state.recalMode
    // Any non-leaving change (esp. re-entering EDIT mid-animation) resets the label,
    // so the save spinner can never get stranded when the timers are cleaned up.
    if (!leaving) { setSaving(null); return }
    setSaving('spin')
    const t1 = setTimeout(() => setSaving('check'), 650)
    const t2 = setTimeout(() => setSaving(null), 1400)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [state.recalMode])

  // Preview recompile (opsz / threshold edits): same throbber → checkmark spot, so
  // the Pyodide rebuild latency reads as "working" instead of a dead control.
  const [rebuild, setRebuild] = useState<'spin' | 'check' | null>(null)
  const wasRebuilding = useRef(false)
  useEffect(() => {
    if (state.rebuilding) { setRebuild('spin'); wasRebuilding.current = true; return }
    if (!wasRebuilding.current) return
    wasRebuilding.current = false
    setRebuild('check')
    const t = setTimeout(() => setRebuild(null), 1100)
    return () => clearTimeout(t)
  }, [state.rebuilding])

  // Rebuild feedback wins the label while active; otherwise the save animation; else mode.
  const phase = rebuild ? { kind: rebuild, spin: 'Rebuilding…', check: 'Updated' }
    : saving ? { kind: saving, spin: 'Saving…', check: 'Saved' } : null
  const editing = state.recalMode === 'edit'
  return (
    <div className={`mode-label${phase ? '' : ' mode-label--throb'}${editing ? ' mode-label--edit' : ''}`}>
      {phase?.kind === 'spin' ? <><span className="mode-throb" aria-hidden /> {phase.spin}</>
        : phase?.kind === 'check' ? <span className="mode-check">✓ <span className="mc-word">{phase.check}</span></span>
          : editing ? 'EDIT ReCal Mode' : 'DEMO ReCal Mode'}
    </div>
  )
}

// ── Canvas: top bar + (stage / scene controls / play), with the Font info overlay
// covering everything below the top bar. ─────────────────────────────────────────
// Floating TYPE panel — viewport/render controls (not baked axes), so they live in
// their own HUD rather than the ● play bar. Each scene shows only the rows it uses.
const TYPE_ROWS: Record<string, string[]> = {
  words: ['size', 'tracking', 'leading'],
  paragraph: ['size', 'tracking', 'leading', 'measure'],
  scale: ['tracking', 'leading', 'measure'],
}
const TYPE_PANEL_POS_KEY = 'recal-type-panel-pos'

// Paragraph style menu — pick which style (H1/H2/H3/P) the controls target.
function StyleMenu({ active, setActive, paraStyles }: {
  active: ParaStyleKey; setActive: (k: ParaStyleKey) => void; paraStyles: ParaStyles
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDoc = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', onDoc)
    return () => document.removeEventListener('pointerdown', onDoc)
  }, [open])
  return (
    <div className="style-menu" ref={ref}>
      <button className="style-menu-btn" onClick={() => setOpen(o => !o)}>
        {PARA_STYLE_LABEL[active]}<span className="style-menu-caret">▾</span>
      </button>
      {open && (
        <div className="style-menu-list">
          {/* migrated to shared StyleScopeList (wm-primitives) */}
          <StyleScopeList
            inline
            mode="single"
            onSelect={k => setActive(k as ParaStyleKey)}
            onPicked={() => setOpen(false)}
            rows={PARA_STYLE_ORDER.map(k => {
              const s = paraStyles[k]
              return {
                id: k,
                label: PARA_STYLE_LABEL[k],
                chips: [
                  { text: `${Math.round(s.size)}px`, kind: 'size' as const },
                  { text: `wght ${s.wght}`, kind: 'axis' as const },
                ],
                selected: k === active,
              }
            })}
          />
        </div>
      )}
    </div>
  )
}

// Scale tier menu — MULTI-select which Tailwind tiers the controls target. Sizes are
// fixed (Tailwind), so the checked tiers only receive tracking/leading (+ axes later).
function TierMenu({ selected, toggle, scaleStyles }: {
  selected: Set<string>; toggle: (k: string) => void; scaleStyles: ScaleStyles
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDoc = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', onDoc)
    return () => document.removeEventListener('pointerdown', onDoc)
  }, [open])
  const n = selected.size
  const label = n === 0 ? 'No tiers' : n === 1 ? [...selected][0] : `${n} tiers`
  return (
    <div className="style-menu" ref={ref}>
      <button className="style-menu-btn" onClick={() => setOpen(o => !o)}>
        {label}<span className="style-menu-caret">▾</span>
      </button>
      {open && (
        <div className="style-menu-list style-menu-list--scroll">
          {/* migrated to shared StyleScopeList (wm-primitives), multi-select */}
          <StyleScopeList
            inline
            mode="multi"
            onSelect={k => toggle(k)}
            rows={SCALE_TIERS.map(t => {
              const st = scaleStyles[t.key]
              return {
                id: t.key,
                label: t.key,
                chips: [
                  ...(st && st.tracking !== 0
                    ? [{ text: `${st.tracking > 0 ? '+' : ''}${nbMinus(st.tracking)}`, kind: 'tracking' as const }]
                    : []),
                  { text: `${t.px}px`, kind: 'size' as const },
                ],
                selected: selected.has(t.key),
              }
            })}
          />
        </div>
      )}
    </div>
  )
}

function TypePanel({ mode, size, setSize, tracking, setTracking, leading, setLeading, measure, setMeasure, activeParaStyle, setActiveParaStyle, paraStyles, selectedTiers, toggleTier, scaleStyles, textAlign, setTextAlign, swissRag, setSwissRag, fit, setFit }: {
  mode: SceneMode
  size: number; setSize: (n: number) => void
  tracking: number; setTracking: (n: number) => void
  leading: number; setLeading: (n: number) => void
  measure: number; setMeasure: (n: number) => void
  activeParaStyle: ParaStyleKey; setActiveParaStyle: (k: ParaStyleKey) => void; paraStyles: ParaStyles
  selectedTiers: Set<string>; toggleTier: (k: string) => void; scaleStyles: ScaleStyles
  textAlign: string; setTextAlign: (a: string) => void
  swissRag: boolean; setSwissRag: (on: boolean) => void
  fit: Partial<FitOptions>; setFit: (f: Partial<FitOptions>) => void
}) {
  const rows = TYPE_ROWS[mode] ?? []
  // Draggable by the header. Position persists across sessions; free-drag against the
  // ref + commit on release (per the spec's drag rules — no re-render mid-drag).
  const panelRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ dx: number; dy: number } | null>(null)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(() => {
    try { const s = JSON.parse(localStorage.getItem(TYPE_PANEL_POS_KEY) || 'null'); return (s && typeof s.x === 'number') ? s : null } catch { return null }
  })
  if (!rows.length) return null
  const has = (k: string) => rows.includes(k)

  const clamp = (v: number, max: number) => Math.min(Math.max(v, 8), Math.max(8, max - 8))
  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const r = panelRef.current!.getBoundingClientRect()
    dragRef.current = { dx: e.clientX - r.left, dy: e.clientY - r.top }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = panelRef.current, drag = dragRef.current
    if (!el || !drag) return
    el.style.left = `${clamp(e.clientX - drag.dx, window.innerWidth - el.offsetWidth)}px`
    el.style.top = `${clamp(e.clientY - drag.dy, window.innerHeight - el.offsetHeight)}px`
    el.style.right = 'auto'
  }
  const onUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = panelRef.current
    if (!dragRef.current || !el) return
    dragRef.current = null
    e.currentTarget.releasePointerCapture(e.pointerId)
    const next = { x: parseFloat(el.style.left) || 0, y: parseFloat(el.style.top) || 0 }
    setPos(next)
    try { localStorage.setItem(TYPE_PANEL_POS_KEY, JSON.stringify(next)) } catch { /* ignore */ }
  }

  // Clamp the persisted position into the viewport every render, so a position saved on
  // a wider window can never leave the panel stranded off-screen on a narrower one.
  const clamped = pos ? {
    x: Math.min(Math.max(pos.x, 8), Math.max(8, window.innerWidth - 186)),
    y: Math.min(Math.max(pos.y, 8), Math.max(8, window.innerHeight - 60)),
  } : null
  return (
    <div ref={panelRef} className="type-panel"
      style={clamped ? { left: clamped.x, top: clamped.y, right: 'auto' } : undefined}>
      <div className="type-panel-title" onPointerDown={onDown} onPointerMove={onMove}
        onPointerUp={onUp} onPointerCancel={onUp}>Type</div>
      {mode === 'paragraph' && (
        <StyleMenu active={activeParaStyle} setActive={setActiveParaStyle} paraStyles={paraStyles} />
      )}
      {mode === 'scale' && (
        <TierMenu selected={selectedTiers} toggle={toggleTier} scaleStyles={scaleStyles} />
      )}
      {/* Proofing controls (not ◆ defaults) → default AxisSlider variant, matching
          font-proofer's TYPOGRAPHY. No diamond/marker/reference. */}
      {has('size') && (
        <AxisSlider label="size" value={size} min={16} max={200} step={1} suffix="px" onChange={v => setSize(v as number)} />
      )}
      {has('tracking') && (
        <AxisSlider label="tracking" value={tracking} min={-10} max={30} step={1} suffix="%" onChange={v => setTracking(v as number)} />
      )}
      {has('leading') && (
        <AxisSlider label="leading" value={leading} min={0.8} max={2.5} step={0.1} onChange={v => setLeading(v as number)} />
      )}
      {has('measure') && (
        <AxisSlider label="measure" value={measure} min={16} max={52} step={1} suffix="em" onChange={v => setMeasure(v as number)} />
      )}
      {/* Alignment and line fitting, from wm-primitives — the same controls font-proofer
          renders in its sidebar. Only the placement is ours. */}
      {mode === 'paragraph' && (
        <>
          <div className="type-panel-aligns">
            <AlignmentButtons value={textAlign} onChange={setTextAlign} />
          </div>
          <FittingControls value={fit} onChange={setFit} mode={fittingMode(textAlign, swissRag)}
            swissRag={swissRag} onSwissRag={setSwissRag} />
        </>
      )}
    </div>
  )
}

function Canvas({ size, setSize, tracking, setTracking, leading, setLeading, opszAuto, setOpszAuto, feats, toggleFeat, resetFeats, featStr }: {
  size: number; setSize: (n: number) => void
  tracking: number; setTracking: (n: number) => void
  leading: number; setLeading: (n: number) => void
  opszAuto: boolean; setOpszAuto: (v: boolean) => void
  feats: Set<string>; toggleFeat: (t: string) => void; resetFeats: () => void
  featStr: string
}) {
  const [mode, setMode] = useState<SceneMode>(
    () => SCENES.find(s => s.mode === BOOT.scene)?.mode ?? 'words')
  const [source, setSource] = useState(BOOT.pitch ? 'Compare' : 'Sample')
  const [measure, setMeasure] = useState(34)
  // Line fitting: alignment is a scene-level choice, the rag is a switch on top of it,
  // and the budgets ride along. Same shape as font-proofer, same controls.
  const [textAlign, setTextAlign] = useState('left')
  const [swissRag, setSwissRag] = useState(false)
  const [fit, setFit] = useState<Partial<FitOptions>>(FLATTERSATZ_DEFAULTS)
  const [pairs, setPairs] = useState<Set<string>>(new Set())
  const togglePair = (k: string) => setPairs(s => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n })
  const [glyphSet, setGlyphSet] = useState('All')
  const [showInfo, setShowInfo] = useState(false)
  const ls = `${tracking / 100}em`
  // On the Vertical Metrics rail tab the Words scene swaps for the metrics preview; the
  // other scenes stay themselves (so you can see the metrics' effect in a real paragraph/UI).
  const { state: inst } = useInstrument()
  const vmActive = inst.railGroup === 3 && mode === 'words'

  // Editable per-block paragraph styles + which one the TYPE controls target.
  const [paraStyles, setParaStyles] = useState<ParaStyles>(DEFAULT_PARA_STYLES)
  const [activeParaStyle, setActiveParaStyle] = useState<ParaStyleKey>('p')
  const patchPara = (p: Partial<ParaStyle>) =>
    setParaStyles(s => ({ ...s, [activeParaStyle]: { ...s[activeParaStyle], ...p } }))
  // Per-tier Scale styles + which tier(s) the controls target (multi-select). Sizes
  // stay Tailwind-fixed; only tracking/leading get edited here.
  const [scaleStyles, setScaleStyles] = useState<ScaleStyles>(DEFAULT_SCALE_STYLES)
  const [selectedTiers, setSelectedTiers] = useState<Set<string>>(() => new Set(['text-9xl']))
  const toggleTier = (k: string) => setSelectedTiers(s => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n })
  const patchScale = (p: Partial<ScaleTierStyle>) =>
    setScaleStyles(s => { const n = { ...s }; selectedTiers.forEach(k => { n[k] = { ...n[k], ...p } }); return n })
  // In Paragraph mode the controls target the selected style; in Scale mode they target
  // every selected tier at once (reading the first as the shown value); else global.
  const isPara = mode === 'paragraph'
  const isScale = mode === 'scale'
  const ps = paraStyles[activeParaStyle]
  const firstTier = [...selectedTiers][0] ?? 'text-9xl'
  const sc = scaleStyles[firstTier] ?? { tracking: 0, leading: 1.4 }
  const tSize = isPara ? ps.size : size
  const tSetSize = isPara ? (v: number) => patchPara({ size: v }) : setSize
  const tTracking = isPara ? ps.tracking : isScale ? sc.tracking : tracking
  const tSetTracking = isPara ? (v: number) => patchPara({ tracking: v }) : isScale ? (v: number) => patchScale({ tracking: v }) : setTracking
  const tLeading = isPara ? ps.leading : isScale ? sc.leading : leading
  const tSetLeading = isPara ? (v: number) => patchPara({ leading: v }) : isScale ? (v: number) => patchScale({ leading: v }) : setLeading

  return (
    <div className={`canvas${vmActive ? ' canvas--vm' : ''}`}>
      <div className="canvas-bar">
        <Modebar mode={mode} setMode={setMode} showInfo={showInfo} toggleInfo={() => setShowInfo(v => !v)} />
      </div>
      {/* Mode label + its per-mode submenu share one row, so the submenu appearing/
          disappearing never shifts the label (or stage) vertically. */}
      <div className="mode-row">
        <ModeLabel />
        <SceneControls mode={mode} source={source} setSource={setSource}
          pairs={pairs} togglePair={togglePair}
          glyphSet={glyphSet} setGlyphSet={setGlyphSet} />
      </div>
      {/* UI (COSS) renders the ◆ defaults and manages its own 2D board, so it hides the
          bottom ● preview/DEMO dock and drops the reserved play-bar padding → full height. */}
      <div className={`canvas-body${mode === 'ui' && !vmActive ? ' canvas-body--full' : ''}${vmActive ? ' canvas-body--vm' : ''}`}>
        <div className="stage">
          <div className={`stage-scroll${mode === 'ui' && !vmActive ? ' stage-scroll--flush' : ''}${vmActive ? ' stage-scroll--bleed' : ''}`}>
            {vmActive
              ? <VMetricsScene />
              : <Scene mode={mode} size={size} ls={ls} leading={leading} featStr={featStr}
                  source={source} setSource={setSource} measure={measure} pairs={pairs} glyphSet={glyphSet} opszAuto={opszAuto}
                  paraStyles={paraStyles} scaleStyles={scaleStyles} selectedTiers={selectedTiers}
                  textAlign={textAlign}
                  fit={{ ...fit, mode: fittingMode(textAlign, swissRag), center: textAlign === 'center' }} />}
          </div>
        </div>
        {(mode !== 'ui' || vmActive) && (
          <PreviewSurface
            size={size} setSize={setSize}
            tracking={tracking} setTracking={setTracking}
            leading={leading} setLeading={setLeading}
            feats={feats} toggleFeat={toggleFeat} resetFeats={resetFeats}
            opszAuto={opszAuto} setOpszAuto={setOpszAuto} />
        )}
      </div>
      {!vmActive && <TypePanel mode={mode} size={tSize} setSize={tSetSize} tracking={tTracking} setTracking={tSetTracking}
        leading={tLeading} setLeading={tSetLeading} measure={measure} setMeasure={setMeasure}
        activeParaStyle={activeParaStyle} setActiveParaStyle={setActiveParaStyle} paraStyles={paraStyles}
        selectedTiers={selectedTiers} toggleTier={toggleTier} scaleStyles={scaleStyles}
        textAlign={textAlign} setTextAlign={setTextAlign}
        swissRag={swissRag} setSwissRag={setSwissRag} fit={fit} setFit={setFit} />}
      {/* Anchored to .canvas (not canvas-body) so it aligns to the top of the screen. */}
      {showInfo && <Info />}
    </div>
  )
}

// ── Bottom preview-control surface (●) ────────────────────────────────────────
const DOCK_AXES = ['wght', 'GEOM', 'opsz', 'YTAS', 'SHRP', 'ital'] as const

function PreviewSurface({ size, setSize, tracking, setTracking, leading, setLeading, feats, toggleFeat, resetFeats, opszAuto, setOpszAuto }: {
  size: number; setSize: (n: number) => void
  tracking: number; setTracking: (n: number) => void
  leading: number; setLeading: (n: number) => void
  feats: Set<string>; toggleFeat: (t: string) => void; resetFeats: () => void
  opszAuto: boolean; setOpszAuto: (v: boolean) => void
}) {
  const { state, dispatch } = useInstrument()
  const merged = mergedAxes(state)
  const autoOpsz = opszForSize(size, state.defaults.opszMultiplier)   // handle position when auto
  const canReset = previewDrifted(state) || size !== SIZE_DEFAULT || tracking !== 0 || leading !== 1 || featsDrifted(feats)
  // Bloom on pointer proximity; collapse with a fuzzy threshold — the farther the
  // cursor is above the bar, the faster it folds. Stays open while a child has focus.
  const [open, setOpen] = useState(false)
  const surfRef = useRef<HTMLDivElement>(null)
  const openRef = useRef(open)
  openRef.current = open
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const BAND = 20     // px above the bar that counts as "at" the bar → stay open (t=0 here)
    const FAR = 200     // px above where collapse is immediate (t=1 here)
    const MAX_DELAY = 650
    const onMove = (e: PointerEvent) => {
      const surf = surfRef.current
      if (!surf) return
      // Hovering the floating download dock (OFL + Download, bottom-right over the
      // canvas) collapses the preview so it doesn't cover the pill.
      if (e.target instanceof Element && e.target.closest('.dock-download')) {
        clearTimeout(timer)
        if (openRef.current) setOpen(false)
        return
      }
      // Over the left rail (e.g. reaching the bottom seam buttons) — never bloom the dock;
      // the rail overlaps the bar's full width, so the south edge shouldn't trigger it.
      if (e.target instanceof Element && e.target.closest('.rail')) return
      const rect = surf.getBoundingClientRect()
      const focused = surf.contains(document.activeElement)
      // Open ONLY when actually over the bar (no preemptive proximity bloom — the
      // glyph-set tabs sit right above it). Once open, the BAND is just hysteresis.
      if (focused || e.clientY >= rect.top) {
        clearTimeout(timer)
        if (!openRef.current) setOpen(true)
        return
      }
      if (!openRef.current) return
      const dist = rect.top - e.clientY
      if (dist <= BAND) { clearTimeout(timer); return }       // stay open within band
      const t = Math.min(1, (dist - BAND) / (FAR - BAND))
      const delay = Math.round(MAX_DELAY * Math.exp(-t / 0.2))  // exponential falloff (e-fold 0.2)
      clearTimeout(timer)
      timer = setTimeout(() => {
        const s = surfRef.current
        if (s && !s.contains(document.activeElement)) setOpen(false)
      }, delay)
    }
    window.addEventListener('pointermove', onMove)
    return () => { window.removeEventListener('pointermove', onMove); clearTimeout(timer) }
  }, [])
  return (
    <div ref={surfRef} className={`preview-surface${open ? ' open' : ''}${state.recalMode === 'edit' ? ' preview-surface--dim' : ''}`}
      onFocusCapture={() => setOpen(true)}
      onPointerDown={() => state.recalMode !== 'demo' && dispatch({ type: 'setRecalMode', mode: 'demo' })}>
      <div className="preview-surface-head">
        <span className={`preview-surface-cap${open ? '' : ' preview-surface-cap--collapsed'}`}>
          <span className="preview-dot" aria-hidden="true" />Preview
        </span>
        {open && (
          <button className="preview-reset" disabled={!canReset} title="Reset preview"
            onClick={() => { dispatch({ type: 'clearPreview' }); setSize(SIZE_DEFAULT); setTracking(0); setLeading(1); setOpszAuto(true); resetFeats() }}>
            <ResetIcon /><span className="preview-reset-text">Reset Preview</span>
          </button>
        )}
      </div>
      <div className="preview-body">
        <div className="play-group">
          <span className="play-group-label">Axes</span>
          <div className="preview-rows">
            {DOCK_AXES.map(tag => {
              const { min, max } = AXIS_RANGES[tag]
              const on = tag in state.preview
              const v = merged[tag]
              // Compare mode: gray out axes the referent font can't express. A static
              // SVG specimen (no live font) grays everything; a live webfont keeps
              // wght (font-weight), ital only if real italics exist, opsz only if the
              // referent has the axis; GEOM/YTAS/SHRP are Cal Sans-only.
              const cmp = state.compareOn ? state.compare : null
              const na = !!cmp && (!!cmp.svg || !cmp.css ||
                !(tag === 'wght' || (tag === 'ital' && cmp.italic) || (tag === 'opsz' && !!cmp.opszRange)))
              if (tag === 'opsz') {
                // opsz-auto: handle tracks the sample size; value reads "auto".
                // Moving the handle disengages auto and reports the number.
                return (
                  <div className={`prow${on && !opszAuto ? ' on' : ''}${na ? ' prow--na' : ''}`} key={tag}>
                    <div className="prow-head">
                      <span className="prow-label">opsz
                        <label className="opsz-auto">auto
                          <input type="checkbox" checked={opszAuto} disabled={na} onChange={e => setOpszAuto(e.target.checked)} /></label>
                      </span>
                      <span className="prow-val tnum">{na ? '—' : opszAuto ? 'auto' : Math.round(v)}</span>
                    </div>
                    <input type="range" min={min} max={max} step={1} value={opszAuto ? autoOpsz : v} disabled={na}
                      onChange={e => { setOpszAuto(false); dispatch({ type: 'setPreview', tag: 'opsz', value: +e.target.value }) }} />
                  </div>
                )
              }
              return (
                <AxisSlider
                  key={tag}
                  variant="skeletal"
                  label={tag}
                  value={v}
                  min={min}
                  max={max}
                  step={tag === 'ital' ? 0.01 : 1}
                  disabled={na}
                  onChange={val => dispatch({ type: 'setPreview', tag, value: val as number })}
                />
              )
            })}
          </div>
        </div>

        <div className="play-opentype">
          <div className="play-group">
            <span className="play-group-label">Features</span>
            <div className="feature-chips">
              {FEATURE_CHIPS.map(f => (
                <button key={f.tag} data-label={f.label} className={`chip${feats.has(f.tag) ? ' on' : ''}`} title={f.tag}
                  onClick={() => toggleFeat(f.tag)}>{f.label}</button>
              ))}
            </div>
          </div>
          <div className="play-group">
            <span className="play-group-label">Sets</span>
            <div className="feature-chips ss-chips">
              {SS_FEATURES.map(f => (
                <button key={f.tag} data-label={f.tag} className={`chip${feats.has(f.tag) ? ' on' : ''}`}
                  title={`${f.tag} · ${f.name}`} aria-label={`${f.tag} ${f.name}`}
                  onClick={() => toggleFeat(f.tag)}>{f.tag}</button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Download dock — a floating OFL + Download pill (no full-width floor). ─────────
function DownloadDock({ engine }: { engine: ReturnType<typeof useFontEngine> }) {
  const { state } = useInstrument()
  const [oflAgreed, setOflAgreed] = useState(false)
  const dockRef = useRef<HTMLDivElement>(null)

  // The exact export config for the current ◆ (deterministic → cacheable). Kept in a
  // ref so the pointer-vector listener always speculates on the latest config.
  const buildConfig = () => {
    const d = state.defaults
    return {
      axisDefaults: Object.fromEntries(Object.entries(d.axes).filter(([t]) => t !== 'opsz')),
      opszMultiplier: d.opszMultiplier,
      freezeOpsz: d.freezeOpsz,
      frozenOpszValue: d.frozenOpszValue,
      autoAscender: d.autoAscender,
      thresholds: d.glyphThresholds,
      frozenFeatures: d.frozenFeatures,
      vmetrics: d.vmetrics,
    }
  }
  const cfgRef = useRef(buildConfig)
  cfgRef.current = buildConfig
  // force = definitive intent (OFL / hovering the download) — bakes even during a
  // preview rebuild. Passive pointer-vectoring stays un-forced.
  const prefetch = (force = false) => engine.prebake(cfgRef.current(), force)

  // "Load the room behind the door": when the pointer is heading toward the download
  // pill (aligned velocity + within reach), speculatively bake the export so the click
  // is instant. 9/10 people check the OFL box first, which also prefetches — this just
  // buys even more lead time.
  useEffect(() => {
    let px = 0, py = 0, vx = 0, vy = 0, last = 0
    const onMove = (e: PointerEvent) => {
      if (last) {
        const a = Math.min(1, (e.timeStamp - last) / 80)   // EMA on velocity
        vx = vx * (1 - a) + (e.clientX - px) * a
        vy = vy * (1 - a) + (e.clientY - py) * a
      }
      px = e.clientX; py = e.clientY; last = e.timeStamp
      const dock = dockRef.current; if (!dock) return
      const r = dock.getBoundingClientRect()
      const tx = r.left + r.width / 2 - px, ty = r.top + r.height / 2 - py
      const dist = Math.hypot(tx, ty), speed = Math.hypot(vx, vy)
      // within reach, moving fast enough, and aimed at the pill (cosine > 0.6)
      if (dist < 460 && speed > 1.2 && (vx * tx + vy * ty) / (speed * dist || 1) > 0.6) prefetch(false)
    }
    window.addEventListener('pointermove', onMove)
    return () => window.removeEventListener('pointermove', onMove)
  }, [])

  // Bake the ◆ defaults into a TTF (instant if already pre-baked) and trigger download.
  const doDownload = async () => {
    const ttf = await engine.download(cfgRef.current())
    const url = URL.createObjectURL(new Blob([new Uint8Array(ttf)], { type: 'font/ttf' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${(state.buildName || 'ReCal Sans').trim() || 'ReCal Sans'}.ttf`
    a.click()
    URL.revokeObjectURL(url)
  }

  // One-shot holo (+ ital lean) over the "Download" letters when the export first becomes
  // downloadable. In dev the Pyodide worker often never boots (stuck on "Preparing engine…"),
  // so once OFL is ticked we FAKE-ready the button — clicking replays the flourish — to
  // preview the animation without the engine. This never fakes a bake (doDownload needs ready).
  const [holoKey, setHoloKey] = useState(0)
  const playHolo = () => setHoloKey(k => k + 1)
  const devFake = import.meta.env.DEV && oflAgreed && !engine.ready && !engine.building
  const showDownload = engine.ready || devFake
  const wasReady = useRef(false)
  useEffect(() => { if (showDownload && !wasReady.current) playHolo(); wasReady.current = showDownload }, [showDownload])

  const label = engine.building ? 'Building…'
    : (engine.started && !showDownload) ? 'Preparing engine…'
    : 'Download'

  return (
    <div className="dock-download" ref={dockRef} onPointerEnter={() => prefetch(true)}>
      {engine.error && (
        <span className="dock-error" title={engine.error}>export failed — see console</span>
      )}
      <label className="floor-toggle">
        <input type="checkbox" checked={oflAgreed}
          onChange={e => { setOflAgreed(e.target.checked); if (e.target.checked) prefetch(true) }} />
        I accept the{' '}
        <a href="https://openfontlicense.org/open-font-license-official-text/"
          target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>OFL 1.1</a>
      </label>
      <button className="floor-btn floor-btn--primary"
        disabled={!oflAgreed || engine.building || (!engine.ready && !devFake)}
        onPointerEnter={() => prefetch(true)}
        onClick={() => { if (engine.ready) doDownload(); else if (devFake) playHolo() }}
        title={!oflAgreed ? 'Accept the OFL to enable download'
          : !engine.ready ? 'Loading the font engine (first time ~10–20s)…' : 'Download your ReCal Sans TTF'}>
        {engine.building
          ? <span className="holo-loading">Building…</span>
          : <span key={holoKey} className={holoKey > 0 ? 'holo-once' : ''}
              onAnimationEnd={e => { if (e.animationName === 'holo-once-ital') e.currentTarget.classList.remove('holo-once') }}>{label}</span>}
      </button>
    </div>
  )
}

// The rail auto-collapses only on genuinely narrow windows (independent of edit/demo
// mode); above this it stays open. Clicking the collapsed strip expands it.
const RAIL_NARROW = '(max-width: 800px)'

export default function Shell() {
  const { state, dispatch } = useInstrument()
  // Deep-link boot: ?preset=Poppins or a fused landing page's window.__RECAL_BOOT
  // auto-applies a preset. Case-insensitive; unknown values are ignored. Referents
  // that are NOT presets (e.g. Gotham) resemble themselves via raw BOOT.axes instead.
  useEffect(() => {
    const want = BOOT.preset
    const p = want && PRESETS.find(x => x.name.toLowerCase() === want.toLowerCase())
    if (p) { applyPreset(dispatch, p); return }
    if (BOOT.axes) {
      for (const [tag, value] of Object.entries(BOOT.axes)) dispatch({ type: 'setDefaultAxis', tag, value })
      if (BOOT.freezeOpsz != null) {
        dispatch({ type: 'setFreezeOpsz', value: true })
        dispatch({ type: 'setFrozenOpszValue', value: BOOT.freezeOpsz })
      }
    }
  }, [dispatch])
  // Lazy-load the referent webfont the first time Compare is turned on — the
  // stylesheet URL rides BOOT.compare.css, injected once, so pure-preview visitors
  // never fetch Google Fonts / the Adobe kit.
  useEffect(() => {
    const css = state.compareOn && state.compare?.css
    if (!css || document.querySelector(`link[data-compare-font="${css}"]`)) return
    const l = document.createElement('link')
    l.rel = 'stylesheet'; l.href = css; l.dataset.compareFont = css
    document.head.appendChild(l)
  }, [state.compareOn, state.compare])
  // Fused SEO landing pages put an article below the 100vh shell; fade the fixed
  // panels (TYPE, download dock) out once the app is mostly scrolled away. The
  // root app page never scrolls, so this never fires there.
  useEffect(() => {
    const on = () => document.body.classList.toggle('past-app', window.scrollY > window.innerHeight * 0.6)
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])
  const [size, setSize] = useState(SIZE_DEFAULT)
  const [tracking, setTracking] = useState(0)
  const [leading, setLeading] = useState(1)
  const [opszAuto, setOpszAuto] = useState(true)
  // Size-only: collapse when the window is narrow, pop open when it grows past 660px.
  const [railCollapsed, setRailCollapsed] = useState(() => window.matchMedia(RAIL_NARROW).matches)
  useEffect(() => {
    const mq = window.matchMedia(RAIL_NARROW)
    const on = (e: MediaQueryListEvent) => setRailCollapsed(e.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  // OpenType feature chips are global preview controls — they live in the play bar
  // and apply to every scene's text.
  const [feats, setFeats] = useState<Set<string>>(new Set(FEATS_DEFAULT))
  // Frozen ss/cv (the ◆ freezer) render live too — union them into the specimen's
  // feature string so the preview shows exactly what the bake will fuse into the default.
  const activeFeats = [...new Set([...feats, ...state.defaults.frozenFeatures])]
  const featStr = ["'rclt' 1", ...activeFeats.map(t => `'${t}' 1`)].join(', ')
  const toggleFeat = (t: string) => setFeats(s => { const n = new Set(s); n.has(t) ? n.delete(t) : n.add(t); return n })
  const resetFeats = () => setFeats(new Set(FEATS_DEFAULT))

  // Entering EDIT resets all preview view-state to the ◆ default look (the store
  // clears the ● axis preview; here we reset the local size/tracking/leading/opsz/feats).
  const prevMode = useRef(state.recalMode)
  useEffect(() => {
    if (state.recalMode === 'edit' && prevMode.current !== 'edit') {
      setSize(SIZE_DEFAULT); setTracking(0); setLeading(1); setOpszAuto(true); resetFeats()
    }
    prevMode.current = state.recalMode
  }, [state.recalMode])

  // ── Live CalSansPreview rebuild ──────────────────────────────────────────────
  // The rebuild-only ◆ edits (opsz-axis rescale, FeatureVariations thresholds) can't
  // be shown by CSS on the raw font, so rebuild a CalSansPreview face and point the
  // specimens at it. Only fires when ◆ actually differs from stock, so pure-viewing
  // at defaults never loads Pyodide.
  const engine = useFontEngine(state.useHoi)
  const { rebuildPreview, clearPreviewFont } = engine
  // Surface the preview recompile state in the store so ModeLabel can show the
  // throbber/checkmark during the (opsz/threshold) Pyodide rebuild latency.
  useEffect(() => { dispatch({ type: 'setRebuilding', value: engine.rebuilding }) }, [engine.rebuilding, dispatch])
  // Boot Pyodide (both workers) — it IS the point of the customizer, so start its ~8s
  // cold load immediately on mount so it overlaps the user orienting, not their first
  // click. On the bare customizer we load eagerly; on the SEO/compare landing pages
  // (BOOT.pitch set) visitors are mostly just looking, so there we defer to first rail
  // interaction. init() is idempotent.
  const warmEngine = engine.init
  useEffect(() => {
    if (!BOOT.pitch) { warmEngine(); return }         // customizer → eager
    const rail = document.querySelector('.rail')       // landing page → on first touch
    if (!rail) return
    const warm = () => {
      warmEngine()
      rail.removeEventListener('pointerenter', warm)
      rail.removeEventListener('pointerdown', warm)
    }
    rail.addEventListener('pointerenter', warm)
    rail.addEventListener('pointerdown', warm)
    return () => {
      rail.removeEventListener('pointerenter', warm)
      rail.removeEventListener('pointerdown', warm)
    }
  }, [warmEngine])
  const d = state.defaults
  // opsz FREEZE is applied live via CSS now (opszCss in the scenes) — it no longer
  // needs a Pyodide rebuild. Only the SCALER relabel, threshold (matrix) edits, and
  // auto-ascender still require the worker.
  const needsRebuild = d.opszMultiplier !== 1 || glyphsEditedCount(state) > 0 || d.autoAscender
  useEffect(() => {
    const t = setTimeout(() => {
      if (needsRebuild) rebuildPreview({ thresholds: d.glyphThresholds, opszMultiplier: d.opszMultiplier, freezeOpsz: d.freezeOpsz, frozenOpszValue: d.frozenOpszValue, autoAscender: d.autoAscender })
      else clearPreviewFont()
    }, 250)
    return () => clearTimeout(t)
  }, [needsRebuild, d.opszMultiplier, d.glyphThresholds, d.freezeOpsz, d.frozenOpszValue, d.autoAscender, state.useHoi, rebuildPreview, clearPreviewFont])

  // Real Cal Sans italic/bold for the emphasis-bubble labels — same axes renderInline uses.
  const emphItalVs = renderVarSettings({ ...effectiveAxes(state), ital: 1 }, {})
  const emphBoldVs = renderVarSettings({ ...effectiveAxes(state), wght: 700 }, {})
  return (
    <div className={`shell${state.recalMode === 'demo' ? ' shell--demo' : ''}${railCollapsed ? ' shell--rail-collapsed' : ''}`}>
      <Rail collapsed={railCollapsed} onToggle={() => setRailCollapsed(c => !c)} />
      <Canvas
        size={size} setSize={setSize}
        tracking={tracking} setTracking={setTracking}
        leading={leading} setLeading={setLeading}
        opszAuto={opszAuto} setOpszAuto={setOpszAuto}
        feats={feats} toggleFeat={toggleFeat} resetFeats={resetFeats} featStr={featStr} />
      <DownloadDock engine={engine} />
      {/* Inline-emphasis bubble — shared wm-primitives component; labels use Cal Sans's real ital/bold axes */}
      <InlineEmphasisBubble
        selector=".para-block, .tier-head, .tier-body"
        italicLabelStyle={{ fontFamily: "'CalSansVF'", fontVariationSettings: emphItalVs, fontStyle: 'normal', fontSynthesis: 'none' }}
        boldLabelStyle={{ fontFamily: "'CalSansVF'", fontVariationSettings: emphBoldVs, fontWeight: 'normal', fontSynthesis: 'none' }}
      />
    </div>
  )
}
