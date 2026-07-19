// Phase 2 shell — rail / canvas / floor, every control wired to the store.
// Live font via CalSansVF + effective(); GEOM glyph swaps render through the font's
// stock rclt (custom swap-point *editing* is Phase 6). No scenes/gestures yet.
import './shell.css'
import { useState, useRef, useEffect } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { useInstrument } from './InstrumentProvider'
import {
  AXIS_RANGES, effectiveAxes, mergedAxes, previewDrifted, stateTag, defaultsDirty, glyphsEditedCount,
} from './store'
import { renderVarSettings, opszForSize } from './render'
import { Modebar, Scene, SceneControls, FEATURE_CHIPS, SS_FEATURES, type SceneMode } from './scenes'
import Info from './Info'
import { PRESETS, applyPreset } from './presets'
import { useFontEngine } from './useFontEngine'

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
  { label: 'A11y', geom: 0, color: '#c97050' },
  { label: 'UI', geom: 25, color: '#999' },
  { label: 'Base', geom: 50, color: '#4a7fd4' },
  { label: 'Geo', geom: 100, color: '#4aad5c' },
]
const nearestZoneLabel = (geom: number) =>
  ZONES.reduce((best, z) => (Math.abs(z.geom - geom) < Math.abs(best.geom - geom) ? z : best)).label

// ── Rail: the font mutator (◆) ────────────────────────────────────────────────
function Pin({ tag, label, dragSignal }: { tag: string; label: string; dragSignal?: boolean }) {
  const { state, dispatch } = useInstrument()
  const { min, max } = AXIS_RANGES[tag]
  const v = state.defaults.axes[tag]
  // While this slider is held, GEOM-swap flashes hold their zone colour (live map)
  // and only fade on release. Window-level pointerup ends it even if released
  // outside the thumb; keyboard changes don't set it (they read as instant jumps).
  const onPointerDown = dragSignal
    ? () => {
        dispatch({ type: 'setGeomDragging', value: true })
        const up = () => { dispatch({ type: 'setGeomDragging', value: false }); window.removeEventListener('pointerup', up) }
        window.addEventListener('pointerup', up)
      }
    : undefined
  return (
    <div className="pin">
      <div className="pin-head">
        <span className="pin-label">{label} <span className="pin-tag">{tag}</span></span>
        <span className="pin-val tnum">{tag === 'ital' ? v.toFixed(2) : Math.round(v)}</span>
      </div>
      <input type="range" min={min} max={max} step={tag === 'ital' ? 0.01 : 1} value={v}
        onPointerDown={onPointerDown}
        onChange={e => dispatch({ type: 'setDefaultAxis', tag, value: +e.target.value })} />
    </div>
  )
}

function Rail({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { state, dispatch } = useInstrument()
  const tag = TAG_TEXT[stateTag(state)]
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
                style={on ? { background: z.color } : { color: z.color, opacity: .6 }}
                onClick={() => {
                  dispatch({ type: 'setDefaultAxis', tag: 'GEOM', value: z.geom })
                  dispatch({ type: 'clearPreview' })
                }}>
                {z.label}
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
        <div className={`pin${state.defaults.freezeOpsz ? '' : ' pin--off'}`}>
          <div className="pin-head">
            <span className="pin-label">Optical size <span className="pin-tag">opsz</span></span>
            <span className="pin-val tnum">{state.defaults.freezeOpsz ? Math.round(state.defaults.frozenOpszValue ?? 14) : 'auto'}</span>
          </div>
          <input type="range" min={AXIS_RANGES.opsz.min} max={AXIS_RANGES.opsz.max} step={1}
            value={state.defaults.frozenOpszValue ?? 14}
            disabled={!state.defaults.freezeOpsz}
            onChange={e => dispatch({ type: 'setFrozenOpszValue', value: +e.target.value })} />
        </div>
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

      <div className="rail-footer">
        <span className="state-tag" style={{ color: tag.color }}>{tag.label}</span>
      </div>
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
  const editing = state.recalMode === 'edit'
  return (
    <div className={`mode-label${saving ? '' : ' mode-label--throb'}${editing ? ' mode-label--edit' : ''}`}>
      {saving === 'spin' ? <><span className="mode-throb" aria-hidden /> Saving your ReCal…</>
        : saving === 'check' ? <><span className="mode-check">✓</span> Saved</>
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
  paragraph: ['tracking', 'measure'],
  scale: ['measure'],
}
const TYPE_PANEL_POS_KEY = 'recal-type-panel-pos'
function TypePanel({ mode, size, setSize, tracking, setTracking, leading, setLeading, measure, setMeasure }: {
  mode: SceneMode
  size: number; setSize: (n: number) => void
  tracking: number; setTracking: (n: number) => void
  leading: number; setLeading: (n: number) => void
  measure: number; setMeasure: (n: number) => void
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

  return (
    <div ref={panelRef} className="type-panel"
      style={pos ? { left: pos.x, top: pos.y, right: 'auto' } : undefined}>
      <div className="type-panel-title" onPointerDown={onDown} onPointerMove={onMove}
        onPointerUp={onUp} onPointerCancel={onUp}>Type</div>
      {has('size') && (
        <div className="prow">
          <div className="prow-head"><span className="prow-label">size</span>
            <span className="prow-val tnum">{size}px</span></div>
          <input type="range" min={16} max={200} step={1} value={size} onChange={e => setSize(+e.target.value)} />
        </div>
      )}
      {has('tracking') && (
        <div className="prow">
          <div className="prow-head"><span className="prow-label">tracking</span>
            <span className="prow-val tnum">{tracking > 0 ? '+' : tracking < 0 ? '−' : ''}{Math.abs(tracking)}%</span></div>
          <input type="range" min={-10} max={30} step={1} value={tracking} onChange={e => setTracking(+e.target.value)} />
        </div>
      )}
      {has('leading') && (
        <div className="prow">
          <div className="prow-head"><span className="prow-label">leading</span>
            <span className="prow-val tnum">{leading.toFixed(1)}</span></div>
          <input type="range" min={0.8} max={2.5} step={0.1} value={leading} onChange={e => setLeading(+e.target.value)} />
        </div>
      )}
      {has('measure') && (
        <div className="prow">
          <div className="prow-head"><span className="prow-label">measure</span>
            <span className="prow-val tnum">{measure}em</span></div>
          <input type="range" min={16} max={52} step={1} value={measure} onChange={e => setMeasure(+e.target.value)} />
        </div>
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
  const [mode, setMode] = useState<SceneMode>('words')
  const [source, setSource] = useState('Sample')
  const [measure, setMeasure] = useState(34)
  const [pairs, setPairs] = useState<Set<string>>(new Set())
  const togglePair = (k: string) => setPairs(s => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n })
  const [glyphSet, setGlyphSet] = useState('All')
  const [showInfo, setShowInfo] = useState(false)
  const ls = `${tracking / 100}em`
  return (
    <div className="canvas">
      <div className="canvas-bar">
        <Modebar mode={mode} setMode={setMode} showInfo={showInfo} toggleInfo={() => setShowInfo(v => !v)} />
      </div>
      <ModeLabel />
      <div className="canvas-body">
        <div className="stage">
          <div className="stage-scroll">
            <Scene mode={mode} size={size} ls={ls} leading={leading} featStr={featStr}
              source={source} measure={measure} pairs={pairs} glyphSet={glyphSet} opszAuto={opszAuto} />
          </div>
        </div>
        <SceneControls mode={mode} source={source} setSource={setSource}
          pairs={pairs} togglePair={togglePair}
          glyphSet={glyphSet} setGlyphSet={setGlyphSet} />
        <PreviewSurface
          size={size} setSize={setSize}
          tracking={tracking} setTracking={setTracking}
          leading={leading} setLeading={setLeading}
          feats={feats} toggleFeat={toggleFeat} resetFeats={resetFeats}
          opszAuto={opszAuto} setOpszAuto={setOpszAuto} />
      </div>
      <TypePanel mode={mode} size={size} setSize={setSize} tracking={tracking} setTracking={setTracking}
        leading={leading} setLeading={setLeading} measure={measure} setMeasure={setMeasure} />
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
              if (tag === 'opsz') {
                // opsz-auto: handle tracks the sample size; value reads "auto".
                // Moving the handle disengages auto and reports the number.
                return (
                  <div className={`prow${on && !opszAuto ? ' on' : ''}`} key={tag}>
                    <div className="prow-head">
                      <span className="prow-label">opsz
                        <label className="opsz-auto">auto
                          <input type="checkbox" checked={opszAuto} onChange={e => setOpszAuto(e.target.checked)} /></label>
                      </span>
                      <span className="prow-val tnum">{opszAuto ? 'auto' : Math.round(v)}</span>
                    </div>
                    <input type="range" min={min} max={max} step={1} value={opszAuto ? autoOpsz : v}
                      onChange={e => { setOpszAuto(false); dispatch({ type: 'setPreview', tag: 'opsz', value: +e.target.value }) }} />
                  </div>
                )
              }
              return (
                <div className={`prow${on ? ' on' : ''}`} key={tag}>
                  <div className="prow-head"><span className="prow-label">{tag}</span>
                    <span className="prow-val tnum">{tag === 'ital' ? v.toFixed(2) : Math.round(v)}</span></div>
                  <input type="range" min={min} max={max} step={tag === 'ital' ? 0.01 : 1} value={v}
                    onChange={e => dispatch({ type: 'setPreview', tag, value: +e.target.value })} />
                </div>
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

  // Bake the ◆ defaults into a TTF via the (legacy) worker and trigger the download.
  const doDownload = async () => {
    const d = state.defaults
    const axisDefaults = Object.fromEntries(Object.entries(d.axes).filter(([t]) => t !== 'opsz'))
    const ttf = await engine.download({
      axisDefaults,
      opszMultiplier: d.opszMultiplier,
      freezeOpsz: d.freezeOpsz,
      frozenOpszValue: d.frozenOpszValue,
      autoAscender: d.autoAscender,
      thresholds: d.glyphThresholds,
    })
    const url = URL.createObjectURL(new Blob([new Uint8Array(ttf)], { type: 'font/ttf' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${(state.buildName || 'ReCal Sans').trim() || 'ReCal Sans'}.ttf`
    a.click()
    URL.revokeObjectURL(url)
  }

  const label = engine.building ? 'Building…'
    : (engine.started && !engine.ready) ? 'Preparing engine…'
    : 'Download'

  return (
    <div className="dock-download">
      {engine.error && (
        <span className="dock-error" title={engine.error}>export failed — see console</span>
      )}
      <label className="floor-toggle">
        <input type="checkbox" checked={oflAgreed}
          onChange={e => { setOflAgreed(e.target.checked); if (e.target.checked) engine.init() }} />
        I accept the{' '}
        <a href="https://openfontlicense.org/open-font-license-official-text/"
          target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>OFL 1.1</a>
      </label>
      <button className="floor-btn floor-btn--primary"
        disabled={!oflAgreed || !engine.ready || engine.building}
        onPointerEnter={engine.init}
        onClick={doDownload}
        title={!oflAgreed ? 'Accept the OFL to enable download'
          : !engine.ready ? 'Loading the font engine (first time ~10–20s)…' : 'Download your ReCal Sans TTF'}>
        {label}
      </button>
    </div>
  )
}

// The rail auto-collapses only on genuinely narrow windows (independent of edit/demo
// mode); above this it stays open. Clicking the collapsed strip expands it.
const RAIL_NARROW = '(max-width: 800px)'

export default function Shell() {
  const { state } = useInstrument()
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
  const featStr = ["'rclt' 1", ...[...feats].map(t => `'${t}' 1`)].join(', ')
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
  const d = state.defaults
  const needsRebuild = d.opszMultiplier !== 1 || glyphsEditedCount(state) > 0 || d.freezeOpsz || d.autoAscender
  useEffect(() => {
    const t = setTimeout(() => {
      if (needsRebuild) rebuildPreview({ thresholds: d.glyphThresholds, opszMultiplier: d.opszMultiplier, freezeOpsz: d.freezeOpsz, frozenOpszValue: d.frozenOpszValue, autoAscender: d.autoAscender })
      else clearPreviewFont()
    }, 250)
    return () => clearTimeout(t)
  }, [needsRebuild, d.opszMultiplier, d.glyphThresholds, d.freezeOpsz, d.frozenOpszValue, d.autoAscender, state.useHoi, rebuildPreview, clearPreviewFont])

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
    </div>
  )
}
