import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import InstrumentApp from './instrument/InstrumentApp'
import '../shared/src/scrollbar.css' // house 6px scrollbar (wm-primitives)

// CSS url() with an absolute path ignores the vite base, so inject the
// font-face here where BASE_URL is available.
const _s = document.createElement('style')
_s.textContent = `@font-face { font-family: 'CalSansVF'; src: url('${import.meta.env.BASE_URL}fonts/CalSansVF.ttf') format('truetype'); font-display: swap; }`
document.head.insertBefore(_s, document.head.firstChild)

// Instrument-model UI is now the default; the classic app stays reachable at
// ?ui=classic (or #classic) for regression comparison.
const params = new URLSearchParams(window.location.search)
const useClassic = params.get('ui') === 'classic' || window.location.hash === '#classic'
const Root = useClassic ? App : InstrumentApp

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>
)
