import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import InstrumentApp from './instrument/InstrumentApp'
import '../shared/src/space.css'     // --spacing-NN scale (wm-primitives). Top-level, not in
                                     // InstrumentApp with corners/type: the primitives that
                                     // consume --spacing-NN also render in the classic UI and the
                                     // ?demo= harnesses, which never mount InstrumentApp.
import '../shared/src/scrollbar.css' // house 6px scrollbar (wm-primitives)
import { GlyphPicker, makeGlyphSets, StyleScopeDropdown, StyleScopeList, AxisSlider } from '../shared/index'

// CSS url() with an absolute path ignores the vite base, so inject the
// font-face here where BASE_URL is available.
const _s = document.createElement('style')
_s.textContent = `@font-face { font-family: 'CalSansVF'; src: url('${import.meta.env.BASE_URL}fonts/CalSansVF.ttf') format('truetype'); font-display: swap; }`
document.head.insertBefore(_s, document.head.firstChild)

// Instrument-model UI is now the default; the classic app stays reachable at
// ?ui=classic (or #classic) for regression comparison.
const params = new URLSearchParams(window.location.search)
const useClassic = params.get('ui') === 'classic' || window.location.hash === '#classic'

// ?demo=glyphpicker — dev harness for the shared GlyphPicker primitive.
function GlyphPickerDemo() {
  const sets = makeGlyphSets()
  const groups = [
    ...Object.entries(sets).filter(([k]) => k !== 'All').map(([label, chars]) => ({ label, chars: chars.join('') })),
    { label: 'Stylistic — Humanist a (ss02)', chars: 'aàáâãäåæāăą', ffs: '"ss02" 1' },
  ]
  // Cal Sans design metrics (vmetrics.ts FONT_METRICS + xHeightAt at defaults).
  const metrics = { upm: 1000, ascender: 720, capHeight: 720, xHeight: 514, descender: -243 }
  const p = new URLSearchParams(window.location.search)
  const layout = p.get('layout') === 'bottom' ? 'bottom' as const : 'side' as const
  const specimenSpan = p.get('span') === '2' ? 2 as const : 1 as const
  const specimenSize = p.get('size') ?? undefined
  return (
    <div style={{ height: '100vh', background: '#161616', padding: 40, boxSizing: 'border-box' }}>
      <GlyphPicker groups={groups} fontFamily="'CalSansVF', sans-serif" metrics={metrics}
        layout={layout} specimenSpan={specimenSpan} specimenSize={specimenSize} names="both" style={{ height: '100%' }} />
    </div>
  )
}

// ?demo=padding — harness for the spacing rollout. Mounts the primitives that carry
// literal padding side by side so a token substitution can be measured, not eyeballed.
// The vertical guides are the point: a row's text edge has to line up with the trigger
// button's text edge above it, and that alignment is the sum of nested paddings.
function PaddingDemo() {
  const rows = [
    { id: 'h1', label: 'Display', chips: [{ text: '45/1.1' }, { text: '700' }], selected: true },
    { id: 'h2', label: 'Title', chips: [{ text: '26/1.2' }, { text: '600' }] },
    { id: 'b', label: 'Body', chips: [{ text: '16/1.55' }, { text: '400' }] },
  ]
  const guide = (left: number, color: string, label: string) => (
    <div style={{ position: 'absolute', left, top: 0, bottom: 0, width: 1, background: color, zIndex: 9 }}>
      <span style={{ position: 'absolute', top: -16, left: 2, fontSize: 9, color, whiteSpace: 'nowrap' }}>{label}</span>
    </div>
  )
  return (
    <div className="instrument-root" style={{ minHeight: '100vh', background: '#0f0f0f', color: '#e8e8e8', padding: 64, boxSizing: 'border-box', display: 'flex', gap: 72, alignItems: 'flex-start' }}>
      <div style={{ position: 'relative', width: 300 }}>
        <div style={{ fontSize: 11, opacity: .5, marginBottom: 24 }}>StyleScopeDropdown — button over list</div>
        {guide(0, '#4a7fd4', 'box edge')}
        {guide(12, '#e08a63', 'btn text 12px')}
        {guide(15, '#5fc678', 'row text 5+10')}
        <StyleScopeDropdown rows={rows} buttonLabel="Display" onSelect={() => {}} />
        <div style={{ marginTop: 12 }}><StyleScopeList rows={rows} onSelect={() => {}} /></div>
        <div style={{ marginTop: 12 }}><StyleScopeList rows={rows} inline onSelect={() => {}} /></div>
        <div style={{ marginTop: 12 }}><StyleScopeList rows={rows} className="ssd-list--dense" onSelect={() => {}} /></div>
      </div>
      <div style={{ position: 'relative', width: 300 }}>
        <div style={{ fontSize: 11, opacity: .5, marginBottom: 24 }}>GlyphPicker chrome</div>
        <input className="gp-search" placeholder="search" style={{ width: '100%', boxSizing: 'border-box' }} />
        <div style={{ marginTop: 12 }}><button className="gp-copy">copy</button></div>
        <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(4, 56px)', gap: 4 }}>
          {['A', 'B', 'C', 'D'].map(ch => (
            <div key={ch} className="gp-cell gp-cell--named"><span className="gp-cell-ch">{ch}</span><span className="gp-cell-name">name</span></div>
          ))}
        </div>
        <div style={{ marginTop: 24 }} className="inline-emph-menu">
          <button className="inline-emph-btn">italic</button>
          <button className="inline-emph-btn">bold</button>
        </div>
      </div>
      <div style={{ position: 'relative', width: 260 }}>
        <div style={{ fontSize: 11, opacity: .5, marginBottom: 24 }}>AxisSlider</div>
        <AxisSlider label="size" value={88} min={16} max={200} step={1} suffix="px" onChange={() => {}} />
        <AxisSlider label="weight" value={400} min={400} max={700} step={1} tag="wght" onChange={() => {}} />
      </div>
    </div>
  )
}

const Root = params.get('demo') === 'glyphpicker' ? GlyphPickerDemo
  : params.get('demo') === 'padding' ? PaddingDemo
  : useClassic ? App : InstrumentApp

// Scope marker: App.css's element-level defaults (light button pill etc.) apply ONLY
// under .classic-ui — they must never leak into the instrument or demo harnesses.
document.documentElement.classList.add(useClassic ? 'classic-ui' : 'instrument-ui')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>
)
