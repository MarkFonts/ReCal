import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import InstrumentApp from './instrument/InstrumentApp'
import '../shared/src/scrollbar.css' // house 6px scrollbar (wm-primitives)
import { GlyphPicker, makeGlyphSets } from '../shared/index'

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
    { label: 'Stylistic — Humanist a (ss02)', chars: 'aàáâãäåæāăą', feat: 'ss02' },
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
        layout={layout} specimenSpan={specimenSpan} specimenSize={specimenSize} style={{ height: '100%' }} />
    </div>
  )
}

const Root = params.get('demo') === 'glyphpicker' ? GlyphPickerDemo : useClassic ? App : InstrumentApp

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>
)
