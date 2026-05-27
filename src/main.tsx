import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

// CSS url() with an absolute path ignores the vite base, so inject the
// font-face here where BASE_URL is available.
const _s = document.createElement('style')
_s.textContent = `@font-face { font-family: 'CalSansVF'; src: url('${import.meta.env.BASE_URL}fonts/cal-sans-vf.ttf') format('truetype'); font-display: swap; }`
document.head.insertBefore(_s, document.head.firstChild)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
