// Phase 2 shell — rail / canvas / floor, every control wired to the store.
// Live font via CalSansVF + effective(); GEOM glyph swaps render through the font's
// stock rclt (custom swap-point *editing* is Phase 6). No scenes/gestures yet.
import './shell.css'
import { useState } from 'react'
import { LANDING_ZONES, PREVIEW_WORDS } from '../GlyphGroups'
import { useInstrument } from './InstrumentProvider'
import {
  AXIS_RANGES, effectiveAxes, mergedAxes, previewDrifted, stateTag,
} from './store'
import { renderVarSettings } from './render'
import Info from './Info'

const PARA =
  'Typography is the art and technique of arranging type to make written language legible, readable, and appealing when displayed. Illicit jaguars, 10 guv, 015 — a gauge of clarity.'

const TAG_TEXT: Record<ReturnType<typeof stateTag>, { label: string; color: string }> = {
  YOUR: { label: 'YOUR ◆', color: 'var(--marker-default)' },
  PREVIEWING: { label: 'PREVIEWING ●', color: 'var(--marker-preview)' },
  STOCK: { label: 'STOCK — original Cal Sans', color: 'var(--state-stock)' },
}

const nearestZone = (geom: number) =>
  LANDING_ZONES.find(z => geom >= z.start && geom <= z.end) ??
  LANDING_ZONES.reduce((best, z) => {
    const d = (x: typeof z) => (geom < x.start ? x.start - geom : geom > x.end ? geom - x.end : 0)
    return d(z) < d(best) ? z : best
  })

// ── Rail: the font mutator (◆) ────────────────────────────────────────────────
function Pin({ tag, label }: { tag: string; label: string }) {
  const { state, dispatch } = useInstrument()
  const { min, max } = AXIS_RANGES[tag]
  const v = state.defaults.axes[tag]
  return (
    <div className="pin">
      <div className="pin-head">
        <span className="pin-label">{label} <span className="pin-tag">{tag}</span></span>
        <span className="pin-val tnum">{tag === 'ital' ? v.toFixed(2) : Math.round(v)}</span>
      </div>
      <input type="range" min={min} max={max} step={tag === 'ital' ? 0.01 : 1} value={v}
        onChange={e => dispatch({ type: 'setDefaultAxis', tag, value: +e.target.value })} />
    </div>
  )
}

function Rail() {
  const { state, dispatch } = useInstrument()
  return (
    <div className="rail">
      <div className="rail-header">
        <div>
          <div className="rail-title">ReCal Builder</div>
          <div className="rail-sub">◆ your defaults — baked into the export</div>
        </div>
        <button className="rail-reset" title="Reset all defaults to original Cal Sans"
          onClick={() => dispatch({ type: 'resetDefaults' })}>Reset</button>
      </div>

      <div className="rail-group">
        <div className="rail-group-label">Geometric form</div>
        <Pin tag="GEOM" label="GEOM" />
      </div>

      <div className="rail-group">
        <div className="rail-group-label">Optical</div>
        <div className="pin-head"><span className="pin-label">Opsz scale</span>
          <span className="pin-val tnum">{state.defaults.opszMultiplier}×</span></div>
        <div className="stepper">
          {[1, 2, 3, 4, 5, 6].map(n => (
            <button key={n} className={state.defaults.opszMultiplier === n ? 'on' : ''}
              onClick={() => dispatch({ type: 'setOpszMultiplier', value: n })}>{n}</button>
          ))}
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
    </div>
  )
}

// ── Canvas: the stage (baked ◆ at rest) ───────────────────────────────────────
function Canvas({ size, tracking }: { size: number; tracking: number }) {
  const { state, dispatch } = useInstrument()
  const [showInfo, setShowInfo] = useState(true)
  const eff = effectiveAxes(state)
  const tag = TAG_TEXT[stateTag(state)]
  const vs = renderVarSettings(eff)
  const ls = `${tracking / 100}em`
  const holdDown = () => !state.stockHold && dispatch({ type: 'setStockHold', held: true })
  const holdUp = () => state.stockHold && dispatch({ type: 'setStockHold', held: false })
  return (
    <div className="canvas">
      <div className="canvas-topbar">
        <span className="state-tag" style={{ color: tag.color }}>{tag.label}</span>
        <span className="topbar-readout tnum">{vs}</span>
        <span className="floor-spacer" />
        <button className={`info-toggle${showInfo ? ' on' : ''}`}
          aria-pressed={showInfo}
          onClick={() => setShowInfo(v => !v)}>
          Font info
        </button>
        <button className="hold-btn"
          onPointerDown={holdDown}
          onPointerUp={holdUp}
          onPointerLeave={holdUp}
          onKeyDown={e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); holdDown() } }}
          onKeyUp={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); holdUp() } }}>
          hold: original Cal Sans
        </button>
      </div>
      <div className="stage">
        <p className="specimen-cap">Specimen · Cal Sans VF</p>
        <p className="specimen" style={{ fontSize: size, fontVariationSettings: vs, letterSpacing: ls }}>
          {PREVIEW_WORDS.join(' ')}
        </p>
        <p className="para" style={{ fontSize: 18, fontVariationSettings: vs, letterSpacing: ls }}>{PARA}</p>
        {previewDrifted(state) && (
          <button className="return-pill" onClick={() => dispatch({ type: 'clearPreview' })}>
            Return to your defaults
          </button>
        )}
        {showInfo && <Info />}
      </div>
    </div>
  )
}

// ── Bottom preview-control surface (●) ────────────────────────────────────────
const DOCK_AXES = ['wght', 'GEOM', 'opsz', 'YTAS', 'SHRP', 'ital'] as const

function PreviewSurface({ size, setSize, tracking, setTracking }: {
  size: number; setSize: (n: number) => void
  tracking: number; setTracking: (n: number) => void
}) {
  const { state, dispatch } = useInstrument()
  const merged = mergedAxes(state)
  return (
    <div className="preview-surface">
      <div className="preview-surface-head">
        <span className="preview-surface-cap">Play — preview only, nothing bakes</span>
      </div>
      <div className="preview-rows">
        <div className="prow">
          <div className="prow-head"><span className="prow-label">size</span>
            <span className="prow-val tnum">{size}px</span></div>
          <input type="range" min={16} max={200} step={1} value={size}
            onChange={e => setSize(+e.target.value)} />
        </div>
        <div className="prow">
          <div className="prow-head"><span className="prow-label">tracking</span>
            <span className="prow-val tnum">{tracking > 0 ? '+' : tracking < 0 ? '−' : ''}{Math.abs(tracking)}%</span></div>
          <input type="range" min={-10} max={30} step={1} value={tracking}
            onChange={e => setTracking(+e.target.value)} />
        </div>
        {DOCK_AXES.map(tag => {
          const { min, max } = AXIS_RANGES[tag]
          const on = tag in state.preview
          const v = merged[tag]
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
  )
}

// ── Floor: the transaction ────────────────────────────────────────────────────
function Floor() {
  const { state, dispatch } = useInstrument()
  const active = nearestZone(state.defaults.axes.GEOM).label
  return (
    <div className="floor">
      <span className="floor-label">Zone</span>
      <div className="zone-chips">
        {LANDING_ZONES.map(z => {
          const on = active === z.label
          return (
            <button key={z.label}
              className={`zone-chip${on ? ' on' : ''}`}
              style={on ? { background: z.color } : { color: z.color }}
              onClick={() => {
                dispatch({ type: 'setDefaultAxis', tag: 'GEOM', value: z.mid })
                dispatch({ type: 'clearPreview' })
              }}>
              {z.label === 'A11Y' ? 'A11y' : z.label}
            </button>
          )
        })}
      </div>
      <div className="floor-spacer" />
      <label className="rail-toggle">
        <input type="checkbox" checked={state.defaults.freezeOpsz}
          onChange={e => dispatch({ type: 'setFreezeOpsz', value: e.target.checked })} />
        Freeze opsz
      </label>
      <button className="floor-btn floor-btn--primary" disabled title="Export lands in a later phase">
        Download — Phase 6
      </button>
    </div>
  )
}

export default function Shell() {
  const [size, setSize] = useState(88)
  const [tracking, setTracking] = useState(0)
  return (
    <div className="shell">
      <Rail />
      <Canvas size={size} tracking={tracking} />
      <PreviewSurface size={size} setSize={setSize} tracking={tracking} setTracking={setTracking} />
      <Floor />
    </div>
  )
}
