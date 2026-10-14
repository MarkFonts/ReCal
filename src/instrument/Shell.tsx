// Phase 2 shell — rail / canvas / floor, every control wired to the store.
// Live font via CalSansVF + effective(); GEOM glyph swaps render through the font's
// stock rclt (custom swap-point *editing* is Phase 6). No scenes/gestures yet.
import './shell.css'
import './holo.css'
import { useState, useRef, useEffect, useLayoutEffect, type CSSProperties } from 'react'
import { useInstrument } from './InstrumentProvider'
import { StyleScopeList, InlineEmphasisBubble, AxisSlider, nbMinus,
  AlignmentButtons, FittingControls, fittingMode, FLATTERSATZ_DEFAULTS,
  type FitOptions, Chevron, AccentButton, Icon } from '../../shared/index' // wm-primitives (git submodule)
import {
  AXIS_RANGES, effectiveAxes, mergedAxes, previewDrifted, stateTag, defaultsDirty, glyphsEditedCount,
  sectionDirty, type Section,
} from './store'
import { renderVarSettings, clampTryOpsz } from './render'
import { BOOT } from './boot'
import {
  Modebar, Scene, SceneControls, FEATURE_CHIPS, SCENES, type SceneMode,
  DEFAULT_PARA_STYLES, PARA_STYLE_ORDER, PARA_STYLE_LABEL,
  type ParaStyleKey, type ParaStyle, type ParaStyles,
  SCALE_TIERS, DEFAULT_SCALE_STYLES, type ScaleTierStyle, type ScaleStyles,
} from './scenes'
import Info from './Info'
import { PRESETS, applyPreset } from './presets'
import { useFontEngine, type ExportConfig } from './useFontEngine'
import gridSnapUrl from '../../shared/src/gridSnap.js?url'
import { Matrix } from './Matrix'
import { Freezer, freezerName } from './Freezer'
import { VMetricsPanel, VMetricsScene } from './VMetricsView'
import { ShapePad, AscenderPad } from './ShapePad'

const TAG_TEXT: Record<ReturnType<typeof stateTag>, { label: string; color: string }> = {
  YOUR: { label: 'YOURS', color: 'var(--marker-default)' },
  PREVIEWING: { label: 'PREVIEWING ●', color: 'var(--marker-preview)' },
  STOCK: { label: 'STOCK — original Cal Sans', color: 'var(--state-stock)' },
}

const SIZE_DEFAULT = 88
const FEATS_DEFAULT = ['liga']   // default-on OpenType features (ligatures)
const LOOKUP_FROZEN = /^(ss|cv)\d\d$/   // frozen tags that ride in the rebuilt rclt lookups, not CSS
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

// The stack's rows, top to bottom. Index 5 (Vertical metrics) is the one the canvas reacts to.
const ROW_LABELS = ['Shape', 'Optical size', 'Ascender & Sharpness', 'Type Matrix', 'Freezer', 'Vertical metrics']
const VMETRICS_ROW = 5
const ROW_SECTIONS: Section[] = ['shape', 'opsz', 'asc', 'matrix', 'freezer', 'vmetrics']
const OPSZ_FROZEN_BLOCKED = 'Turn off Auto ascender to freeze optical size: it needs the optical size axis.'
const AUTO_ASC_BLOCKED = 'Unavailable while optical size is frozen: the ascender follows the optical size axis, and freezing removes it.'
const VM_LABEL: Record<string, string> = { wordmark: 'Cal Sans', arrowtype: 'ArrowType', googlefonts: 'Google Fonts', custom: 'custom' }

// Optical size: Auto (browser scales opsz to the size; the 1-6 scale stretches the range) or
// Frozen (pin the axis). The bake does one or the other, never both, so each mode shows only
// its own control. Frozen and Auto ascender are mutually exclusive (the grafted avar2 needs
// the opsz axis): the Frozen side is disabled while Auto ascender is on, with a visible note.
function OpticalSize({ note, onNote }: { note: boolean; onNote: () => void }) {
  const { state, dispatch } = useInstrument()
  const d = state.defaults
  return (
    <div className="rail-row-body">
      <div className="rail-seg" role="group" aria-label="Optical size mode">
        <button className={d.freezeOpsz ? '' : 'on'} aria-pressed={!d.freezeOpsz}
          onClick={() => dispatch({ type: 'setFreezeOpsz', value: false })}>Auto</button>
        {/* aria-disabled, not disabled: a disabled button swallows the hover/click that
            reveals why it's disabled. */}
        <button className={d.freezeOpsz ? 'on' : ''} aria-pressed={d.freezeOpsz}
          aria-disabled={d.autoAscender} title={d.autoAscender ? OPSZ_FROZEN_BLOCKED : undefined}
          onPointerEnter={d.autoAscender ? onNote : undefined}
          onClick={() => { if (d.autoAscender) onNote(); else dispatch({ type: 'setFreezeOpsz', value: true }) }}>Frozen</button>
      </div>
      {note && d.autoAscender
        ? <p className="rail-help rail-help--note" role="status">{OPSZ_FROZEN_BLOCKED}</p>
        : <p className="rail-help">{d.freezeOpsz
            ? 'Every size uses this one optical size. The axis is removed from the font.'
            : 'Follows the type size. Scale stretches how far it travels.'}</p>}
      {d.freezeOpsz ? (
        <AxisSlider
          label="Optical size"
          tag="opsz"
          value={d.frozenOpszValue ?? 14}
          min={AXIS_RANGES.opsz.min}
          max={AXIS_RANGES.opsz.max}
          step={1}
          variant="track"
          reference={state.shipped.opsz}
          onChange={val => dispatch({ type: 'setFrozenOpszValue', value: val as number })}
        />
      ) : (
        <div className="pin">
          <div className="pin-head"><span className="pin-label">Optical scale</span>
            <span className="pin-val tnum">{d.opszMultiplier}×</span></div>
          <div className="stepper">
            {[1, 2, 3, 4, 5, 6].map(n => (
              <button key={n} className={d.opszMultiplier === n ? 'on' : ''}
                onClick={() => dispatch({ type: 'setOpszMultiplier', value: n })}>{n}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// One stack row: a left-aligned header (number, uppercase title, ONE chevron on the right
// margin) + a muted value summary under the title. Rows above the open one point up, rows
// below point down, the open row has none; only the row right after the open one carries the
// holo (holo.css `.is-next`). The chevron is a masked span inside the title, so the holo band
// runs continuously across word and chevron (house chevron geometry, see holo.css).
// The open row has no chevron; in its slot sits that row's own reset, a button beside the
// heading (not inside it) that puts only this row's values back to stock, one undo step.
function RailRow({ n, label, section, summary, open, above, pinBelow, next, dir, onToggle, children }: {
  n: number; label: string; section: Section; summary: string; open: boolean; above: boolean; pinBelow: boolean; next: boolean
  dir: 'fwd' | 'back'; onToggle: () => void; children: React.ReactNode
}) {
  const { state, dispatch } = useInstrument()
  const dirty = open && sectionDirty(state, section)
  return (
    <div className="rail-row" data-pin={open ? undefined : above ? 'top' : pinBelow ? 'bottom' : undefined} data-open={open ? '' : undefined}>
      {/* One box for the seam and (when open) its reset, so the pinned header and its reset
          travel together: the open row's head is the sticky element, the reset a positioned
          child of it. */}
      <div className="rail-seam-head">
        <button className={`rail-seam rail-seam--row${open ? ' is-open' : above ? ' is-above' : ' is-below'}${next ? ' is-next' : ''}`}
          aria-expanded={open} onClick={onToggle}>
          <span className="rail-seam-num tnum" aria-hidden="true">{n}</span>
          <span className="rail-seam-lbl">{label}{!open && <span className="rail-seam-chv-t" aria-hidden="true" />}</span>
          {!open && <span className="rail-seam-sum tnum">{summary}</span>}
        </button>
        {open && (
          <button className="rail-seam-reset" disabled={!dirty} aria-label={`Reset ${label}`} title={`Reset ${label}`}
            onClick={() => dispatch({ type: 'resetSection', section })}><ResetIcon /></button>
        )}
      </div>
      {open && <div className={`rail-row-open rail-descent--${dir}`}>{children}</div>}
    </div>
  )
}

function Rail({ engine, collapsed, onToggle }: { engine: ReturnType<typeof useFontEngine>; collapsed: boolean; onToggle: () => void }) {
  const { state, dispatch } = useInstrument()
  const railRef = useRef<HTMLDivElement>(null)
  const d = state.defaults
  const tag = TAG_TEXT[stateTag(state)]
  // One row open at a time (or none). Opening Vertical metrics switches the canvas to the
  // metrics stage, which still reads store.railGroup === 3; every other row is 0.
  const [open, setOpen] = useState<number | null>(0)
  const [dir, setDir] = useState<'fwd' | 'back'>('fwd')
  const toggle = (i: number) => { setDir(open !== null && i < open ? 'back' : 'fwd'); setOpen(open === i ? null : i) }
  useEffect(() => { dispatch({ type: 'setRailGroup', group: open === VMETRICS_ROW ? 3 : 0 }) }, [open, dispatch])
  // Optical size note: shown when someone reaches for Frozen while Auto ascender is on, and
  // once when a preset arrives with both set (Auto ascender wins; freeze is cleared).
  const [opszNote, setOpszNote] = useState(false)
  useEffect(() => {
    if (d.freezeOpsz && d.autoAscender) { dispatch({ type: 'setFreezeOpsz', value: false }); setOpszNote(true) }
    if (!d.autoAscender) setOpszNote(false)
  }, [d.freezeOpsz, d.autoAscender, dispatch])
  // Pinned neighbors (shell.css, .rail-row[data-pin]): measure the row heights and the footer
  // and hand each pinned row its sticky offset as a custom property. Re-measured whenever a
  // row or the footer changes size (a wrapping summary, the footer's "change" options).
  useLayoutEffect(() => {
    const rail = railRef.current
    const stack = rail?.querySelector('.rail-stack')
    const foot = rail?.querySelector('.rail-dl') as HTMLElement | null
    if (!rail || !stack || !foot || open === null) return
    const rows = Array.from(stack.children) as HTMLElement[]
    const apply = () => {
      let top = 0
      for (let i = 0; i < open; i++) { rows[i].style.setProperty('--pin-top', `${top}px`); top += rows[i].offsetHeight }
      let bottom = foot.offsetHeight
      rows[open].style.setProperty('--pin-top', `${top}px`)   // the open row's own header sticks below the rows above it
      for (let i = rows.length - 1; i > open; i--) { rows[i].style.setProperty('--pin-bottom', `${bottom}px`); bottom += rows[i].offsetHeight }
    }
    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(foot)
    rows.forEach((r, i) => { if (i !== open) ro.observe(r) })
    return () => ro.disconnect()
  }, [open, collapsed])
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

  const frozenTags = d.frozenFeatures
  const edited = glyphsEditedCount(state)
  const summaries = [
    `GEOM ${Math.round(d.axes.GEOM)} · ${Math.round(d.axes.wght)}`,
    d.freezeOpsz ? `frozen ${d.frozenOpszValue ?? 14}` : `auto · ${d.opszMultiplier}×`,
    `Asc ${Math.round(d.axes.YTAS)} · Sharpness ${Math.round(d.axes.SHRP)}${d.autoAscender ? ' · auto' : ''}`,
    edited ? `${edited} moved` : 'stock swaps',
    frozenTags.length ? `${freezerName(frozenTags[0])}${frozenTags.length > 1 ? ` · +${frozenTags.length - 1}` : ''}` : 'nothing frozen',
    VM_LABEL[d.vmetrics.preset] ?? d.vmetrics.preset,
  ]
  const bodies: React.ReactNode[] = [
    <div className="rail-row-body"><ShapePad /></div>,
    <OpticalSize note={opszNote} onNote={() => setOpszNote(true)} />,
    <div className="rail-row-body">
      <AscenderPad />
      <label className="rail-toggle" title={d.freezeOpsz ? AUTO_ASC_BLOCKED : undefined}
        style={d.freezeOpsz ? { opacity: .38, cursor: 'default' } : undefined}>
        <input type="checkbox" checked={d.autoAscender} disabled={d.freezeOpsz}
          onChange={e => dispatch({ type: 'setAutoAscender', value: e.target.checked })} />
        Auto ascender (YTAS tracks opsz)
      </label>
    </div>,
    <div className="rail-row-body">
      <Matrix />
      <label className="rail-toggle">
        <input type="checkbox" checked={state.useHoi}
          onChange={e => dispatch({ type: 'setUseHoi', value: e.target.checked })} />
        HOI interpolation
      </label>
    </div>,
    <div className="rail-row-body"><Freezer /></div>,
    <div className="rail-row-body"><VMetricsPanel /></div>,
  ]
  // Collapsed (narrow window): a strip showing just the label; clicking it expands.
  // Otherwise it's the normal rail; touching it enters EDIT as before.
  return (
    <div ref={railRef}
      className={`rail${state.recalMode === 'demo' ? ' rail--demo' : ''}${collapsed ? ' rail--collapsed' : ''}`}
      onPointerDown={() => { if (!collapsed && state.recalMode !== 'edit') dispatch({ type: 'setRecalMode', mode: 'edit' }) }}
      onClick={collapsed ? onToggle : undefined}>
      <div className="rail-collapsed-label">ReCal Builder</div>
      {/* Narrow windows only (CSS): the open rail covers the whole viewport, so this is the way back. */}
      <button className="rail-close" onClick={onToggle}>
        <Chevron dir={-1} width={10} height={6} className="rail-close-chv" />Close
      </button>
      <div className="rail-header">
        <div className="rail-header-top">
          <div className="rail-title">ReCal Builder</div>
          <button className="rail-reset" title="Reset all defaults to original Cal Sans"
            disabled={!defaultsDirty(state)}
            onClick={() => dispatch({ type: 'resetDefaults' })}>Reset</button>
        </div>
        <div className="rail-sub">your defaults — baked into the export</div>
      </div>

      <div className="rail-group">
        <div className="rail-group-label">Start from</div>
        <span className="wm-select-wrap">
        <select className="wm-select" value={state.activePreset ?? ''}
          onChange={e => {
            const p = PRESETS.find(x => x.name === e.target.value)
            if (p) applyPreset(dispatch, p)
            else dispatch({ type: 'resetDefaults' })
          }}>
          <option value="">Cal Sans (default)</option>
          {PRESETS.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
        </select>
          <Chevron dir={-1} width={12} height={7} />
        </span>
      </div>

      <div className="rail-stack">
        {ROW_LABELS.map((label, i) => (
          <RailRow key={label} n={i + 1} label={label} section={ROW_SECTIONS[i]} summary={summaries[i]} dir={dir}
            open={open === i} above={open !== null && i < open} pinBelow={open !== null && i > open} next={open !== null && i === open + 1}
            onToggle={() => toggle(i)}>
            {bodies[i]}
          </RailRow>
        ))}
      </div>

      <DownloadFooter engine={engine} />

      {/* YOUR ◆ state tag — hidden for now
      <div className="rail-footer">
        <span className="state-tag" style={{ color: tag.color }}>{tag.label}</span>
      </div>
      */}
    </div>
  )
}

// Mode label, below the scene tabs (left). It says nothing at rest (the mode is shown by
// the dimmed rail / Try bar); it carries feedback only. Modes switch by touching the trays
// (rail → EDIT, play → DEMO); leaving EDIT plays a save animation (spinning throbber →
// green check).
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
    <div className={`mode-label${editing ? ' mode-label--edit' : ''}`}>
      {phase?.kind === 'spin' ? <><span className="mode-throb" aria-hidden /> {phase.spin}</>
        : phase?.kind === 'check' ? <span className="mode-check">✓ <span className="mc-word">{phase.check}</span></span>
          : null}
    </div>
  )
}

// ── Canvas: top bar + (stage / scene controls / play), with the Font info overlay
// covering everything below the top bar. ─────────────────────────────────────────
// Type controls — viewport/render controls (not baked axes), shown in the Try bar. Each
// scene shows only the rows it uses.
const TYPE_ROWS: Record<string, string[]> = {
  words: ['size', 'tracking', 'leading'],
  paragraph: ['size', 'tracking', 'leading'],   // its measure lives in the Layout popover
  scale: ['tracking', 'leading', 'measure'],
}

// Keep an open popover inside the canvas: after it mounts, shift it sideways by however far it
// overhangs the canvas edge (8px breathing room). `translate`, so no anchor rule has to change.
function useKeepInside(open: boolean, ref: React.RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const el = ref.current
    if (!open || !el) return
    el.style.translate = ''
    const r = el.getBoundingClientRect()
    const box = (el.closest('.canvas') ?? document.documentElement).getBoundingClientRect()
    const pad = 8
    let dx = 0
    if (r.right > box.right - pad) dx = box.right - pad - r.right
    if (r.left + dx < box.left + pad) dx = box.left + pad - r.left
    if (dx) el.style.translate = `${dx}px 0`
  }, [open, ref])
}

// Paragraph style menu — pick which style (H1/H2/H3/P) the controls target.
// The Material marks (in the subset the apps ship) for the four paragraph styles.
const STYLE_ICON: Record<ParaStyleKey, string> = {
  h1: 'format_h1', h2: 'format_h2', h3: 'format_h3', p: 'format_paragraph',
}

function StyleMenu({ active, setActive, paraStyles, label }: {
  label?: string   // shown on the trigger instead of the current style's name
  active: ParaStyleKey; setActive: (k: ParaStyleKey) => void; paraStyles: ParaStyles
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  useKeepInside(open, listRef)
  useEffect(() => {
    if (!open) return
    const onDoc = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', onDoc)
    return () => document.removeEventListener('pointerdown', onDoc)
  }, [open])
  return (
    <div className="style-menu" ref={ref}>
      <button className="style-menu-btn" onClick={() => setOpen(o => !o)}>
        <span className="style-menu-val"><Icon name="text_fields" size={16} state={open ? 'active' : 'rest'} className="style-menu-ic" />{label ?? PARA_STYLE_LABEL[active]}</span><Chevron dir={-1} width={10} height={6} className="style-menu-caret" />
      </button>
      {open && (
        <div className="style-menu-list" ref={listRef}>
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
                icon: STYLE_ICON[k],
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
  const listRef = useRef<HTMLDivElement>(null)
  useKeepInside(open, listRef)
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
        {label}<Chevron dir={-1} width={10} height={6} className="style-menu-caret" />
      </button>
      {open && (
        <div className="style-menu-list style-menu-list--scroll" ref={listRef}>
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

// Where the Try controls live, for review: ?try=float (columns floating over the canvas foot);
// anything else is the docked bar.
type TryPlace = 'dock' | 'float'
const TRY_PLACE: TryPlace = new URLSearchParams(window.location.search).get('try') === 'float' ? 'float' : 'dock'
// ?grid draws the grid's columns and 3px lines (gridSnap.js, a plain script) -- review only.
if (TRY_PLACE === 'float' && /[?&]grid\b/.test(window.location.search)) {
  const sc = document.createElement('script'); sc.src = gridSnapUrl; sc.defer = true; document.head.appendChild(sc)
}

function Canvas({ size, setSize, tracking, setTracking, leading, setLeading, feats, toggleFeat, resetFeats, featStr }: {
  size: number; setSize: (n: number) => void
  tracking: number; setTracking: (n: number) => void
  leading: number; setLeading: (n: number) => void
  feats: Set<string>; toggleFeat: (t: string) => void; resetFeats: () => void
  featStr: string
}) {
  const [mode, setMode] = useState<SceneMode>(
    () => SCENES.find(s => s.mode === BOOT.scene)?.mode ?? 'words')
  const [source, setSource] = useState(BOOT.pitch ? 'Compare' : 'Sample')
  const [measure, setMeasure] = useState(34)
  // Line fitting: alignment is a scene-level choice, the rag is a switch on top of it,
  // and the budgets ride along. Same shape as font-proofer, same controls.
  // Typed as the union, not string: the fitter needs to know which edge is flush, and
  // Only the H&J bands are held here now: alignment, the rag and hyphenation moved into
  // the paragraph styles, because they are decisions about one style and not about the
  // document. See DEFAULT_PARA_STYLES.
  const [fit, setFit] = useState<Partial<FitOptions>>(FLATTERSATZ_DEFAULTS)
  const [pairs, setPairs] = useState<Set<string>>(new Set())
  const togglePair = (k: string) => setPairs(s => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n })
  const [glyphSet, setGlyphSet] = useState('All')
  const [showInfo, setShowInfo] = useState(false)
  const ls = `${tracking / 100}em`
  // On the Vertical Metrics rail tab the Words scene swaps for the metrics preview; the
  // other scenes stay themselves (so you can see the metrics' effect in a real paragraph/UI).
  const { state: inst, dispatch } = useInstrument()
  const vmActive = inst.railGroup === 3 && mode === 'words'

  // Editable per-block paragraph styles + which one the Try bar's type controls target.
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
  // UI tab: the board fills the whole canvas height and this nav floats OVER it
  // (transparent, no background of its own) instead of pushing it down — measured so
  // UiKitBoard knows where row 0 should rest to clear the nav, same as it looked before
  // the nav overlaid anything. Other tabs are untouched (nav stays in normal flow there).
  const navRef = useRef<HTMLDivElement>(null)
  const [navHeight, setNavHeight] = useState(0)
  const uiOverlay = mode === 'ui' && !vmActive
  useLayoutEffect(() => {
    const el = navRef.current
    if (!el) return
    const measure = () => setNavHeight(el.getBoundingClientRect().height)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const tryBar = (mode !== 'ui' || vmActive) && (
    <TryBar mode={mode} vmActive={vmActive}
      size={tSize} setSize={tSetSize} tracking={tTracking} setTracking={tSetTracking}
      leading={tLeading} setLeading={tSetLeading} measure={measure} setMeasure={setMeasure}
      activeParaStyle={activeParaStyle} setActiveParaStyle={setActiveParaStyle} paraStyles={paraStyles}
      patchPara={patchPara}
      selectedTiers={selectedTiers} toggleTier={toggleTier} scaleStyles={scaleStyles}
      fit={fit} setFit={setFit} feats={feats} toggleFeat={toggleFeat}
      canReset={previewDrifted(inst) || size !== SIZE_DEFAULT || tracking !== 0 || leading !== 1 || featsDrifted(feats)}
      onReset={() => { dispatch({ type: 'clearPreview' }); setSize(SIZE_DEFAULT); setTracking(0); setLeading(1); resetFeats() }} />
  )
  const scene = vmActive
    ? <VMetricsScene />
    : <Scene mode={mode} size={size} ls={ls} leading={leading} featStr={featStr}
        source={source} setSource={setSource} measure={measure} pairs={pairs} glyphSet={glyphSet}
        paraStyles={paraStyles} scaleStyles={scaleStyles} selectedTiers={selectedTiers}
        fit={fit} topInset={uiOverlay ? navHeight : 0} />

  return (
    <div className={`canvas${vmActive ? ' canvas--vm' : ''}${TRY_PLACE === 'float' ? ' wm-grid--bleed' : ''}`} data-try={TRY_PLACE}>
      <div ref={navRef} className={`canvas-nav${uiOverlay ? ' canvas-nav--overlay' : ''}`}>
        <div className={`canvas-bar${TRY_PLACE === 'float' ? ' wm-grid wm-lines' : ''}`}>
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
      </div>
      {/* UI (COSS) renders the ◆ defaults and manages its own 2D board, so it hides the
          bottom ● preview/DEMO dock and drops the reserved play-bar padding → full height. */}
      <div className={`canvas-body${uiOverlay ? ' canvas-body--full' : ''}${vmActive ? ' canvas-body--vm' : ''}`}>
        <div className="stage">
          <div className={`stage-scroll${uiOverlay ? ' stage-scroll--flush' : ''}${vmActive ? ' stage-scroll--bleed' : ''}`}>
            {scene}
          </div>
        </div>
        {tryBar}
      </div>
      {/* Anchored to .canvas (not canvas-body) so it aligns to the top of the screen. */}
      {showInfo && <Info />}
    </div>
  )
}

// ── Try bar (●) ───────────────────────────────────────────────────────────────
// Always visible at the foot of the stage: a row of value pills, dragged sideways like the
// rail's dials (they ARE the AxisSlider track variant). Nothing here is baked. It replaces
// both the hover-bloomed Preview bar (a second copy of the six axes + the ss chips) and the
// floating TYPE panel: size / tracking / leading, then the preview-only Weight / Italic /
// Features, then whatever the current scene adds (paragraph style and a Layout popover
// holding alignment, fitting and measure; scale tiers, measure). GEOM, opsz, YTAS and SHRP
// are not here: they are defaults, and the rail drives them.

// A pill that opens a small popover ABOVE itself (the bar sits at the bottom edge). `end`
// hangs it off the pill's right edge, for pills near the bar's right side.
function TryPop({ label, icon, end, children }: { label: string; icon?: string; end?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  useKeepInside(open, listRef)
  useEffect(() => {
    if (!open) return
    const onDoc = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('pointerdown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [open])
  return (
    <div className="try-pop" ref={ref}>
      <AccentButton look="q5" shape="chip" lit={open} className={open ? undefined : 'try-btn'}
        aria-expanded={open} onClick={() => setOpen(o => !o)}>
        {icon && <Icon name={icon} size={16} state={open ? 'active' : 'rest'} className="try-btn-ic" />}{label}<Chevron dir={open ? -1 : 1} width={10} height={6} className="try-btn-caret" />
      </AccentButton>
      {open && <div ref={listRef} className={`try-pop-list${end ? ' try-pop-list--end' : ''}`}>{children}</div>}
    </div>
  )
}

function TryDial({ label, icon, iconFull, value, min, max, step, suffix, disabled, display, title, autoValue, onChange }: {
  label: string; value: number | 'auto'
  icon?: string; iconFull?: boolean   // iconFull: not in the shared subset yet, drawn from the review font
  min: number; max: number; step: number
  suffix?: string; disabled?: boolean; display?: string; title?: string
  autoValue?: number                      // set → the dial can rest at 'auto' (onChange then gets 'auto' too)
  onChange: (n: number | 'auto') => void
}) {
  // The mark lights (the primitive's active state, HDR in dark) while the dial is held or its
  // number is being typed in: pointer down anywhere on the pill until the pointer comes up,
  // or focus inside it until focus leaves.
  const [held, setHeld] = useState(false)
  const [typing, setTyping] = useState(false)
  return (
    <div className={`try-pill${autoValue !== undefined ? ' try-pill--auto' : ''}${icon ? ' try-pill--ic' : ''}`} title={title}
      onPointerDown={() => { setHeld(true); window.addEventListener('pointerup', () => setHeld(false), { once: true }) }}
      onFocus={e => { if ((e.target as HTMLElement).tagName === 'INPUT' && (e.target as HTMLInputElement).type === 'text') setTyping(true) }}
      onBlur={() => setTyping(false)}>
      {icon && <Icon name={icon} size={16} state={(held || typing) && !disabled ? 'active' : 'rest'} className={`try-pill-ic${iconFull ? ' icon-full' : ''}`} />}
      <AxisSlider variant="track" label={label} value={value} min={min} max={max} step={step}
        suffix={suffix} disabled={disabled} display={display}
        allowAuto={autoValue !== undefined} autoValue={autoValue} onChange={onChange} />
    </div>
  )
}

function TryBar({ mode, vmActive, size, setSize, tracking, setTracking, leading, setLeading, measure, setMeasure, activeParaStyle, setActiveParaStyle, paraStyles, patchPara, selectedTiers, toggleTier, scaleStyles, fit, setFit, feats, toggleFeat, canReset, onReset }: {
  mode: SceneMode; vmActive: boolean
  size: number; setSize: (n: number) => void
  tracking: number; setTracking: (n: number) => void
  leading: number; setLeading: (n: number) => void
  measure: number; setMeasure: (n: number) => void
  activeParaStyle: ParaStyleKey; setActiveParaStyle: (k: ParaStyleKey) => void; paraStyles: ParaStyles
  patchPara: (p: Partial<ParaStyle>) => void
  selectedTiers: Set<string>; toggleTier: (k: string) => void; scaleStyles: ScaleStyles
  fit: Partial<FitOptions>; setFit: (f: Partial<FitOptions>) => void
  feats: Set<string>; toggleFeat: (t: string) => void
  canReset: boolean; onReset: () => void
}) {
  const { state, dispatch } = useInstrument()
  const merged = mergedAxes(state)
  // A divider closes each group except the last on its line: mark the groups that end a line
  // (the next one sits lower) so CSS can drop the divider there. Pure DOM, no state.
  const barRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const bar = barRef.current
    if (!bar) return
    const mark = () => {
      const gs = [...bar.querySelectorAll<HTMLElement>('.try-group, .try-col')]
      gs.forEach((g, i) => {
        const next = gs[i + 1]
        if (!next || Math.abs(next.offsetTop - g.offsetTop) > 2) g.setAttribute('data-eol', ''); else g.removeAttribute('data-eol')
      })
    }
    mark()
    const ro = new ResizeObserver(mark)
    ro.observe(bar)
    return () => ro.disconnect()
  })
  // The float's grid, measured: the bar's width and the house columns/gutter (grid.css), so the
  // packer below can give each column a whole number of grid columns.
  const [geo, setGeo] = useState<{ W: number; cols: number; g: number } | null>(null)
  useLayoutEffect(() => {
    if (TRY_PLACE !== 'float') return
    const bar = barRef.current
    if (!bar) return
    const read = () => {
      const cs = getComputedStyle(document.documentElement)
      const next = { W: bar.getBoundingClientRect().width, cols: +cs.getPropertyValue('--grid-cols') || 24, g: parseFloat(cs.getPropertyValue('--grid-gutter')) || 24 }
      setGeo(p => (p && p.W === next.W && p.cols === next.cols && p.g === next.g ? p : next))
    }
    read()
    const ro = new ResizeObserver(read)
    ro.observe(bar)
    return () => ro.disconnect()
  }, [])
  // The metrics stage has its own type; only the preview-only pills apply there.
  const rows = vmActive ? [] : TYPE_ROWS[mode] ?? []
  const has = (k: string) => rows.includes(k)
  // Compare mode: gray out what the referent font can't express. A static SVG specimen
  // (no live font) grays everything; a live webfont keeps wght (font-weight) and ital only
  // if real italics exist. The paragraph is a pre-made SVG on the compare pages — the same
  // condition the scene uses to render one — so nothing typeset here can reach it.
  const cmp = state.compareOn ? state.compare : null
  const comparingSvg = !!cmp?.svg
  const naWght = !!cmp && (!!cmp.svg || !cmp.css)
  const naItal = !!cmp && (!!cmp.svg || !cmp.css || !cmp.italic)
  const inScene = !vmActive && (mode === 'paragraph' || mode === 'scale')
  const { min: wMin, max: wMax } = AXIS_RANGES.wght
  const resetBtn = (
    <button className="preview-reset" disabled={!canReset} title="Reset preview" onClick={onReset}>
      <ResetIcon /><span className="preview-reset-text">Reset</span>
    </button>
  )
  const sceneGroup = !vmActive && (mode === 'paragraph' || mode === 'scale')
  const floatPlace = TRY_PLACE === 'float'   // there: four columns on the grid, Reset bottom right
  const para = !vmActive && mode === 'paragraph'
  const alignIcon = `format_align_${paraStyles[activeParaStyle].align}`
  const slot = <span className="try-slot" aria-hidden="true" />

  // ── The controls, built once; the docked bar runs them in feature groups, the float lays
  // them on four grid columns (below). Proofing controls (not ◆ defaults) → the track variant
  // with no diamond/marker/reference, as font-proofer's TYPOGRAPHY has them.
  const sizeDial = has('size')
    ? <TryDial label="Size" icon="format_size" iconFull value={size} min={16} max={200} step={1} suffix="px" onChange={v => setSize(v as number)} />
    : null
  // Preview-only optical size. At rest it reads "auto" (the browser follows the type size);
  // moved, it overrides opsz in the preview text. The range is the preview font's relabeled
  // axis (stock × Optical scale). A frozen font has no opsz axis, and a compared webfont sets
  // its own, so both disable it. Never baked: it is not in the ◆ layer and buildConfig never reads it.
  const opticalDial = !vmActive ? (
    <TryDial label="Optical size" icon="mystery" value={state.previewOpsz ?? 'auto'}
      min={8 * state.defaults.opszMultiplier} max={45 * state.defaults.opszMultiplier} step={1}
      autoValue={clampTryOpsz(has('size') ? size : 14 * state.defaults.opszMultiplier, state.defaults.opszMultiplier)}
      disabled={state.defaults.freezeOpsz || !!cmp}
      display={state.defaults.freezeOpsz ? String(state.defaults.frozenOpszValue ?? 14) : cmp ? '—' : undefined}
      title={state.defaults.freezeOpsz ? `The font is frozen at ${state.defaults.frozenOpszValue ?? 14}` : cmp ? 'The compared font sets its own optical size' : undefined}
      onChange={v => dispatch({ type: 'setPreviewOpsz', value: v === 'auto' ? null : v })} />
  ) : null
  const trackingDial = has('tracking')
    ? <TryDial label="Tracking" icon="format_letter_spacing" iconFull value={tracking} min={-10} max={30} step={1} suffix="%" onChange={v => setTracking(v as number)} />
    : null
  const leadingDial = has('leading')
    ? <TryDial label="Leading" icon="format_line_spacing" value={leading} min={0.8} max={2.5} step={0.1} onChange={v => setLeading(v as number)} />
    : null
  const weightDial = (
    <TryDial label="Weight" icon="line_weight" value={merged.wght} min={wMin} max={wMax} step={1} disabled={naWght}
      display={naWght ? '—' : undefined} onChange={v => dispatch({ type: 'setPreview', tag: 'wght', value: v as number })} />
  )
  const italicBtn = (
    <AccentButton look="q5" shape="chip" lit={merged.ital >= 0.5} className={merged.ital >= 0.5 ? undefined : 'try-btn'}
      aria-pressed={merged.ital >= 0.5} disabled={naItal}
      onClick={() => dispatch({ type: 'setPreview', tag: 'ital', value: merged.ital >= 0.5 ? 0 : 1 })}><Icon name="format_italic" size={16} state={merged.ital >= 0.5 ? 'active' : 'rest'} className="try-btn-ic" />Italic</AccentButton>
  )
  const featuresPop = (
    <TryPop label="Features" icon="discover_tune">
      {FEATURE_CHIPS.map(f => (
        <label key={f.tag} className="rail-toggle" title={f.tag}>
          <input type="checkbox" checked={feats.has(f.tag)} onChange={() => toggleFeat(f.tag)} />
          {f.label}
        </label>
      ))}
    </TryPop>
  )
  const styleMenu = para
    ? <StyleMenu active={activeParaStyle} setActive={setActiveParaStyle} paraStyles={paraStyles} label={floatPlace ? 'Styles' : undefined} />
    : null
  // Paragraph layout in one popover: alignment and line fitting (wm-primitives, the same
  // controls font-proofer renders in its sidebar) and the measure. Alignment, the rag
  // and hyphenation belong to the style the menu selects; only the H&J bands in `fit`
  // are the document's, because they are the typeface's. On the compare pages a
  // pre-made SVG has nothing live to fit, so the alignment and fitting controls are
  // dropped (they would only promise something the page cannot deliver) and the
  // measure stays. In the float it is "Alignment", with the icon of the current alignment.
  const layoutPop = para ? (
    <TryPop label={floatPlace ? 'Alignment' : 'Layout'} icon={floatPlace ? alignIcon : undefined} end>
      {!comparingSvg && (
        <>
          <div className="try-aligns">
            <AlignmentButtons value={paraStyles[activeParaStyle].align}
              onChange={a => patchPara({ align: a })} />
          </div>
          <FittingControls value={fit} onChange={setFit}
            mode={fittingMode(paraStyles[activeParaStyle].align, paraStyles[activeParaStyle].swissRag)}
            swissRag={paraStyles[activeParaStyle].swissRag}
            onSwissRag={on => patchPara({ swissRag: on })}
            hyphenate={paraStyles[activeParaStyle].hyphenate}
            onHyphenate={on => patchPara({ hyphenate: on })} />
        </>
      )}
      <TryDial label="Measure" value={measure} min={16} max={52} step={1} suffix="em" onChange={v => setMeasure(v as number)} />
    </TryPop>
  ) : null
  const tierMenu = !vmActive && mode === 'scale'
    ? <TierMenu selected={selectedTiers} toggle={toggleTier} scaleStyles={scaleStyles} /> : null
  const scaleMeasure = has('measure')
    ? <TryDial label="Measure" value={measure} min={16} max={52} step={1} suffix="em" onChange={v => setMeasure(v as number)} /> : null

  if (floatPlace) {
    // Columns that have no controls on this tab are not rendered, and what is left packs left
    // from the first grid column after TRY, each column a whole number of grid columns wide
    // (its pills' natural width, rounded up), whole columns wrapping to a band that starts under
    // the first control. Column 1 Size/Tracking, 2 Optical size/Leading, 3 Weight/Italic+Features,
    // 4 the scene's (Styles/Alignment on Paragraph, tier menu/Measure on Scale); Reset after the last.
    const colA = [sizeDial, trackingDial].filter(Boolean)
    const colB = [opticalDial, leadingDial].filter(Boolean)
    const colD = para ? [styleMenu, layoutPop] : tierMenu ? [tierMenu, scaleMeasure] : []
    const present: { key: string; px: number }[] = []
    if (colA.length) present.push({ key: 'a', px: 150 })
    if (colB.length) present.push({ key: 'b', px: 214 })
    present.push({ key: 'c', px: 214 })
    if (colD.length) present.push({ key: 'd', px: 156 })
    present.push({ key: 'r', px: 92 })
    const at: Record<string, CSSProperties> = {}
    if (geo) {
      const { W, cols, g } = geo
      const col = (W - (cols - 1) * g) / cols
      const spanFor = (px: number, from: number) => Math.min(cols - from + 1, Math.max(1, Math.ceil((px + g) / (col + g) - 1e-6)))
      const put = (k: string, start: number, span: number) => {
        at[k] = { ['--start' as string]: start, ['--span' as string]: span, ['--start-md' as string]: start, ['--span-md' as string]: span } as CSSProperties
      }
      const L = spanFor(54, 1)               // the TRY label: its gutter + the word
      put('lbl', 1, L)
      const x0 = L + 1
      let cur = x0
      for (const it of present) {
        let s = spanFor(it.px, x0)
        if (cur + s - 1 > cols) cur = x0       // whole column wraps to a new band
        put(it.key, cur, s)
        cur += s
      }
    }
    return (
      <div className="try wm-grid wm-lines" role="group" aria-label="Try" ref={barRef}
        onPointerDown={() => state.recalMode !== 'demo' && dispatch({ type: 'setRecalMode', mode: 'demo' })}>
        <span className="try-lbl try-c-lbl" style={at.lbl}>Try</span>
        {colA.length > 0 && <div className="try-col" style={at.a}>{colA}</div>}
        {colB.length > 0 && <div className="try-col" style={at.b}>{colB}</div>}
        <div className="try-col" style={at.c}>{weightDial}<div className="try-row">{italicBtn}{featuresPop}</div></div>
        {colD.length > 0 && <div className="try-col" style={at.d}>{colD}</div>}
        <div className="try-c-r" style={at.r}>{resetBtn}</div>
      </div>
    )
  }

  // Docked bar: feature groups, each one unit that wraps whole (never a lone pill): Size,
  // Spacing, Style, then the scene's own. Reset rides at the end of the LAST group.
  return (
    <div className="try" role="group" aria-label="Try" ref={barRef}
      onPointerDown={() => state.recalMode !== 'demo' && dispatch({ type: 'setRecalMode', mode: 'demo' })}>
      <span className="try-lbl">Try</span>
      <div className="try-groups">
        {(sizeDial || opticalDial) && <div className="try-group">{sizeDial}{opticalDial}</div>}
        {(trackingDial || leadingDial) && <div className="try-group">{trackingDial}{leadingDial}</div>}
        <div className="try-group">
          {weightDial}{italicBtn}{featuresPop}
          {!sceneGroup && resetBtn}
        </div>
        {sceneGroup && (
          <div className="try-group">
            {styleMenu}{tierMenu}{layoutPop}{scaleMeasure}
            {resetBtn}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Download line — pinned under the rail's stack (never scrolls away). ────────────
// Says what the download contains (the full variable range, always) and offers the 8
// static cuts as one optional checkbox. The OFL line + the button live here too.
function DownloadFooter({ engine }: { engine: ReturnType<typeof useFontEngine> }) {
  const { state } = useInstrument()
  const [expanded, setExpanded] = useState(false)
  const [statics, setStatics] = useState(false)
  const footRef = useRef<HTMLDivElement>(null)
  const { min: wMin, max: wMax } = AXIS_RANGES.wght
  const family = (state.buildName || 'ReCal Sans').trim() || 'ReCal Sans'

  // The exact export config for the current ◆ (deterministic → cacheable). Kept in a
  // ref so the pointer-vector listener always speculates on the latest config.
  const buildConfig = (): ExportConfig => {
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
      familyName: family,
    }
  }
  const cfgRef = useRef(buildConfig)
  cfgRef.current = buildConfig
  // force = definitive intent (hovering the download) — bakes even during a
  // preview rebuild. Passive pointer-vectoring stays un-forced. Always the plain-TTF
  // config: the prebake cache keys on the config, and the 8 statics only bake on a click.
  const prefetch = (force = false) => engine.prebake(cfgRef.current(), force)

  // "Load the room behind the door": when the pointer is heading toward the download
  // button (aligned velocity + within reach), speculatively bake the export so the click
  // is instant. Entering the footer also prefetches — this just buys more lead time. Not
  // while a button is held: dragging a rail dial toward the footer is an edit, not intent.
  useEffect(() => {
    let px = 0, py = 0, vx = 0, vy = 0, last = 0
    const onMove = (e: PointerEvent) => {
      if (last) {
        const a = Math.min(1, (e.timeStamp - last) / 80)   // EMA on velocity
        vx = vx * (1 - a) + (e.clientX - px) * a
        vy = vy * (1 - a) + (e.clientY - py) * a
      }
      px = e.clientX; py = e.clientY; last = e.timeStamp
      const foot = footRef.current; if (!foot || e.buttons) return
      const r = foot.getBoundingClientRect()
      if (!r.width) return   // rail collapsed to its strip
      const tx = r.left + r.width / 2 - px, ty = r.top + r.height / 2 - py
      const dist = Math.hypot(tx, ty), speed = Math.hypot(vx, vy)
      // within reach, moving fast enough, and aimed at the footer (cosine > 0.6)
      if (dist < 460 && speed > 1.2 && (vx * tx + vy * ty) / (speed * dist || 1) > 0.6) prefetch(false)
    }
    window.addEventListener('pointermove', onMove)
    return () => window.removeEventListener('pointermove', onMove)
  }, [])

  // Bake the ◆ defaults (instant if already pre-baked) and trigger the download: a lone
  // TTF, or with statics a .zip of the variable font + the 8 static cuts.
  const [dlError, setDlError] = useState<string | null>(null)
  const doDownload = async () => {
    setDlError(null)
    let baked: Awaited<ReturnType<typeof engine.download>>
    try {
      baked = await engine.download(statics ? { ...cfgRef.current(), statics: true } : cfgRef.current())
    } catch {
      return   // a failed bake: the engine already logged it and set engine.error (the footer shows it)
    }
    try {
      const zip = baked.kind === 'zip'
      const url = URL.createObjectURL(new Blob([new Uint8Array(baked.bytes)], { type: zip ? 'application/zip' : 'font/ttf' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `${family}.${zip ? 'zip' : 'ttf'}`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error('[download]', e)
      setDlError(String(e))
    }
  }

  // One-shot holo (+ ital lean) over the "Download" letters when the export first becomes
  // downloadable. In dev the Pyodide worker often never boots (stuck on "Preparing engine…"),
  // so in dev we FAKE-ready the button — clicking replays the flourish — to
  // preview the animation without the engine. This never fakes a bake (doDownload needs ready).
  const [holoKey, setHoloKey] = useState(0)
  const playHolo = () => setHoloKey(k => k + 1)
  const devFake = import.meta.env.DEV && !engine.ready && !engine.building
  const showDownload = engine.ready || devFake
  const wasReady = useRef(false)
  useEffect(() => { if (showDownload && !wasReady.current) playHolo(); wasReady.current = showDownload }, [showDownload])

  const ext = statics ? '.zip' : '.ttf'
  const label = engine.building ? 'Building…'
    : (engine.started && !showDownload) ? 'Preparing engine…'
    : `Download ${ext}`

  return (
    // Touching the footer is not touching the rail's controls: don't enter EDIT.
    <div className="rail-dl" ref={footRef} onPointerEnter={() => prefetch(true)}
      onPointerDown={e => e.stopPropagation()}>
      {(engine.error || dlError) && (
        <span className="dock-error" title={dlError ?? engine.error ?? undefined}>export failed — see console</span>
      )}
      <button className="dl-what" aria-expanded={expanded} onClick={() => setExpanded(x => !x)}>
        <span className="dl-k">In your download</span>
        <span className="dl-w">
          {statics
            ? `Variable ${wMin}–${wMax} + 8 statics · roman + italic`
            : `Variable · weight ${wMin}–${wMax} · roman + italic`}
          <span className="dl-change">change<Chevron dir={expanded ? 1 : -1} width={10} height={6} /></span>
        </span>
      </button>
      {expanded && (
        <div className="dl-opts">
          <label className="dl-opt dl-opt--locked">
            <input type="checkbox" checked disabled />
            <span><b>Variable font</b> · {wMin}–{wMax}, roman + italic</span>
          </label>
          <label className="dl-opt">
            <input type="checkbox" checked={statics} onChange={e => setStatics(e.target.checked)} />
            <span><b>Plus 8 statics</b> · 400 500 600 700, roman + italic</span>
          </label>
        </div>
      )}
      <div className="dl-act">
        <AccentButton look="q5" shape="pill"
          disabled={engine.building || (!engine.ready && !devFake)}
          onPointerEnter={() => prefetch(true)}
          onClick={() => { if (engine.ready) doDownload(); else if (devFake) playHolo() }}
          title={!engine.ready ? 'Loading the font engine (first time ~10–20s)…'
            : statics ? `Download your ${family} variable font + 8 statics (.zip)` : 'Download your ReCal Sans TTF'}>
          {engine.building
            ? <span className="holo-loading">Building…</span>
            : <span key={holoKey} className={holoKey > 0 ? 'holo-once' : ''}
                onAnimationEnd={e => { if (e.animationName === 'holo-once-ital') e.currentTarget.classList.remove('holo-once') }}>{label}</span>}
        </AccentButton>
        <p className="dl-ofl">By downloading you accept the{' '}
          <a href="https://openfontlicense.org/open-font-license-official-text/"
            target="_blank" rel="noopener noreferrer">OFL 1.1</a></p>
      </div>
      {engine.building && engine.progress && <p className="dl-progress" role="status">{engine.progress}</p>}
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
  const [size, setSize] = useState(SIZE_DEFAULT)
  const [tracking, setTracking] = useState(0)
  const [leading, setLeading] = useState(1)
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
  // Frozen figure features (tnum/pnum/zero) render live through the feature string. Frozen
  // ss/cv do NOT: they live inside the rebuilt preview face's rclt lookups (the bake builds
  // the same ones), because a CSS feature would let the ss form beat the user's GEOM swap.
  const activeFeats = [...new Set([...feats, ...state.defaults.frozenFeatures.filter(t => !LOOKUP_FROZEN.test(t))])]
  const featStr = ["'rclt' 1", ...activeFeats.map(t => `'${t}' 1`)].join(', ')
  const toggleFeat = (t: string) => setFeats(s => { const n = new Set(s); n.has(t) ? n.delete(t) : n.add(t); return n })
  const resetFeats = () => setFeats(new Set(FEATS_DEFAULT))

  // Entering EDIT resets all preview view-state to the ◆ default look (the store
  // clears the ● axis preview; here we reset the local size/tracking/leading/feats).
  const prevMode = useRef(state.recalMode)
  useEffect(() => {
    if (state.recalMode === 'edit' && prevMode.current !== 'edit') {
      setSize(SIZE_DEFAULT); setTracking(0); setLeading(1); resetFeats()
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
  const needsRebuild = d.opszMultiplier !== 1 || glyphsEditedCount(state) > 0 || d.autoAscender || d.frozenFeatures.some(t => LOOKUP_FROZEN.test(t))
  useEffect(() => {
    const t = setTimeout(() => {
      if (needsRebuild) rebuildPreview({ thresholds: d.glyphThresholds, frozenFeatures: d.frozenFeatures, opszMultiplier: d.opszMultiplier, freezeOpsz: d.freezeOpsz, frozenOpszValue: d.frozenOpszValue, autoAscender: d.autoAscender })
      else clearPreviewFont()
    }, 250)
    return () => clearTimeout(t)
  }, [needsRebuild, d.opszMultiplier, d.glyphThresholds, d.frozenFeatures, d.freezeOpsz, d.frozenOpszValue, d.autoAscender, state.useHoi, rebuildPreview, clearPreviewFont])

  // Real Cal Sans italic/bold for the emphasis-bubble labels — same axes renderInline uses.
  const emphItalVs = renderVarSettings({ ...effectiveAxes(state), ital: 1 }, {})
  const emphBoldVs = renderVarSettings({ ...effectiveAxes(state), wght: 700 }, {})
  return (
    <div className={`shell${state.recalMode === 'demo' ? ' shell--demo' : ''}${railCollapsed ? ' shell--rail-collapsed' : ''}`}>
      <Rail engine={engine} collapsed={railCollapsed} onToggle={() => setRailCollapsed(c => !c)} />
      <Canvas
        size={size} setSize={setSize}
        tracking={tracking} setTracking={setTracking}
        leading={leading} setLeading={setLeading}
        feats={feats} toggleFeat={toggleFeat} resetFeats={resetFeats} featStr={featStr} />
      {/* Inline-emphasis bubble — shared wm-primitives component; labels use Cal Sans's real ital/bold axes */}
      <InlineEmphasisBubble
        selector=".para-block, .tier-head, .tier-body"
        italicLabelStyle={{ fontFamily: "'CalSansVF'", fontVariationSettings: emphItalVs, fontStyle: 'normal', fontSynthesis: 'none' }}
        boldLabelStyle={{ fontFamily: "'CalSansVF'", fontVariationSettings: emphBoldVs, fontWeight: 'normal', fontSynthesis: 'none' }}
      />
    </div>
  )
}
