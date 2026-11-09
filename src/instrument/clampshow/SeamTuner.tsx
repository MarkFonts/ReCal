// REVIEW-ONLY (clamp-show): a live tuner for the rail's section rows (the numbered accordion
// headers, .rail-seam), shown in the review pill under ?clampshow. Three numbers: the row's
// top padding, its bottom padding, and the gap between the title and its summary line. Each
// starts at what the stylesheet gives today (read from a live row, so it can't drift from
// shell.css) and steps on the 3px grid: + goes to the next multiple of 3, − to the previous,
// so today's off-grid 8px bottom snaps to 9 or 6. The values are inline custom properties on
// .rail, read only by the fenced rule in clampshow.css while data-seamtune is set; Shell.tsx's
// pin measurement already re-runs when a row changes height. Nothing persists. When Mark has
// his numbers: put them in .rail-seam in shell.css, delete this file and its CSS block.
import { useEffect, useState } from 'react'

type Key = 'pt' | 'pb' | 'gap'
const LABEL: Record<Key, string> = { pt: 'Top', pb: 'Bottom', gap: 'Title–summary' }
const VAR: Record<Key, string> = { pt: '--review-seam-pt', pb: '--review-seam-pb', gap: '--review-seam-gap' }

function readToday(): Record<Key, number> | null {
  const seam = document.querySelector<HTMLElement>('.rail-seam--row')
  if (!seam) return null
  const cs = getComputedStyle(seam)
  return { pt: parseFloat(cs.paddingTop), pb: parseFloat(cs.paddingBottom), gap: parseFloat(cs.rowGap) }
}

export function SeamTuner() {
  const [today, setToday] = useState<Record<Key, number> | null>(null)
  const [v, setV] = useState<Record<Key, number> | null>(null)
  useEffect(() => {
    const t = readToday()
    if (t) { setToday(t); setV(t) }
  }, [])
  useEffect(() => {
    const rail = document.querySelector<HTMLElement>('.rail')
    if (!rail || !v) return
    rail.setAttribute('data-seamtune', '')
    ;(Object.keys(VAR) as Key[]).forEach(k => rail.style.setProperty(VAR[k], `${v[k]}px`))
  }, [v])
  if (!v || !today) return null
  const step = (k: Key, dir: 1 | -1) => setV(s => {
    if (!s) return s
    const n = dir > 0 ? Math.floor(s[k] / 3) * 3 + 3 : Math.ceil(s[k] / 3) * 3 - 3
    return { ...s, [k]: Math.max(0, Math.min(36, n)) }
  })
  const changed = (Object.keys(v) as Key[]).some(k => v[k] !== today[k])
  return (
    <div className="clampshow-tune" role="group" aria-label="Section row spacing (review only)">
      <span className="clampshow-switch-title">Section rows</span>
      {(Object.keys(LABEL) as Key[]).map(k => (
        <span key={k} className="clampshow-tune-item">
          <span className="clampshow-tune-lbl">{LABEL[k]}</span>
          <button onClick={() => step(k, -1)} aria-label={`${LABEL[k]} smaller`}>−</button>
          <span className="clampshow-tune-val tnum" data-moved={v[k] !== today[k] ? '' : undefined}>{v[k]}px</span>
          <button onClick={() => step(k, 1)} aria-label={`${LABEL[k]} larger`}>+</button>
        </span>
      ))}
      <button className="clampshow-tune-reset" disabled={!changed} onClick={() => setV(today)}>Today</button>
    </div>
  )
}
