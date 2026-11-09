// REVIEW-ONLY (clamp-show branch). How a clamp drag shows what the new min / max becomes.
// Three candidates live side by side so Mark can toggle them in the running app:
//   ?clampshow=bubble   A  the value rides the grabber, Type Matrix bubble grammar (Bubble.tsx)
//   ?clampshow=labels   B  the axis numbers ride the clamp edges, the readout lights (Labels.tsx)
//   ?clampshow=sample   C  a "Cal" set AT the limit sits by the dragged edge (Sample.tsx)
// Any value of the param (even ?clampshow) shows the switch under the Shape pad. Without the
// param nothing renders and the pad is exactly main. When one option wins: keep its file, make
// it unconditional, delete this file, the switch, the losers and their CSS blocks.
import { useEffect, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import './clampshow.css'

export type ClampShow = 'off' | 'bubble' | 'labels' | 'sample'
const MODES: ClampShow[] = ['off', 'bubble', 'labels', 'sample']
const LABEL: Record<ClampShow, string> = { off: 'Off', bubble: 'A Bubble', labels: 'B Labels', sample: 'C Sample' }

const param = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('clampshow')
export const CLAMPSHOW_REVIEW = param !== null
let mode: ClampShow = (MODES as string[]).includes(param ?? '') ? param as ClampShow : CLAMPSHOW_REVIEW ? 'sample' : 'off'
const subs = new Set<() => void>()

function setMode(next: ClampShow) {
  mode = next
  const u = new URL(window.location.href)
  u.searchParams.set('clampshow', next)
  window.history.replaceState(window.history.state, '', u)
  subs.forEach(f => f())
}

export const useClampShow = (): ClampShow =>
  useSyncExternalStore(f => { subs.add(f); return () => { subs.delete(f) } }, () => mode)

// The switch: mounted by the Shape pad only while the param is present, but portalled to a
// fixed pill at the bottom of the window. In the rail's flow it cost ~40px, which Shell's
// --pad-max fit took straight off the pad and the pinned rows below covered it on a 900px
// window. It also mirrors the mode onto .rail as data-clampshow (CSS keys on it).
export function ClampShowSwitch() {
  const m = useClampShow()
  useEffect(() => {
    document.querySelectorAll('.rail').forEach(r => r.setAttribute('data-clampshow', m))
  }, [m])
  if (!CLAMPSHOW_REVIEW) return null
  return createPortal(
    <div className="clampshow-switch">
      <span className="clampshow-switch-title">Clamp readout · review</span>
      <div className="rail-seg" role="group" aria-label="Clamp readout (review only)">
        {MODES.map(k => (
          <button key={k} className={m === k ? 'on' : ''} aria-pressed={m === k} onClick={() => setMode(k)}>{LABEL[k]}</button>
        ))}
      </div>
    </div>,
    document.body,
  )
}
