import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import InstrumentApp from './instrument/InstrumentApp'

// CSS url() with an absolute path ignores the vite base, so inject the
// font-face here where BASE_URL is available.
const _s = document.createElement('style')
_s.textContent = `@font-face { font-family: 'CalSansVF'; src: url('${import.meta.env.BASE_URL}fonts/CalSansVF.ttf') format('truetype'); font-display: swap; }`
document.head.insertBefore(_s, document.head.firstChild)

// Instrument-model UI is gated behind ?ui=instrument (or #instrument) for the whole
// branch; the classic app stays the default so behaviour can be regression-compared.
const params = new URLSearchParams(window.location.search)
const useInstrument = params.get('ui') === 'instrument' || window.location.hash === '#instrument'
const Root = useInstrument ? InstrumentApp : App

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>
)
