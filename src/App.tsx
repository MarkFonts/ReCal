import { useEffect, useRef, useState } from 'react'
import './App.css'
import { Slider } from 'dialkit'
import 'dialkit/styles.css'
import { GlyphGroups, GROUP_DEFS, LANDING_ZONES, PREVIEW_WORDS, getZoneTokens, applyDrop, applyDelete, applyDefaultDrop, type ZoneToken, type VariantLabel } from './GlyphGroups'

export type AxisInfo = { tag: string; name: string; min: number; default: number; max: number }

// Cal Sans-specific: these axes take direct measurements, not design-space defaults
const PARAMETRIC_TAGS = new Set(['YTAS', 'SHRP'])
const OPSZ_MULTIPLIERS = [1, 2, 3, 4, 5, 6]

const OPSZ_CONTEXT = [
  'mobile and desktop',
  'larger screens',
  'display and signage',
  'large format print',
  'signage and outdoor',
  'your canvas is 10ft tall',
] as const

const FONT_URLS = {
  hoi: `${import.meta.env.BASE_URL}fonts/CalSansFlexVF.ttf`,
  standard: `${import.meta.env.BASE_URL}fonts/CalSansVF.ttf`,
}

// Reset glyph (circular arrow) lifted from font-proofer's ResetIcon
function ResetIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">
      <path d="M8,14.2909c-3.47461,0-6.30127-2.81629-6.30127-6.2909,0-2.57326,1.51851-3.90145,2.46222-4.67831.19366-.15897.47817-.12995.6365.06182.15865.19272.10866.45416-.06182.6365-.72266.77296-1.63651,1.99428-1.63651,3.97999,0,2.70215,2.19824,4.91247,4.90088,4.91247,2.70215,0,4.90039-2.21033,4.90039-4.91247,0-2.70264-2.19824-4.90088-4.90039-4.90088-.38672,0-.7002-.31348-.7002-.7002s.31348-.7002.7002-.7002c3.47461,0,6.30078,2.82666,6.30078,6.30127s-2.82617,6.2909-6.30078,6.2909Z"/>
      <path d="M4.84717,6.89648c-.38672,0-.7002-.31348-.7002-.7002v-2.12169h-2.10645c-.38672,0-.7002-.31032-.7002-.69704s.31348-.68811.7002-.68811h2.80664c.38672,0,.7002.31348.7002.7002v2.80664c0,.38672-.31348.7002-.7002.7002Z"/>
    </svg>
  )
}

// Vertical 100px axis slider — custom track/fill/thumb (native vertical range is ugly)
function VAxisSlider({ label, value, min, max, step, onChange, overridden }: {
  label: string; value: number; min: number; max: number; step: number
  onChange: (v: number) => void; overridden?: boolean
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100))
  function setFromY(clientY: number) {
    const t = trackRef.current; if (!t) return
    const r = t.getBoundingClientRect()
    let p = 1 - (clientY - r.top) / r.height  // 1 at top, 0 at bottom
    p = Math.max(0, Math.min(1, p))
    let v = min + p * (max - min)
    v = Math.round(v / step) * step
    onChange(Math.max(min, Math.min(max, v)))
  }
  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault()
    const el = e.currentTarget
    el.setPointerCapture(e.pointerId)
    setFromY(e.clientY)
    const move = (ev: PointerEvent) => setFromY(ev.clientY)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', () => el.removeEventListener('pointermove', move), { once: true })
  }
  return (
    <div className={`vslider${overridden ? ' vslider--overridden' : ''}`}>
      <span className="vslider-value">{step < 1 ? value.toFixed(2) : Math.round(value)}</span>
      <div className="vslider-track" ref={trackRef} onPointerDown={onPointerDown}>
        <div className="vslider-fill" style={{ height: `${pct}%` }} />
        <div className="vslider-thumb" style={{ bottom: `calc(${pct}% - 7px)` }} />
      </div>
      <span className="vslider-label">{label}</span>
    </div>
  )
}

export default function App() {
  const [loadMsg, setLoadMsg] = useState('Starting...')
  const [axes, setAxes] = useState<AxisInfo[]>([])
  const [defaults, setDefaults] = useState<Record<string, number>>({})
  const [opszMultiplier, setOpszMultiplier] = useState(1)
  const [isDownloading, setIsDownloading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [previewSize, setPreviewSize] = useState(36)
  const [glyphThresholds, setGlyphThresholds] = useState<Record<string, number[]>>(
    () => Object.fromEntries(GROUP_DEFS.map(g => [g.glyph, [...g.defaultThresholds]]))
  )
  const [useHoi, setUseHoi] = useState(false)
  const [freezeOpsz, setFreezeOpsz] = useState(false)
  const [frozenOpszValue, setFrozenOpszValue] = useState<number | null>(null)
  const [activePreset, setActivePreset] = useState<string | null>(null)
  const [presetsExpanded, setPresetsExpanded] = useState(false)
  const [scaledOpsz, setScaledOpsz] = useState(false)
  const [typeTesterText, setTypeTesterText] = useState('Type something')
  const [tracking, setTracking] = useState(0)
  const [resetSpin, setResetSpin] = useState(false)
  // "Easy ease": rendered axis values spring toward their targets so dragging a
  // pill makes the glyphs swing/settle. opsz/wght/YTAS/SHRP always; GEOM under HOI.
  const [animAxis, setAnimAxis] = useState<Record<string, number>>({})
  const axisSprings = useRef<Record<string, { x: number; v: number; target: number; raf: number | null }>>({})
  const [springEasing, setSpringEasing] = useState(true)  // off = no font-axis bounce AND no UI motion
  const [menuOpen, setMenuOpen] = useState(false)  // mobile: controls collapsed behind a hamburger
  // Sparse preview-only override layer for the canvas pills. Never affects export.
  const [previewOverrides, setPreviewOverrides] = useState<Record<string, number>>({})
  const [wordWidths, setWordWidths] = useState<{ upm: number; widths: Record<string, Record<string, number>> } | null>(null)
  const [oflAgreed, setOflAgreed] = useState(false)
  const [oflAttempted, setOflAttempted] = useState(false)
  const [autoAscender, setAutoAscender] = useState(false)
  const [showAscenderModal, setShowAscenderModal] = useState(false)
  const [showXRay, setShowXRay] = useState(false)
  const [previewRebuilding, setPreviewRebuilding] = useState(false)
  const [previewModal, setPreviewModal] = useState<{
    zone: typeof LANDING_ZONES[0]
    size: number
    spacing: number
    axisValues: Record<string, number>
  } | null>(null)
  const [dragState, setDragState] = useState<{
    tok: ZoneToken; sourceZone: string; x: number; y: number
  } | null>(null)
  const [trashedGlyphs, setTrashedGlyphs] = useState<Array<{
    glyph: string; variantIdx: number; variantLabel: VariantLabel
    sourceZone: string; savedThresholds: number[]; color: string; sampleGeom: number
  }>>([])
  const zoneGridRef = useRef<HTMLDivElement | null>(null)
  const paletteTrashRef = useRef<HTMLDivElement | null>(null)
  const typeTesterRef = useRef<HTMLTextAreaElement | null>(null)

  const workerRef = useRef<Worker | null>(null)
  const defaultsRef = useRef<Record<string, number>>({})
  const downloadResolveRef = useRef<((buf: ArrayBuffer) => void) | null>(null)
  const previewFontUrlRef = useRef<string | null>(null)
  const previewStyleRef = useRef<HTMLStyleElement | null>(null)
  const previewDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const workerReadyRef = useRef(false)
  const glyphThresholdsRef = useRef(glyphThresholds)
  const useHoiRef = useRef(useHoi)
  const thresholdPastRef = useRef<Array<Record<string, number[]>>>([])
  const thresholdFutureRef = useRef<Array<Record<string, number[]>>>([])

  useEffect(() => { useHoiRef.current = useHoi }, [useHoi])

  // Type tester auto-grows to fit its content (textarea avoids the contentEditable
  // cursor-reset bug where typing jumped to the start).
  useEffect(() => {
    const el = typeTesterRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [typeTesterText, previewSize, tracking])

  async function loadFont() {
    if (!workerRef.current) return
    const url = useHoiRef.current ? FONT_URLS.hoi : FONT_URLS.standard
    setLoadMsg('Fetching font...')
    workerReadyRef.current = false
    setAxes([])
    setDefaults({})
    const resp = await fetch(url)
    const buffer = await resp.arrayBuffer()
    workerRef.current.postMessage({ type: 'loadFont', fontBytes: buffer }, [buffer])
  }

  // Cache CalSansFlexVF's avar2 store in the worker so Auto Ascender can graft it
  // onto any active font (works without HOI).
  async function loadFlexAvar() {
    if (!workerRef.current) return
    const resp = await fetch(FONT_URLS.hoi)
    const buffer = await resp.arrayBuffer()
    workerRef.current.postMessage({ type: 'loadFlexAvar', fontBytes: buffer }, [buffer])
  }

  useEffect(() => {
    if (axes.length > 0) loadFont()
  }, [useHoi])

  useEffect(() => {
    const worker = new Worker(new URL('./worker/fontWorker.ts', import.meta.url), { type: 'module' })
    workerRef.current = worker

    worker.onmessage = async (e) => {
      const msg = e.data
      if (msg.type === 'status') {
        setLoadMsg(msg.message)
      } else if (msg.type === 'ready') {
        await loadFont()
        loadFlexAvar()
      } else if (msg.type === 'axisInfo') {
        const axisInfo: AxisInfo[] = JSON.parse(msg.axisInfoJson)
        const initialDefaults = Object.fromEntries(axisInfo.map((a) => [a.tag, a.default]))
        defaultsRef.current = initialDefaults
        setAxes(axisInfo)
        setDefaults(initialDefaults)
        workerReadyRef.current = true
        worker.postMessage({ type: 'previewFont', thresholdsJson: JSON.stringify(glyphThresholdsRef.current) })
        worker.postMessage({
          type: 'measureWords',
          wordsJson: JSON.stringify([...PREVIEW_WORDS]),
          geomValuesJson: JSON.stringify([initialDefaults['GEOM'] ?? 0, ...LANDING_ZONES.map(z => z.mid)]),
          axisDefaultsJson: JSON.stringify(initialDefaults),
        })
      } else if (msg.type === 'measureWordsResult') {
        setWordWidths(JSON.parse(msg.dataJson))
      } else if (msg.type === 'fontResult') {
        downloadResolveRef.current?.(msg.ttf as ArrayBuffer)
        downloadResolveRef.current = null
      } else if (msg.type === 'previewFontResult') {
        const blob = new Blob([new Uint8Array(msg.ttf as ArrayBuffer)], { type: 'font/ttf' })
        const newUrl = URL.createObjectURL(blob)
        if (previewFontUrlRef.current) URL.revokeObjectURL(previewFontUrlRef.current)
        previewFontUrlRef.current = newUrl
        if (!previewStyleRef.current) {
          const s = document.createElement('style')
          document.head.appendChild(s)
          previewStyleRef.current = s
        }
        previewStyleRef.current.textContent = `@font-face { font-family: 'CalSansPreview'; src: url('${newUrl}') format('truetype'); font-display: swap; }`
        setPreviewRebuilding(false)
      } else if (msg.type === 'error') {
        setError(msg.message)
        setIsDownloading(false)
        downloadResolveRef.current = null
      }
    }

    return () => {
      workerReadyRef.current = false
      worker.terminate()
      if (previewFontUrlRef.current) URL.revokeObjectURL(previewFontUrlRef.current)
      if (previewStyleRef.current) previewStyleRef.current.remove()
    }
  }, [])

  useEffect(() => { glyphThresholdsRef.current = glyphThresholds }, [glyphThresholds])

  function variantSampleGeom(glyph: string, vi: number, thresholds: number[]): number {
    const def = GROUP_DEFS.find(d => d.glyph === glyph)
    if (!def) return 50
    const lo = vi === 0 ? 0 : thresholds[vi - 1]
    const hi = vi === def.variants.length - 1 ? 100 : thresholds[vi]
    return (lo + hi) / 2
  }

  function pushThresholdHistory() {
    thresholdPastRef.current = [...thresholdPastRef.current, glyphThresholdsRef.current]
    thresholdFutureRef.current = []
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey)) return
      const undo = e.key === 'z' && !e.shiftKey
      const redo = e.key === 'y' || (e.key === 'z' && e.shiftKey)
      if (!undo && !redo) return
      e.preventDefault()
      if (undo) {
        const past = thresholdPastRef.current
        if (past.length === 0) return
        thresholdFutureRef.current = [glyphThresholdsRef.current, ...thresholdFutureRef.current]
        thresholdPastRef.current = past.slice(0, -1)
        setGlyphThresholds(past[past.length - 1])
      } else {
        const future = thresholdFutureRef.current
        if (future.length === 0) return
        thresholdPastRef.current = [...thresholdPastRef.current, glyphThresholdsRef.current]
        thresholdFutureRef.current = future.slice(1)
        setGlyphThresholds(future[0])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    function onEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setShowAscenderModal(false)
    }
    window.addEventListener('keydown', onEscape)
    return () => window.removeEventListener('keydown', onEscape)
  }, [])

  useEffect(() => {
    if (!dragState) return
    function onMove(e: PointerEvent) {
      setDragState(s => s ? { ...s, x: e.clientX, y: e.clientY } : null)
    }
    function onUp(e: PointerEvent) {
      if (!dragState) return
      const s = dragState
      setDragState(null)

      // Trash drop — palette or zone-bin token dragged onto trash zone
      const trashEl = paletteTrashRef.current
      if (trashEl) {
        const tr = trashEl.getBoundingClientRect()
        if (e.clientX >= tr.left && e.clientX <= tr.right && e.clientY >= tr.top && e.clientY <= tr.bottom) {
          if (!s.tok.isDefault) {
            const saved = [...(glyphThresholdsRef.current[s.tok.glyph] ?? GROUP_DEFS.find(d => d.glyph === s.tok.glyph)?.defaultThresholds ?? [])]
            const sg = variantSampleGeom(s.tok.glyph, s.tok.variantIdx, saved)
            const varColors: Record<string, string> = { A11Y: '#c97050', UI: '#999', Base: '#4a7fd4', Geo: '#4aad5c' }
            const col = varColors[s.tok.variantLabel] ?? '#666'
            setTrashedGlyphs(prev => {
              const filtered = prev.filter(t => !(t.glyph === s.tok.glyph && t.variantIdx === s.tok.variantIdx))
              return [...filtered, { glyph: s.tok.glyph, variantIdx: s.tok.variantIdx, variantLabel: s.tok.variantLabel, sourceZone: s.sourceZone, savedThresholds: saved, color: col, sampleGeom: sg }]
            })
            pushThresholdHistory()
            setGlyphThresholds(prev => applyDelete(s.tok.glyph, s.tok.variantIdx, s.sourceZone, prev))
          }
          return
        }
      }

      // Zone drop
      const el = zoneGridRef.current
      let targetZone: string | null = null
      if (el) {
        const rect = el.getBoundingClientRect()
        const pct = (e.clientX - rect.left) / rect.width
        if (pct >= 0 && pct <= 1) {
          const idx = Math.floor(pct * 4)
          targetZone = LANDING_ZONES[idx]?.label ?? null
        }
      }
      // Palette drags: always apply if landed on a zone; bin drags: skip same-zone
      const fromPalette = s.sourceZone === '__palette__'
      if (targetZone !== null && (fromPalette || targetZone !== s.sourceZone)) {
        if (s.tok.isDefault && !fromPalette) {
          pushThresholdHistory()
          setGlyphThresholds(prev => applyDefaultDrop(s.tok.glyph, s.sourceZone, targetZone!, prev))
        } else if (!s.tok.isDefault) {
          setGlyphThresholds(prev => applyDrop(s.tok.glyph, s.tok.variantIdx, targetZone, prev))
        }
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      if (!dragState) return
      e.preventDefault()
      const s = dragState
      const savedThresholds = [...(glyphThresholdsRef.current[s.tok.glyph] ?? GROUP_DEFS.find(d => d.glyph === s.tok.glyph)?.defaultThresholds ?? [])]
      const sg = variantSampleGeom(s.tok.glyph, s.tok.variantIdx, savedThresholds)
      const varColors: Record<string, string> = { A11Y: '#c97050', UI: '#999', Base: '#4a7fd4', Geo: '#4aad5c' }
      const color = varColors[s.tok.variantLabel] ?? LANDING_ZONES.find(z => z.label === s.sourceZone)?.color ?? '#888'
      setTrashedGlyphs(prev => {
        const filtered = prev.filter(t => !(t.glyph === s.tok.glyph && t.variantIdx === s.tok.variantIdx))
        return [...filtered, { glyph: s.tok.glyph, variantIdx: s.tok.variantIdx, variantLabel: s.tok.variantLabel, sourceZone: s.sourceZone, savedThresholds, color, sampleGeom: sg }]
      })
      pushThresholdHistory()
      setGlyphThresholds(prev => applyDelete(s.tok.glyph, s.tok.variantIdx, s.sourceZone, prev))
      setDragState(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('keydown', onKey)
    }
  }, [dragState])

  useEffect(() => {
    if (!workerReadyRef.current) return
    if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current)
    previewDebounceRef.current = setTimeout(() => {
      setPreviewRebuilding(true)
      workerRef.current!.postMessage({
        type: 'previewFont',
        thresholdsJson: JSON.stringify(glyphThresholds),
        autoAscender,
      })
    }, 200)
    return () => {
      if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current)
    }
  }, [glyphThresholds, autoAscender])

  const measureDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!workerReadyRef.current) return
    if (measureDebounceRef.current) clearTimeout(measureDebounceRef.current)
    measureDebounceRef.current = setTimeout(() => {
      workerRef.current!.postMessage({
        type: 'measureWords',
        wordsJson: JSON.stringify([...PREVIEW_WORDS]),
        geomValuesJson: JSON.stringify([defaultsRef.current['GEOM'] ?? 0, ...LANDING_ZONES.map(z => z.mid)]),
        axisDefaultsJson: JSON.stringify(defaultsRef.current),
      })
    }, 400)
    return () => { if (measureDebounceRef.current) clearTimeout(measureDebounceRef.current) }
  }, [defaults])

  // Export-default change (sidebar dials, zone-tab clicks, presets, Type Matrix).
  // Also clears any preview override for that axis so the preview reflects the
  // new export default.
  function handleSliderChange(tag: string, value: number) {
    const next = { ...defaultsRef.current, [tag]: value }
    defaultsRef.current = next
    setDefaults(next)
    setPreviewOverrides(prev => {
      if (!(tag in prev)) return prev
      const n = { ...prev }; delete n[tag]; return n
    })
  }

  // Preview-only axis change (canvas pills). Does NOT touch export defaults.
  function handlePreviewChange(tag: string, value: number) {
    setPreviewOverrides(prev => ({ ...prev, [tag]: value }))
  }

  // Continuous under-damped spring per axis (k=90, c=7 → ~28% overshoot/bounce).
  function kickAxisSpring(tag: string, target: number) {
    let s = axisSprings.current[tag]
    if (!s) { s = { x: target, v: 0, target, raf: null }; axisSprings.current[tag] = s }
    s.target = target
    if (s.raf != null) return  // already chasing this axis
    let last = performance.now()
    const step = (now: number) => {
      let dt = Math.min((now - last) / 1000, 1 / 30); last = now
      const sub = 4, h = dt / sub, k = 90, c = 10
      for (let i = 0; i < sub; i++) {
        const a = -k * (s.x - s.target) - c * s.v
        s.v += a * h; s.x += s.v * h
      }
      if (Math.abs(s.x - s.target) < 0.05 && Math.abs(s.v) < 0.3) {
        s.x = s.target; s.v = 0; s.raf = null
        setAnimAxis(p => ({ ...p, [tag]: s.target })); return
      }
      setAnimAxis(p => ({ ...p, [tag]: s.x }))
      s.raf = requestAnimationFrame(step)
    }
    s.raf = requestAnimationFrame(step)
  }

  // Drive each damped axis toward its current target. GEOM only damped under HOI.
  // When easing is off, snap to targets instantly (no spring/bounce).
  useEffect(() => {
    const damped = ['opsz', 'wght', 'YTAS', 'SHRP', 'ital']
    if (!springEasing) {
      for (const s of Object.values(axisSprings.current)) if (s.raf != null) { cancelAnimationFrame(s.raf); s.raf = null }
      const next: Record<string, number> = {}
      for (const tag of damped) {
        const ax = axes.find(a => a.tag === tag)
        if (ax) next[tag] = previewOverrides[tag] ?? defaults[tag] ?? ax.default
      }
      if (useHoi) next['GEOM'] = previewOverrides['GEOM'] ?? defaults['GEOM'] ?? geomAxis?.default ?? 25
      setAnimAxis(next)
      return
    }
    for (const tag of damped) {
      const ax = axes.find(a => a.tag === tag)
      if (ax) kickAxisSpring(tag, previewOverrides[tag] ?? defaults[tag] ?? ax.default)
    }
    const gTarget = previewOverrides['GEOM'] ?? defaults['GEOM'] ?? geomAxis?.default ?? 25
    if (useHoi) {
      kickAxisSpring('GEOM', gTarget)
    } else {
      const s = axisSprings.current['GEOM']
      if (s?.raf != null) { cancelAnimationFrame(s.raf); s.raf = null }
      setAnimAxis(p => { const n = { ...p }; delete n['GEOM']; return n })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewOverrides, defaults, useHoi, axes, springEasing])

  useEffect(() => () => {
    for (const s of Object.values(axisSprings.current)) if (s.raf != null) cancelAnimationFrame(s.raf)
  }, [])

  // Reset the PREVIEW pills back to the export defaults. Clears the preview
  // override layer + size/tracking. Does NOT touch export defaults or thresholds.
  function resetTypography() {
    setPreviewOverrides({})
    setPreviewSize(36)
    setTracking(0)
  }

  // Reset all glyph conditions (thresholds + trash) AND the opsz mapping to
  // defaults. Run at the top of every preset so a previous preset's edits don't
  // carry over (presets that need a non-default override these afterwards).
  function resetConditions() {
    pushThresholdHistory()
    setGlyphThresholds(Object.fromEntries(GROUP_DEFS.map(g => [g.glyph, [...g.defaultThresholds]])))
    setTrashedGlyphs([])
    setOpszMultiplier(1)
    setFrozenOpszValue(null)
    setScaledOpsz(false)
  }

  async function downloadTTF() {
    if (!workerRef.current || isDownloading) return
    setIsDownloading(true)

    // Exclude opsz from axis defaults — handled separately via multiplier
    const axisDefaults = Object.fromEntries(
      Object.entries(defaultsRef.current).filter(([tag]) => tag !== 'opsz')
    )

    const ttfBuffer = await new Promise<ArrayBuffer>((resolve) => {
      downloadResolveRef.current = resolve
      workerRef.current!.postMessage({
        type: 'applyConfig',
        configJson: JSON.stringify({
          axisDefaults,
          opszMultiplier,
          freezeOpsz,
          autoAscender,
          thresholds: glyphThresholdsRef.current,
        }),
      })
    })

    const blob = new Blob([new Uint8Array(ttfBuffer)], { type: 'font/ttf' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'ReCal Sans X shift example.ttf'
    a.click()
    URL.revokeObjectURL(url)
    setIsDownloading(false)
  }

  const isLoading = axes.length === 0 && !error

  // Auto Ascender grafts Flex's avar2 onto whatever font is active (no HOI needed).
  const autoAscActive = autoAscender
  // ital is a PREVIEW pill only — not an export Axis Default (nobody wants an italic default).
  const designAxes = axes.filter((a) => a.tag !== 'opsz' && a.tag !== 'GEOM' && a.tag !== 'ital' && !PARAMETRIC_TAGS.has(a.tag))
  const italAxis = axes.find((a) => a.tag === 'ital')
  // Fine step for narrow-range axes (e.g. ital 0–1) so they slide smoothly.
  const axisStep = (a: AxisInfo) => (a.max - a.min <= 2 ? 0.01 : 1)
  // When auto-ascender is active, YTAS is driven by the font's avar2 → hide it.
  const parametricAxes = axes.filter((a) => PARAMETRIC_TAGS.has(a.tag) && !(autoAscActive && a.tag === 'YTAS'))
  const opszAxis = axes.find((a) => a.tag === 'opsz')
  const geomAxis = axes.find((a) => a.tag === 'GEOM')

  // Current preview value for an axis: pill override falls back to the export default.
  const previewVal = (tag: string) =>
    previewOverrides[tag] ?? defaults[tag] ?? (axes.find(a => a.tag === tag)?.default ?? 0)
  const isOverridden = (tag: string) => tag in previewOverrides
  const hasOverrides = Object.keys(previewOverrides).length > 0 || previewSize !== 36 || tracking !== 0
  // Spring-eased value used for rendering (falls back to the instant target).
  const displayVal = (tag: string) => animAxis[tag] ?? previewVal(tag)

  function previewVarSettings(fontSize: number, geomOverride?: number, opszOverride?: number, source: 'preview' | 'export' = 'preview') {
    const parts = axes
      .filter((a) => a.tag !== 'opsz')
      // Auto-ascender active → let the font's avar2 derive YTAS from opsz (don't emit it)
      .filter((a) => !(autoAscActive && a.tag === 'YTAS'))
      .map((a) => {
        const axisVal = source === 'export' ? (defaults[a.tag] ?? a.default) : displayVal(a.tag)
        const val = (a.tag === 'GEOM' && geomOverride !== undefined) ? geomOverride : axisVal
        return `'${a.tag}' ${val}`
      })
    if (opszAxis) {
      const opsz = opszOverride !== undefined
        ? Math.min(Math.max(opszOverride, opszAxis.min), opszAxis.max)
        : frozenOpszValue !== null
          ? Math.min(Math.max(frozenOpszValue, opszAxis.min), opszAxis.max)
          : Math.min(Math.max(fontSize / opszMultiplier, opszAxis.min), opszAxis.max)
      parts.push(`'opsz' ${opsz.toFixed(1)}`)
    }
    return parts.join(', ') || 'normal'
  }


  const ytasAxis = axes.find(a => a.tag === 'YTAS')
  const autoYtasValue = (ytasAxis && autoAscender && opszAxis) ? (() => {
    const effectiveOpsz = (defaults['opsz'] ?? opszAxis.default) * opszMultiplier
    const minOpsz = opszAxis.min * opszMultiplier
    const maxOpsz = opszAxis.max * opszMultiplier
    const t = Math.max(0, Math.min(1, (effectiveOpsz - minOpsz) / (maxOpsz - minOpsz)))
    return Math.round(ytasAxis.min + t * (ytasAxis.max - ytasAxis.min))
  })() : null

  // Active zone for the current GEOM. When GEOM sits in a transition gutter
  // between named zones, fall back to the nearest zone so the preview never
  // disappears.
  const nearestZoneLabel = (geom: number) => {
    const dist = (z: typeof LANDING_ZONES[0]) =>
      geom < z.start ? z.start - geom : geom > z.end ? geom - z.end : 0
    return (
      LANDING_ZONES.find(z => geom >= z.start && geom <= z.end) ??
      LANDING_ZONES.reduce((best, z) => (dist(z) < dist(best) ? z : best))
    ).label
  }
  // STANDARD/filled tab tracks the EXPORT GEOM default; the preview content +
  // outline track the (possibly overridden) preview GEOM.
  const exportZoneName = nearestZoneLabel(defaults['GEOM'] ?? 0)
  const previewZoneName = nearestZoneLabel(previewVal('GEOM'))
  const activeZoneName = previewZoneName

  function renderSlider(axis: AxisInfo) {
    const isAuto = axis.tag === 'YTAS' && autoYtasValue !== null
    const val = isAuto ? autoYtasValue! : (defaults[axis.tag] ?? axis.default)
    return (
      <div key={axis.tag} className={`dial-axis-row${isAuto ? ' axis-row--auto' : ''}`}>
        <Slider
          label={`${axis.name} · ${axis.tag}`}
          value={val}
          onChange={(v) => handleSliderChange(axis.tag, v)}
          min={axis.min}
          max={axis.max}
          step={axisStep(axis)}
        />
      </div>
    )
  }

  return (
    <div className={`app${springEasing ? '' : ' app--no-anim'}`}>
      <header>
        <div>
          <h1>ReCal Sans</h1>
          <p className="subtitle">Cal Sans Customizer</p>
        </div>
        <p className="attribution">
          This tool has been wholly inspired by the <span className="emoji">🐐</span>{' '}
          <a href="https://input.djr.com/download/" target="_blank" rel="noopener noreferrer">
            DJR's Input font download customizer
          </a>
          , repurposed by WORDMARK to make the Cal Sans OFL mission more accessible.
        </p>
        <div className="download-gate">
          <label className={`ofl-checkbox${oflAttempted && !oflAgreed ? ' ofl-checkbox--required' : ''}`} id="ofl-label">
            <input
              type="checkbox"
              checked={oflAgreed}
              onChange={e => setOflAgreed(e.target.checked)}
            />
            I accept the{' '}
            <a
              href="https://openfontlicense.org/open-font-license-official-text/"
              target="_blank"
              rel="noopener noreferrer"
              className="ofl-inline-link"
              onClick={e => e.stopPropagation()}
            >OFL 1.1</a>
          </label>
          <button
            disabled={isDownloading || axes.length === 0}
            onClick={() => {
              if (!oflAgreed) { setOflAttempted(true); return }
              downloadTTF()
            }}
          >
            {isDownloading ? 'Generating…' : 'Download Custom TTF'}
          </button>
        </div>
      </header>

      {error && (
        <div className="error">
          <p>Error:</p>
          <pre>{error}</pre>
        </div>
      )}

      {isLoading && !error && (
        <div className="loading">
          <div className="spinner" />
          <p>{loadMsg}</p>
          <p className="loading-note">First load takes 10–20s while the font engine downloads.</p>
        </div>
      )}

      {!isLoading && !error && (
        <div className="main-layout">
          <button
            className="controls-toggle"
            onClick={() => setMenuOpen(o => !o)}
            aria-expanded={menuOpen}
          >
            <span className="controls-toggle-icon">{menuOpen ? '✕' : '☰'}</span>
            {menuOpen ? 'Hide controls' : 'Controls & export'}
          </button>
          <section className={`controls dialkit-root${menuOpen ? ' controls--open' : ''}`} data-theme="dark">

            {opszAxis && (
              <div className="control-group">
                <h2>Optical Size Scale</h2>
                <div className="dial-axis-row">
                  <Slider
                    label={`Opsz → ${Math.round(opszAxis.min * opszMultiplier)}–${Math.round(opszAxis.max * opszMultiplier)}pt`}
                    value={opszMultiplier}
                    onChange={(v) => setOpszMultiplier(Math.round(v))}
                    min={1}
                    max={6}
                    step={1}
                    unit="×"
                  />
                </div>
                <label className="hoi-toggle" style={{ marginTop: 10 }}>
                  <input type="checkbox" checked={freezeOpsz} onChange={(e) => setFreezeOpsz(e.target.checked)} />
                  <span>Freeze opsz</span>
                </label>
                <p className="control-note">
                  Bakes a fixed optical size into the export.
                </p>
              </div>
            )}

            {designAxes.length > 0 && (
              <div className="control-group">
                <h2>Axis Defaults</h2>
                {designAxes.map(renderSlider)}
              </div>
            )}

            {parametricAxes.length > 0 && (
              <div className="control-group">
                <h2>Parametric</h2>
                {parametricAxes.map(renderSlider)}
              </div>
            )}

            <div className="control-group">
              <h2>Customizer Performance</h2>
              <label className="hoi-toggle">
                <input type="checkbox" checked={springEasing} onChange={(e) => setSpringEasing(e.target.checked)} />
                <span>Spring easing</span>
              </label>
              <p className="control-note">
                Damped “bounce” on the font axes + interface motion. Off = everything instant.
              </p>
            </div>

            <div className="control-group">
              <h2>Experimental</h2>
              <label className="hoi-toggle">
                <input type="checkbox" checked={useHoi} onChange={(e) => setUseHoi(e.target.checked)} />
                <span>HOI interpolation</span>
              </label>
              <p className="control-note">
                Higher-order (parabolic) interpolation along GEOM — affects all parts, not just <em>y</em>.
              </p>
              {ytasAxis && (
                <>
                  <label className="hoi-toggle" style={{ marginTop: 12 }}>
                    <input type="checkbox" checked={autoAscender} onChange={(e) => setAutoAscender(e.target.checked)} />
                    <span>Auto Ascender Height</span>
                  </label>
                  <p className="control-note">
                    Grafts the avar2 block so YTAS tracks opsz; the axis is hidden. Works with or without HOI.
                  </p>
                  {autoAscender && (
                    <button className="auto-ascender-preview-btn" onClick={() => setShowAscenderModal(true)}>
                      View ascender waterfall
                    </button>
                  )}
                </>
              )}
            </div>
          </section>

          <section className="preview">
            <div className="presets-row">
              <span className="presets-label">Presets</span>
              <button className={`preset-btn${activePreset === 'Mobile UI' ? ' preset-btn--active' : ''}`} onClick={() => {
                setActivePreset('Mobile UI'); resetConditions(); setScaledOpsz(false)
                setFrozenOpszValue(null); handleSliderChange('GEOM', 25)
                setGlyphThresholds(prev => ({ ...prev, l: [26] }))
              }}>Mobile UI</button>
              <button className={`preset-btn${activePreset === 'Display' ? ' preset-btn--active' : ''}`} onClick={() => {
                setActivePreset('Display'); resetConditions(); setScaledOpsz(false)
                setFrozenOpszValue(null); handleSliderChange('GEOM', 50)
              }}>Display</button>
              <button className={`preset-btn${activePreset === 'Wayfinding' ? ' preset-btn--active' : ''}`} onClick={() => {
                setActivePreset('Wayfinding'); resetConditions(); setScaledOpsz(false)
                setFrozenOpszValue(null); handleSliderChange('GEOM', 5); setOpszMultiplier(6)
              }}>Wayfinding</button>

              {!presetsExpanded && (
                <button className="preset-btn preset-btn--more" onClick={() => setPresetsExpanded(true)}>+ 8 more</button>
              )}
              {presetsExpanded && <>
                <button className={`preset-btn${activePreset === 'Futura' ? ' preset-btn--active' : ''}`} onClick={() => {
                  setActivePreset('Futura'); resetConditions(); setScaledOpsz(false)
                  setFrozenOpszValue(16)
                  handleSliderChange('GEOM', 100); handleSliderChange('YTAS', 800); handleSliderChange('SHRP', 100)
                }}>Futura</button>
                <button className={`preset-btn preset-btn--bifamily${activePreset === 'Neutra 2' ? ' preset-btn--active' : ''}`} onClick={() => {
                  setActivePreset('Neutra 2'); resetConditions(); setScaledOpsz(true); setOpszMultiplier(0.625)
                  setFrozenOpszValue(null)
                  handleSliderChange('GEOM', 25); handleSliderChange('YTAS', 800); handleSliderChange('SHRP', 100)
                  setGlyphThresholds(prev => { let t = applyDelete('a', 0, 'A11Y', prev); t = applyDrop('y', 2, 'UI', t); return t })
                }}>
                  <span>Neutra 2</span>
                  <span className="preset-btn-subfamily">Text · Display</span>
                </button>
                <button className={`preset-btn preset-btn--bifamily${activePreset === 'Inter' ? ' preset-btn--active' : ''}`} onClick={() => {
                  setActivePreset('Inter'); resetConditions(); setScaledOpsz(true); setOpszMultiplier(0.625)
                  setFrozenOpszValue(null); handleSliderChange('GEOM', 25)
                }}>
                  <span>Inter</span>
                  <span className="preset-btn-subfamily">UI · Display</span>
                </button>
                <button className={`preset-btn${activePreset === 'Circular' ? ' preset-btn--active' : ''}`} onClick={() => {
                  setActivePreset('Circular'); resetConditions(); setScaledOpsz(false)
                  setFrozenOpszValue(20); handleSliderChange('GEOM', 25)
                }}>Circular</button>
                <button className={`preset-btn${activePreset === 'Gotham' ? ' preset-btn--active' : ''}`} onClick={() => {
                  setActivePreset('Gotham'); resetConditions(); setScaledOpsz(false)
                  setFrozenOpszValue(8); handleSliderChange('GEOM', 25); handleSliderChange('YTAS', 786)
                  setGlyphThresholds(prev => { let t = applyDelete('a', 0, 'A11Y', prev); t = applyDrop('j', 1, 'UI', t); return t })
                }}>Gotham</button>
                <button className={`preset-btn${activePreset === 'Geist' ? ' preset-btn--active' : ''}`} onClick={() => {
                  setActivePreset('Geist'); resetConditions(); setScaledOpsz(false)
                  setFrozenOpszValue(16); handleSliderChange('GEOM', 50)
                  setGlyphThresholds(prev => applyDrop('a', 0, 'Base', prev))
                }}>Geist</button>
                <button className={`preset-btn${activePreset === 'Poppins' ? ' preset-btn--active' : ''}`} onClick={() => {
                  setActivePreset('Poppins'); resetConditions(); setScaledOpsz(false)
                  setFrozenOpszValue(10); handleSliderChange('GEOM', 50)
                  setGlyphThresholds(prev => applyDrop('y', 2, 'Base', prev))
                }}>Poppins</button>
                <button className={`preset-btn${activePreset === 'GT America' ? ' preset-btn--active' : ''}`} onClick={() => {
                  setActivePreset('GT America'); resetConditions(); setScaledOpsz(false)
                  setFrozenOpszValue(8); handleSliderChange('GEOM', 25)
                  setGlyphThresholds(prev => applyDelete('a', 0, 'A11Y', prev))
                }}>GT America</button>
              </>}
              {(activePreset === 'Neutra 2' || activePreset === 'Inter') && (
                <label className="preset-scaled-label">
                  <input type="checkbox" checked={scaledOpsz} onChange={e => {
                    setScaledOpsz(e.target.checked)
                    setOpszMultiplier(e.target.checked ? 0.625 : 1)
                  }} />
                  scaled
                </label>
              )}
            </div>

            {axes.length > 0 && (() => {
              // Build variant→zone color map for palette coloring
              const zoneTokenMap = getZoneTokens(glyphThresholds)
              const variantZoneColor: Record<string, string> = {}
              LANDING_ZONES.forEach(z => {
                ;(zoneTokenMap[z.label] ?? []).forEach(tok => {
                  if (!tok.isDefault) variantZoneColor[`${tok.glyph}-${tok.variantIdx}`] = z.color
                })
              })

              const geomDefault = defaults['GEOM'] ?? geomAxis?.default ?? 25

              const dragTargetZone = dragState && zoneGridRef.current ? (() => {
                const rect = zoneGridRef.current!.getBoundingClientRect()
                const pct = (dragState.x - rect.left) / rect.width
                if (pct < 0 || pct > 1) return null
                return LANDING_ZONES[Math.floor(pct * 4)]?.label ?? null
              })() : null

              // Is drag currently over the trash zone?
              const isDragOverTrash = dragState && paletteTrashRef.current ? (() => {
                const tr = paletteTrashRef.current!.getBoundingClientRect()
                return dragState.x >= tr.left && dragState.x <= tr.right && dragState.y >= tr.top && dragState.y <= tr.bottom
              })() : false

              return (
              <><div className="zone-area-wrap">
                {/* ── Zone columns ── */}
                <div className={`zone-grid${previewRebuilding ? ' zone-grid--rebuilding' : ''}`} ref={zoneGridRef}>
                  {LANDING_ZONES.map((z) => {
                    const isStandard = exportZoneName === z.label   // export GEOM default
                    const isPreviewing = previewZoneName === z.label // currently previewing
                    const isDragTarget = dragTargetZone === z.label
                    return (
                      <div
                        key={z.label}
                        className={`zone-col${isStandard ? ' zone-col--active' : ''}${isPreviewing && !isStandard ? ' zone-col--previewing' : ''}${isDragTarget ? ' zone-col--drag-target' : ''}`}
                        style={{ '--zone-color': z.label === 'UI' ? '#fff' : z.color, '--zone-active-bg': z.label === 'UI' ? '#fff' : z.color } as React.CSSProperties}
                      >
                        <div className="zone-col-header" onClick={() => handleSliderChange('GEOM', z.mid)} style={{ cursor: 'pointer' }}>
                          <div className="zone-col-topbar" />
                          <div className="zone-col-header-inner">
                            <span className="zone-col-icon">{isStandard ? '◉' : '○'}</span>
                            <div className="zone-col-header-text">
                              <span className="zone-col-sublabel">{isStandard ? 'STANDARD' : isPreviewing ? 'PREVIEWING' : 'SECRET VARIATION ZONE'}</span>
                              <span className="zone-col-name">{z.label === 'A11Y' ? 'A11y' : z.label}</span>
                            </div>
                          </div>
                          <div className="zone-col-bottombar" />
                        </div>
                      </div>
                    )
                  })}
                </div>

              </div>
                {/* ── Full-width preview + type tester ── */}
                {(() => {
                  // Top blocks = canonical EXPORT view (stable). Tester = live preview.
                  const exportAz = LANDING_ZONES.find(z => z.label === exportZoneName)!
                  const previewAz = LANDING_ZONES.find(z => z.label === previewZoneName)!
                  const smallSz = opszAxis ? Math.round(opszAxis.default * opszMultiplier) : Math.round(14 * opszMultiplier)
                  const largeSz = opszAxis ? Math.round(opszAxis.max * opszMultiplier) : Math.round(32 * opszMultiplier)
                  const smallOpsz = opszAxis?.default ?? 14
                  const largeOpsz = opszAxis?.max ?? 32
                  // Spring-eased GEOM drives the morph (HOI only; null otherwise).
                  const topGeom = animAxis['GEOM'] ?? exportAz.mid
                  const testerGeom = animAxis['GEOM'] ?? previewAz.mid
                  const baseStyle = { fontFamily: "'CalSansPreview','CalSansVF',sans-serif", fontOpticalSizing: 'none' as const, fontFeatureSettings: "'rclt' 1" as const }
                  const smallStyle = { ...baseStyle, fontSize: `${smallSz}pt`, fontVariationSettings: previewVarSettings(smallSz, topGeom, undefined, 'export') }
                  const largeStyle = { ...baseStyle, fontSize: `${largeSz}pt`, fontVariationSettings: previewVarSettings(largeSz, topGeom, undefined, 'export') }
                  return (
                    <>
                      {/* Default/Max samples = export view — OUTSIDE the preview box */}
                      <div className="zone-preview-row">
                        <div className="zone-preview-block">
                          <p className="zone-col-word" style={smallStyle}>{PREVIEW_WORDS.join(' ')}</p>
                          <div className="zone-preview-label"><span className="zpl-kind">Default</span><span>opsz {Math.round(smallOpsz)}pt</span></div>
                        </div>
                        <div className="zone-preview-block">
                          <p className="zone-col-word" style={largeStyle}>{PREVIEW_WORDS.join(' ')}</p>
                          <div className="zone-preview-label"><span className="zpl-kind">Max</span><span>opsz {Math.round(largeOpsz)}pt</span></div>
                        </div>
                      </div>

                      <div className="zone-full-preview" style={{ '--zone-color': previewAz.color } as React.CSSProperties}>
                      <div className="pill-slider-rows dialkit-root" data-theme="dark">
                        <div className="pill-rows-header">
                          <span className="pill-rows-caption">Preview</span>
                          <button
                            className={`pill-reset-btn${hasOverrides ? ' pill-reset-btn--active' : ''}${resetSpin ? ' pill-reset-btn--spin' : ''}`}
                            title="Reset preview to export defaults"
                            disabled={!hasOverrides}
                            onClick={() => { resetTypography(); setResetSpin(true) }}
                            onAnimationEnd={() => setResetSpin(false)}
                          ><ResetIcon /></button>
                        </div>
                        <div className="pill-row pill-row--wide">
                          <div className={`pill-slider${previewSize !== 36 ? ' pill-slider--overridden' : ''}`}>
                            <Slider label="size" value={previewSize} onChange={(v) => setPreviewSize(Math.round(v))} min={12} max={200} step={1} unit="pt" />
                          </div>
                          <div className={`pill-slider${tracking !== 0 ? ' pill-slider--overridden' : ''}`}>
                            <Slider label="tracking" value={tracking} onChange={(v) => setTracking(Math.round(v))} min={-10} max={30} step={1} unit="%" />
                          </div>
                        </div>
                        {(() => {
                          const axisList = [opszAxis, geomAxis, ...designAxes, ...(italAxis ? [italAxis] : []), ...parametricAxes]
                            .filter((a): a is AxisInfo => !!a)
                          return (
                            <>
                              {/* Horizontal pills above 400px */}
                              <div className="pill-row pill-row--axes-h">
                                {axisList.map((a) => (
                                  <div className={`pill-slider${isOverridden(a.tag) ? ' pill-slider--overridden' : ''}`} key={a.tag}>
                                    <Slider label={a.tag} value={previewVal(a.tag)} onChange={(v) => handlePreviewChange(a.tag, v)} min={a.min} max={a.max} step={axisStep(a)} />
                                  </div>
                                ))}
                              </div>
                              {/* Vertical 100px sliders under 400px */}
                              <div className="pill-row pill-row--axes-v">
                                {axisList.map((a) => (
                                  <VAxisSlider
                                    key={a.tag}
                                    label={a.tag}
                                    value={previewVal(a.tag)}
                                    min={a.min} max={a.max} step={axisStep(a)}
                                    overridden={isOverridden(a.tag)}
                                    onChange={(v) => handlePreviewChange(a.tag, v)}
                                  />
                                ))}
                              </div>
                            </>
                          )
                        })()}
                      </div>

                      <textarea
                        ref={typeTesterRef}
                        className="zone-type-tester"
                        value={typeTesterText}
                        spellCheck={false}
                        rows={1}
                        onChange={e => setTypeTesterText(e.target.value)}
                        style={{ ...largeStyle, fontSize: `${previewSize}pt`, fontVariationSettings: previewVarSettings(previewSize, testerGeom, previewOverrides['opsz'] !== undefined ? displayVal('opsz') : undefined, 'preview'), letterSpacing: `${tracking / 100}em` }}
                      />
                      </div>
                    </>
                  )
                })()}</>
              )
            })()}


            {axes.length > 0 && (() => {
              const gd = defaults['GEOM'] ?? geomAxis?.default ?? 25
              // Fixed zone rows: A11y (orange) top, Base (blue) middle, Geo (green) bottom.
              // Each glyph fills the rows for variants it has; defaults aren't shown.
              const ZONE_ROWS: { label: VariantLabel; color: string; geom: number }[] = [
                { label: 'A11Y', color: '#c97050', geom: 0 },
                { label: 'Base', color: '#4a7fd4', geom: 50 },
                { label: 'Geo', color: '#4aad5c', geom: 100 },
              ]
              return (
                <div className="glyph-strip">
                  {GROUP_DEFS.map(def => {
                    const t = glyphThresholds[def.glyph] ?? [...def.defaultThresholds]
                    const activeVi = Math.min(t.reduce((acc, thresh) => (gd >= thresh ? acc + 1 : acc), 0), def.variants.length - 1)
                    const activeLabel = def.variants[activeVi]?.label
                    return (
                      <div key={def.glyph} className="glyph-strip-col">
                        {ZONE_ROWS.map(zr => {
                          const hasZone = def.variants.some(v => v.label === zr.label)
                          const masterActive = activeLabel === 'default' || activeLabel === 'UI'
                          const isActive = hasZone ? activeLabel === zr.label : masterActive
                          return (
                            <span
                              key={zr.label}
                              className={`glyph-strip-token${isActive ? ' glyph-strip-token--active' : ''}`}
                              style={{
                                fontFamily: "'CalSansPreview','CalSansVF',sans-serif",
                                fontVariationSettings: hasZone ? `'GEOM' ${zr.geom}, 'opsz' 22` : "'GEOM' 25, 'opsz' 22",
                                fontFeatureSettings: hasZone ? "'rclt' 1" : "'rclt' 0",
                                fontOpticalSizing: 'none',
                                color: hasZone ? zr.color : '#555',
                                opacity: isActive ? 1 : 0.3,
                              } as React.CSSProperties}
                            >{def.glyph}</span>
                          )
                        })}
                      </div>
                    )
                  })}
                </div>
              )
            })()}

            <div className="xray-toggle-row xray-toggle-row--left">
              <button className="xray-toggle-btn" onClick={() => setShowXRay(v => !v)}>
                {showXRay ? 'Hide Type Matrix' : 'Type Matrix'}
              </button>
              {showXRay && (
                <button
                  className="xray-toggle-btn"
                  style={{ marginLeft: 8 }}
                  onClick={() => {
                    pushThresholdHistory()
                    setGlyphThresholds(Object.fromEntries(GROUP_DEFS.map(g => [g.glyph, [...g.defaultThresholds]])))
                    setTrashedGlyphs([])
                  }}
                >
                  Reset
                </button>
              )}
            </div>

            {showXRay && geomAxis && (
              <GlyphGroups
                thresholds={glyphThresholds}
                geomDefault={defaults['GEOM'] ?? geomAxis.default}
                defaults={defaults}
                opszDefault={opszAxis?.default ?? 14}
                onThresholdChange={(glyph, t) =>
                  setGlyphThresholds(prev => ({ ...prev, [glyph]: t }))
                }
                onGeomChange={(v) => handleSliderChange('GEOM', v)}
                varSettingsForGeom={(geom) => previewVarSettings(previewSize, geom)}
                previewSize={previewSize}
                hidePreviewWords={true}
                onThresholdDragStart={pushThresholdHistory}
              />
            )}

            {trashedGlyphs.length > 0 && (
              <div className="trash-bar">
                <span className="trash-bar-label">Deleted</span>
                {trashedGlyphs.map((item) => (
                  <span
                    key={`${item.glyph}-${item.variantIdx}`}
                    className="zone-token trash-token"
                    title={`Restore ${item.glyph} (${item.variantLabel})`}
                    style={{
                      fontVariationSettings: previewVarSettings(32, LANDING_ZONES.find(z => z.label === item.sourceZone)?.sampleGeom ?? 50),
                      fontFeatureSettings: "'rclt' 1",
                      color: item.color,
                      '--zone-color': item.color,
                    } as React.CSSProperties}
                    onClick={() => {
                      pushThresholdHistory()
                      setGlyphThresholds(prev => ({ ...prev, [item.glyph]: item.savedThresholds }))
                      setTrashedGlyphs(prev => prev.filter(t => t.glyph !== item.glyph || t.variantIdx !== item.variantIdx))
                    }}
                  >
                    {item.glyph}
                  </span>
                ))}
              </div>
            )}

          </section>
        </div>
      )}

      {showAscenderModal && ytasAxis && opszAxis && (
        <div className="modal-overlay" onClick={() => setShowAscenderModal(false)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Ascender Height Waterfall</h2>
              <button className="modal-close" onClick={() => setShowAscenderModal(false)}>✕</button>
            </div>
            <p className="control-note">
              How YTAS varies across the opsz range at ×{opszMultiplier} scale. The auto mode maps this linearly — avar2 integration pending.
            </p>
            <div className="waterfall">
              {Array.from({ length: 7 }, (_, i) => {
                const t = i / 6
                const rawOpsz = opszAxis.min + t * (opszAxis.max - opszAxis.min)
                const displayOpsz = Math.round(rawOpsz * opszMultiplier)
                const ytas = Math.round(ytasAxis.min + t * (ytasAxis.max - ytasAxis.min))
                const varSettings = axes
                  .filter(a => a.tag !== 'opsz')
                  .map(a => `'${a.tag}' ${a.tag === 'YTAS' ? ytas : (defaults[a.tag] ?? a.default)}`)
                  .concat([`'opsz' ${rawOpsz.toFixed(1)}`])
                  .join(', ')
                const fontSize = Math.round(14 + t * 42)
                return (
                  <div key={i} className="waterfall-row">
                    <div className="waterfall-meta">
                      <span className="waterfall-opsz">{displayOpsz}pt</span>
                      <span className="waterfall-ytas">YTAS {ytas}</span>
                    </div>
                    <p className="waterfall-text" style={{
                      fontSize,
                      fontVariationSettings: varSettings,
                    }}>
                      High
                    </p>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {previewModal && (() => {
        const m = previewModal
        const modalVarSettings = axes.map(a => `'${a.tag}' ${m.axisValues[a.tag] ?? a.default}`).join(', ')
        const setAxis = (tag: string, v: number) =>
          setPreviewModal(prev => prev && ({ ...prev, axisValues: { ...prev.axisValues, [tag]: v } }))
        const shrpAxis = axes.find(a => a.tag === 'SHRP')
        const wghtAxis = axes.find(a => a.tag === 'wght')

        return (
          <div className="preview-modal-overlay" onClick={() => setPreviewModal(null)}>
            <div className="preview-modal-panel" onClick={e => e.stopPropagation()}>

              <div className="preview-modal-header">
                <span>
                  {exportZoneName === m.zone.label
                    ? 'Default font preview'
                    : <><span style={{ color: m.zone.color }}>{m.zone.label}</span> variable feature preview</>
                  }
                </span>
                <button className="modal-close" onClick={() => setPreviewModal(null)}>✕</button>
              </div>

              <div className="pm-top-row">
                <div className="pm-ctrl">
                  <div className="pm-label">Size <span className="pm-val">{m.size}px</span></div>
                  <input type="range" min={12} max={200} step={1} value={m.size}
                    onChange={e => setPreviewModal(prev => prev && ({ ...prev, size: +e.target.value }))} />
                </div>
                <div className="pm-ctrl">
                  <div className="pm-label">Spacing <span className="pm-val">{m.spacing > 0 ? '+' : ''}{m.spacing}%</span></div>
                  <input type="range" min={-10} max={30} step={1} value={m.spacing}
                    onChange={e => setPreviewModal(prev => prev && ({ ...prev, spacing: +e.target.value }))} />
                </div>
              </div>

              <div className="pm-axes-row">
                {opszAxis && (
                  <div className="pm-ctrl">
                    <div className="pm-label">Optical Size <span className="pm-val">{Math.round(m.axisValues['opsz'] ?? opszAxis.default)}</span></div>
                    <input type="range" min={opszAxis.min} max={opszAxis.max} step={1}
                      value={m.axisValues['opsz'] ?? opszAxis.default}
                      onChange={e => setAxis('opsz', +e.target.value)} />
                  </div>
                )}
                {geomAxis && (
                  <div className="pm-ctrl pm-ctrl--geom">
                    <div className="pm-label">Geometric Form <span className="pm-val">{Math.round(m.axisValues['GEOM'] ?? geomAxis.default)}</span></div>
                    <div className="pm-zone-tabs">
                      {LANDING_ZONES.map(z => (
                        <button key={z.label}
                          className={`pm-zone-tab${m.zone.label === z.label ? ' active' : ''}`}
                          style={{ '--tab-color': z.color } as React.CSSProperties}
                          onClick={() => setPreviewModal(prev => prev && ({
                            ...prev, zone: z, axisValues: { ...prev.axisValues, GEOM: z.mid }
                          }))}
                        >{z.label}</button>
                      ))}
                    </div>
                    <input type="range" min={geomAxis.min} max={geomAxis.max} step={1}
                      value={m.axisValues['GEOM'] ?? geomAxis.default}
                      onChange={e => setAxis('GEOM', +e.target.value)} />
                  </div>
                )}
                {wghtAxis && (
                  <div className="pm-ctrl">
                    <div className="pm-label">Weight <span className="pm-val">{Math.round(m.axisValues['wght'] ?? wghtAxis.default)}</span></div>
                    <input type="range" min={wghtAxis.min} max={wghtAxis.max} step={1}
                      value={m.axisValues['wght'] ?? wghtAxis.default}
                      onChange={e => setAxis('wght', +e.target.value)} />
                  </div>
                )}
                {ytasAxis && (
                  <div className="pm-ctrl">
                    <div className="pm-label">Ascender Height <span className="pm-val">{Math.round(m.axisValues['YTAS'] ?? ytasAxis.default)}</span></div>
                    <input type="range" min={ytasAxis.min} max={ytasAxis.max} step={1}
                      value={m.axisValues['YTAS'] ?? ytasAxis.default}
                      onChange={e => setAxis('YTAS', +e.target.value)} />
                  </div>
                )}
                {shrpAxis && (
                  <div className="pm-ctrl">
                    <div className="pm-label">Sharp <span className="pm-val">{Math.round(m.axisValues['SHRP'] ?? shrpAxis.default)}</span></div>
                    <input type="range" min={shrpAxis.min} max={shrpAxis.max} step={1}
                      value={m.axisValues['SHRP'] ?? shrpAxis.default}
                      onChange={e => setAxis('SHRP', +e.target.value)} />
                  </div>
                )}
              </div>

              <div
                className="preview-modal-text"
                contentEditable
                suppressContentEditableWarning
                style={{
                  fontSize: `${m.size}pt`,
                  fontVariationSettings: modalVarSettings,
                  fontFeatureSettings: "'rclt' 1",
                  letterSpacing: `${m.spacing / 100}em`,
                }}
                data-placeholder="Type away..."
              />
            </div>
          </div>
        )
      })()}

      {dragState && (
        <div
          className="drag-ghost-wrap"
          style={{ left: dragState.x, top: dragState.y } as React.CSSProperties}
        >
          <span
            className="zone-token drag-ghost-token"
            style={{
              fontFamily: dragState.sourceZone === '__palette__' ? "'CalSansVF',sans-serif" : undefined,
              fontVariationSettings: previewVarSettings(52,
                dragState.sourceZone === '__palette__'
                  ? variantSampleGeom(dragState.tok.glyph, dragState.tok.variantIdx, glyphThresholds[dragState.tok.glyph] ?? GROUP_DEFS.find(d => d.glyph === dragState.tok.glyph)?.defaultThresholds ?? [])
                  : (LANDING_ZONES.find(z => z.label === dragState.sourceZone)?.sampleGeom ?? 50)
              ),
              fontFeatureSettings: "'rclt' 1",
              color: LANDING_ZONES.find(z => z.label === dragState.sourceZone)?.color ?? '#e8e8e8',
              '--zone-color': LANDING_ZONES.find(z => z.label === dragState.sourceZone)?.color ?? '#e8e8e8',
            } as React.CSSProperties}
          >
            {dragState.tok.glyph}
          </span>
          <div className="drag-ghost-label">
            {dragState.tok.isDefault ? 'default' : dragState.tok.variantLabel} · ⌫ delete
          </div>
        </div>
      )}
    </div>
  )
}
