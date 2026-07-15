// Phase 2 shell — rail / canvas / floor, every control wired to the store.
// Live font via CalSansVF + effective(); GEOM glyph swaps render through the font's
// stock rclt (custom swap-point *editing* is Phase 6). No scenes/gestures yet.
import './shell.css'
import { useState, useRef, useEffect } from 'react'
import { useInstrument } from './InstrumentProvider'
import {
  AXIS_RANGES, effectiveAxes, mergedAxes, previewDrifted, stateTag,
} from './store'
import { renderVarSettings } from './render'
import { Modebar, Scene, SceneControls, FEATURE_CHIPS, SS_FEATURES, type SceneMode } from './scenes'
import Info from './Info'

const TAG_TEXT: Record<ReturnType<typeof stateTag>, { label: string; color: string }> = {
  YOUR: { label: 'YOUR ◆', color: 'var(--marker-default)' },
  PREVIEWING: { label: 'PREVIEWING ●', color: 'var(--marker-preview)' },
  STOCK: { label: 'STOCK — original Cal Sans', color: 'var(--state-stock)' },
}

const SIZE_DEFAULT = 88

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
  const tag = TAG_TEXT[stateTag(state)]
  const vs = renderVarSettings(effectiveAxes(state))
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

      <div className="rail-footer">
        <span className="state-tag" style={{ color: tag.color }}>{tag.label}</span>
        <div className="rail-readout tnum">{vs}</div>
      </div>
    </div>
  )
}

// ── Canvas: top bar + (stage / scene controls / play), with the Font info overlay
// covering everything below the top bar. ─────────────────────────────────────────
function Canvas({ size, setSize, tracking, setTracking, leading, setLeading, feats, toggleFeat, featStr }: {
  size: number; setSize: (n: number) => void
  tracking: number; setTracking: (n: number) => void
  leading: number; setLeading: (n: number) => void
  feats: Set<string>; toggleFeat: (t: string) => void
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
      <div className="canvas-body">
        <div className="stage">
          <div className="stage-scroll">
            <Scene mode={mode} size={size} ls={ls} leading={leading} featStr={featStr}
              source={source} measure={measure} pairs={pairs} glyphSet={glyphSet} />
          </div>
        </div>
        <SceneControls mode={mode} source={source} setSource={setSource}
          measure={measure} setMeasure={setMeasure} pairs={pairs} togglePair={togglePair}
          glyphSet={glyphSet} setGlyphSet={setGlyphSet} />
        <PreviewSurface
          size={size} setSize={setSize}
          tracking={tracking} setTracking={setTracking}
          leading={leading} setLeading={setLeading}
          feats={feats} toggleFeat={toggleFeat} />
        {showInfo && <Info />}
      </div>
    </div>
  )
}

// ── Bottom preview-control surface (●) ────────────────────────────────────────
const DOCK_AXES = ['wght', 'GEOM', 'opsz', 'YTAS', 'SHRP', 'ital'] as const

function PreviewSurface({ size, setSize, tracking, setTracking, leading, setLeading, feats, toggleFeat }: {
  size: number; setSize: (n: number) => void
  tracking: number; setTracking: (n: number) => void
  leading: number; setLeading: (n: number) => void
  feats: Set<string>; toggleFeat: (t: string) => void
}) {
  const { state, dispatch } = useInstrument()
  const merged = mergedAxes(state)
  const canReset = previewDrifted(state) || size !== SIZE_DEFAULT || tracking !== 0 || leading !== 1
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
    <div ref={surfRef} className={`preview-surface${open ? ' open' : ''}`}
      onFocusCapture={() => setOpen(true)}>
      <div className="preview-surface-head">
        <span className="preview-surface-cap">Play — preview only, nothing bakes{open ? '' : ' · hover'}</span>
        <button className="preview-reset" disabled={!canReset} title="Reset preview"
          onClick={() => { dispatch({ type: 'clearPreview' }); setSize(SIZE_DEFAULT); setTracking(0); setLeading(1) }}>
          <ResetIcon />
        </button>
      </div>
      <div className="preview-body">
        <div className="play-group">
          <span className="play-group-label">Type</span>
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
            <div className="prow">
              <div className="prow-head"><span className="prow-label">leading</span>
                <span className="prow-val tnum">{leading.toFixed(1)}</span></div>
              <input type="range" min={0.8} max={2.5} step={0.1} value={leading}
                onChange={e => setLeading(+e.target.value)} />
            </div>
          </div>
        </div>

        <div className="play-group">
          <span className="play-group-label">Axes</span>
          <div className="preview-rows">
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

// ── Floor: the transaction ────────────────────────────────────────────────────
function Floor() {
  const { state, dispatch } = useInstrument()
  const [oflAgreed, setOflAgreed] = useState(false)
  const active = nearestZoneLabel(state.defaults.axes.GEOM)
  const holdDown = () => !state.stockHold && dispatch({ type: 'setStockHold', held: true })
  const holdUp = () => state.stockHold && dispatch({ type: 'setStockHold', held: false })
  return (
    <div className="floor">
      <span className="floor-label">Zone</span>
      <div className="zone-chips">
        {ZONES.map(z => {
          const on = active === z.label
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
      <div className="floor-spacer" />
      <label className="floor-toggle">
        <input type="checkbox" checked={state.defaults.freezeOpsz}
          onChange={e => dispatch({ type: 'setFreezeOpsz', value: e.target.checked })} />
        Freeze opsz
      </label>
      <button data-label="hold: original Cal Sans" className={`hold-text${state.stockHold ? ' held' : ''}`}
        onPointerDown={holdDown} onPointerUp={holdUp} onPointerLeave={holdUp}
        onKeyDown={e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); holdDown() } }}
        onKeyUp={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); holdUp() } }}>
        hold: original Cal Sans
      </button>
      <label className="floor-toggle">
        <input type="checkbox" checked={oflAgreed} onChange={e => setOflAgreed(e.target.checked)} />
        I accept the{' '}
        <a href="https://openfontlicense.org/open-font-license-official-text/"
          target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>OFL 1.1</a>
      </label>
      <button className="floor-btn floor-btn--primary" disabled={!oflAgreed}
        title={oflAgreed ? 'Export lands in a later phase' : 'Accept the OFL to enable download'}>
        Download — Phase 6
      </button>
    </div>
  )
}

export default function Shell() {
  const [size, setSize] = useState(SIZE_DEFAULT)
  const [tracking, setTracking] = useState(0)
  const [leading, setLeading] = useState(1)
  // OpenType feature chips are global preview controls — they live in the play bar
  // and apply to every scene's text.
  const [feats, setFeats] = useState<Set<string>>(new Set(['liga']))
  const featStr = ["'rclt' 1", ...[...feats].map(t => `'${t}' 1`)].join(', ')
  const toggleFeat = (t: string) => setFeats(s => { const n = new Set(s); n.has(t) ? n.delete(t) : n.add(t); return n })
  return (
    <div className="shell">
      <Rail />
      <Canvas
        size={size} setSize={setSize}
        tracking={tracking} setTracking={setTracking}
        leading={leading} setLeading={setLeading}
        feats={feats} toggleFeat={toggleFeat} featStr={featStr} />
      <Floor />
    </div>
  )
}
