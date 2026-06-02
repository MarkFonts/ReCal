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
  hoi: `${import.meta.env.BASE_URL}fonts/CalSansVariable2.ttf`,
  standard: `${import.meta.env.BASE_URL}fonts/ReCalSans-Variable.ttf`,
}

export default function App() {
  const [loadMsg, setLoadMsg] = useState('Starting...')
  const [axes, setAxes] = useState<AxisInfo[]>([])
  const [defaults, setDefaults] = useState<Record<string, number>>({})
  const [opszMultiplier, setOpszMultiplier] = useState(1)
  const [isDownloading, setIsDownloading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [previewSize, setPreviewSize] = useState(48)
  const [glyphThresholds, setGlyphThresholds] = useState<Record<string, number[]>>(
    () => Object.fromEntries(GROUP_DEFS.map(g => [g.glyph, [...g.defaultThresholds]]))
  )
  const [useHoi, setUseHoi] = useState(false)
  const [freezeOpsz, setFreezeOpsz] = useState(false)
  const [frozenOpszValue, setFrozenOpszValue] = useState<number | null>(null)
  const [activePreset, setActivePreset] = useState<string | null>(null)
  const [wordWidths, setWordWidths] = useState<{ upm: number; widths: Record<string, Record<string, number>> } | null>(null)
  const [opszDynamic, setOpszDynamic] = useState(false)
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
      })
    }, 200)
    return () => {
      if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current)
    }
  }, [glyphThresholds])

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

  function handleSliderChange(tag: string, value: number) {
    const next = { ...defaultsRef.current, [tag]: value }
    defaultsRef.current = next
    setDefaults(next)
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
        configJson: JSON.stringify({ axisDefaults, opszMultiplier }),
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

  const designAxes = axes.filter((a) => a.tag !== 'opsz' && a.tag !== 'GEOM' && !PARAMETRIC_TAGS.has(a.tag))
  const parametricAxes = axes.filter((a) => PARAMETRIC_TAGS.has(a.tag))
  const opszAxis = axes.find((a) => a.tag === 'opsz')
  const geomAxis = axes.find((a) => a.tag === 'GEOM')

  function previewVarSettings(fontSize: number, geomOverride?: number) {
    const parts = axes
      .filter((a) => a.tag !== 'opsz')
      .map((a) => {
        let val = (a.tag === 'GEOM' && geomOverride !== undefined) ? geomOverride : (defaults[a.tag] ?? a.default)
        if (a.tag === 'YTAS' && autoYtasValue !== null) val = autoYtasValue
        return `'${a.tag}' ${val}`
      })
    if (opszAxis) {
      const opsz = frozenOpszValue !== null
        ? Math.min(Math.max(frozenOpszValue, opszAxis.min), opszAxis.max)
        : Math.min(Math.max(fontSize / opszMultiplier, opszAxis.min), opszAxis.max)
      parts.push(`'opsz' ${opsz.toFixed(1)}`)
    }
    return parts.join(', ') || 'normal'
  }


  const ytasAxis = parametricAxes.find(a => a.tag === 'YTAS')
  const autoYtasValue = (ytasAxis && autoAscender && opszAxis) ? (() => {
    const effectiveOpsz = (defaults['opsz'] ?? opszAxis.default) * opszMultiplier
    const minOpsz = opszAxis.min * opszMultiplier
    const maxOpsz = opszAxis.max * opszMultiplier
    const t = Math.max(0, Math.min(1, (effectiveOpsz - minOpsz) / (maxOpsz - minOpsz)))
    return Math.round(ytasAxis.min + t * (ytasAxis.max - ytasAxis.min))
  })() : null

  const activeZoneName = LANDING_ZONES.find(
    z => (defaults['GEOM'] ?? 0) >= z.start && (defaults['GEOM'] ?? 0) <= z.end
  )?.label

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
          step={1}
        />
      </div>
    )
  }

  return (
    <div className="app">
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
          , repurposed by WORDMARK to make the OFL mission more accessible.
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
          <section className="controls dialkit-root" data-theme="dark">

            {opszAxis && (
              <div className="control-group">
                <h2>Optical Size Scale</h2>
                <div className="dial-axis-row">
                  <Slider
                    label={`Opsz ×${opszMultiplier} → ${Math.round(opszAxis.min * opszMultiplier)}–${Math.round(opszAxis.max * opszMultiplier)}pt`}
                    value={opszMultiplier}
                    onChange={(v) => setOpszMultiplier(Math.round(v))}
                    min={1}
                    max={6}
                    step={1}
                  />
                </div>
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
              <h2>Experimental</h2>
              <label className="hoi-toggle">
                <input type="checkbox" checked={useHoi} onChange={(e) => setUseHoi(e.target.checked)} />
                <span>HOI interpolation</span>
              </label>
              <p className="control-note">
                Higher-order (parabolic) interpolation along GEOM — only <em>y</em> is affected.
              </p>
              {ytasAxis && (
                <>
                  <label className="hoi-toggle" style={{ marginTop: 12 }}>
                    <input type="checkbox" checked={autoAscender} onChange={(e) => setAutoAscender(e.target.checked)} />
                    <span>Auto Ascender Height</span>
                  </label>
                  <p className="control-note">
                    Locks YTAS to an opsz-driven value parametrically.
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
                setActivePreset('Mobile UI')
                pushThresholdHistory()
                setFrozenOpszValue(null)
                handleSliderChange('GEOM', 25)
                setGlyphThresholds(prev => ({ ...prev, l: [26] }))
              }}>Mobile UI</button>
              <button className={`preset-btn${activePreset === 'Display' ? ' preset-btn--active' : ''}`} onClick={() => {
                setActivePreset('Display')
                setFrozenOpszValue(null)
                handleSliderChange('GEOM', 50)
              }}>Display</button>
              <button className={`preset-btn${activePreset === 'Wayfinding' ? ' preset-btn--active' : ''}`} onClick={() => {
                setActivePreset('Wayfinding')
                setFrozenOpszValue(null)
                handleSliderChange('GEOM', 5)
                setOpszMultiplier(6)
              }}>Wayfinding</button>

              <button className={`preset-btn${activePreset === 'Futura' ? ' preset-btn--active' : ''}`} onClick={() => {
                setActivePreset('Futura')
                pushThresholdHistory()
                setFrozenOpszValue(16)
                handleSliderChange('GEOM', 100)
                handleSliderChange('YTAS', 800)
                handleSliderChange('SHRP', 100)
              }}>Futura</button>

              <button className={`preset-btn${activePreset === 'Neutraface 2' ? ' preset-btn--active' : ''}`} onClick={() => {
                setActivePreset('Neutraface 2')
                pushThresholdHistory()
                setFrozenOpszValue(null)
                handleSliderChange('GEOM', 25)
                handleSliderChange('YTAS', 800)
                handleSliderChange('SHRP', 100)
                setGlyphThresholds(prev => {
                  let t = applyDelete('a', 0, 'A11Y', prev)
                  t = applyDrop('y', 2, 'UI', t)
                  return t
                })
              }}>Neutraface 2</button>

              <button className={`preset-btn${activePreset === 'Inter' ? ' preset-btn--active' : ''}`} onClick={() => {
                setActivePreset('Inter')
                pushThresholdHistory()
                setFrozenOpszValue(null)
                handleSliderChange('GEOM', 25)
              }}>Inter</button>

              <button className={`preset-btn${activePreset === 'Circular' ? ' preset-btn--active' : ''}`} onClick={() => {
                setActivePreset('Circular')
                pushThresholdHistory()
                setFrozenOpszValue(20)
                handleSliderChange('GEOM', 25)
              }}>Circular</button>

              <button className={`preset-btn${activePreset === 'Gotham' ? ' preset-btn--active' : ''}`} onClick={() => {
                setActivePreset('Gotham')
                pushThresholdHistory()
                setFrozenOpszValue(8)
                handleSliderChange('GEOM', 25)
                handleSliderChange('YTAS', 786)
                setGlyphThresholds(prev => {
                  let t = applyDelete('a', 0, 'A11Y', prev)
                  t = applyDrop('j', 1, 'UI', t)
                  return t
                })
              }}>Gotham</button>

              <button className={`preset-btn${activePreset === 'Geist' ? ' preset-btn--active' : ''}`} onClick={() => {
                setActivePreset('Geist')
                pushThresholdHistory()
                setFrozenOpszValue(16)
                handleSliderChange('GEOM', 50)
                setGlyphThresholds(prev => applyDrop('a', 0, 'Base', prev))
              }}>Geist</button>

              <button className={`preset-btn${activePreset === 'Poppins' ? ' preset-btn--active' : ''}`} onClick={() => {
                setActivePreset('Poppins')
                pushThresholdHistory()
                setFrozenOpszValue(10)
                handleSliderChange('GEOM', 50)
                setGlyphThresholds(prev => applyDrop('y', 2, 'Base', prev))
              }}>Poppins</button>

              <button className={`preset-btn${activePreset === 'GT America' ? ' preset-btn--active' : ''}`} onClick={() => {
                setActivePreset('GT America')
                pushThresholdHistory()
                setFrozenOpszValue(8)
                handleSliderChange('GEOM', 25)
                setGlyphThresholds(prev => applyDelete('a', 0, 'A11Y', prev))
              }}>GT America</button>
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
              <div className="zone-area-wrap">
                {/* ── Glyph palette column ── */}
                <div className="glyph-palette">
                  <div className="glyph-palette-rows">
                    {GROUP_DEFS.map(def => {
                      const t = glyphThresholds[def.glyph] ?? [...def.defaultThresholds]
                      const activeVi = Math.min(
                        t.reduce((acc: number, thresh: number) => (geomDefault >= thresh ? acc + 1 : 0 + acc), 0),
                        def.variants.length - 1
                      )
                      return (
                        <div key={def.glyph} className="palette-row">
                          {def.variants.map((v, vi) => {
                            // Use fixed natural GEOM per variant type so CalSansVF shows
                            // the correct form regardless of user's custom thresholds.
                            // Default variant uses rclt=0 to always show the raw base glyph.
                            const NATURAL_GEOM: Record<string, number> = { A11Y: 0, UI: 25, Base: 50, Geo: 100, default: 25 }
                            const sampleGeom = NATURAL_GEOM[v.label] ?? 25
                            const rcltSetting = v.label === 'default' ? "'rclt' 0" : "'rclt' 1"
                            const isActive = vi === activeVi
                            const isDraggable = v.label !== 'default'
                            const assignedColor = variantZoneColor[`${def.glyph}-${vi}`]
                            const tokenColor = assignedColor ?? (v.label === 'default' ? '#444' : v.color)
                            const isDraggingThis = dragState?.tok.glyph === def.glyph && dragState.tok.variantIdx === vi
                            const tok = { glyph: def.glyph, variantIdx: vi, variantLabel: v.label, isDefault: v.label === 'default', defaultActivation: vi === 0 ? (t[0] ?? 100) : (t[vi - 1] ?? 0) }
                            return (
                              <span
                                key={vi}
                                className={`palette-token${isActive ? ' palette-token--active' : ''}${isDraggingThis ? ' zone-token--dragging' : ''}`}
                                title={isDraggable ? `${v.label} ${def.glyph} — drag to zone` : `default ${def.glyph} — shows when no variant is active`}
                                style={{
                                  fontFamily: "'CalSansVF',sans-serif",
                                  fontVariationSettings: previewVarSettings(22, sampleGeom),
                                  fontFeatureSettings: rcltSetting,
                                  fontOpticalSizing: 'none',
                                  color: tokenColor,
                                  opacity: isActive ? 1 : 0.35,
                                  cursor: isDraggable ? 'grab' : 'default',
                                } as React.CSSProperties}
                                onPointerDown={!isDraggable ? undefined : (e) => {
                                  e.preventDefault()
                                  e.currentTarget.setPointerCapture(e.pointerId)
                                  pushThresholdHistory()
                                  setDragState({ tok, sourceZone: '__palette__', x: e.clientX, y: e.clientY })
                                }}
                              >{def.glyph}</span>
                            )
                          })}
                        </div>
                      )
                    })}
                  </div>

                  {/* Trash zone */}
                  <div
                    className={`palette-trash${isDragOverTrash ? ' palette-trash--active' : ''}`}
                    ref={paletteTrashRef}
                  >
                    <span className="palette-trash-label">trash</span>
                    {trashedGlyphs.map(item => (
                      <span
                        key={`${item.glyph}-${item.variantIdx}`}
                        className="palette-token"
                        title={`Restore ${item.glyph} (${item.variantLabel}) — click or ⌘Z`}
                        style={{
                          fontFamily: "'CalSansVF',sans-serif",
                          fontVariationSettings: previewVarSettings(22, item.sampleGeom),
                          fontFeatureSettings: "'rclt' 1",
                          color: item.color,
                          cursor: 'pointer',
                          opacity: 0.5,
                        } as React.CSSProperties}
                        onClick={() => {
                          pushThresholdHistory()
                          setGlyphThresholds(prev => ({ ...prev, [item.glyph]: item.savedThresholds }))
                          setTrashedGlyphs(prev => prev.filter(t => t.glyph !== item.glyph || t.variantIdx !== item.variantIdx))
                        }}
                      >{item.glyph}</span>
                    ))}
                  </div>
                </div>

                {/* ── Zone columns (no bins) ── */}
                <div className={`zone-grid${previewRebuilding ? ' zone-grid--rebuilding' : ''}`} ref={zoneGridRef}>
                  {LANDING_ZONES.map((z) => {
                    const isActive = activeZoneName === z.label
                    const isDragTarget = dragTargetZone === z.label
                    return (
                      <div
                        key={z.label}
                        className={`zone-col${isActive ? ' zone-col--active' : ''}${isDragTarget ? ' zone-col--drag-target' : ''}`}
                        style={{ '--zone-color': z.color } as React.CSSProperties}
                      >
                        <div className="zone-col-header" onClick={() => handleSliderChange('GEOM', z.mid)} style={{ cursor: 'pointer' }}>
                          <span className="zone-col-preview-word" onClick={(e) => { e.stopPropagation(); setPreviewModal({ zone: z, size: previewSize, spacing: 0, axisValues: { ...defaults, GEOM: z.mid } }) }}>Preview</span>
                          {!isActive && <> Variable</>}<br />
                          {isActive ? 'Default' : 'Alternate'} Configuration
                          <label className="zone-col-radio-row" onClick={e => e.stopPropagation()} style={{ marginTop: 4 }}>
                            <input
                              type="radio"
                              name="active-zone"
                              checked={isActive}
                              onChange={() => handleSliderChange('GEOM', z.mid)}
                            />
                            <span className="zone-col-radio-label" style={{ color: isActive ? '#e8e8e8' : 'var(--zone-color)' }}>
                              {isActive ? `Default GEOM: ${Math.round(defaults['GEOM'] ?? 0)}` : 'Variable font feature'}
                            </span>
                          </label>
                        </div>
                        <div className="zone-col-words">
                          {opszDynamic || !opszAxis ? (
                            PREVIEW_WORDS.map(word => (
                              <p key={word} className="zone-col-word" style={{ fontSize: `${previewSize}pt`, fontVariationSettings: previewVarSettings(previewSize, z.mid), fontFeatureSettings: "'rclt' 1" }}>{word}</p>
                            ))
                          ) : (() => {
                            const smallSz = Math.round(14 * opszMultiplier)
                            const largeSz = Math.round(opszAxis.max * opszMultiplier)
                            const ww = wordWidths?.widths[String(z.mid)]
                            const textWords = PREVIEW_WORDS.slice(0, 3) as string[]
                            let splitIdx = 1
                            if (ww) {
                              const ws = textWords.map(w => ww[w] ?? 0)
                              let best = Infinity
                              for (let i = 1; i < textWords.length; i++) {
                                const diff = Math.abs(ws.slice(0,i).reduce((a,b)=>a+b,0) - ws.slice(i).reduce((a,b)=>a+b,0))
                                if (diff < best) { best = diff; splitIdx = i }
                              }
                            }
                            const smallStyle = { fontSize: smallSz, fontVariationSettings: previewVarSettings(smallSz, z.mid), fontFeatureSettings: "'rclt' 1" as const }
                            const largeStyle = { fontSize: largeSz, fontVariationSettings: previewVarSettings(largeSz, z.mid), fontFeatureSettings: "'rclt' 1" as const }
                            return (
                              <>
                                <div className="zone-col-canonical-small">
                                  <p className="zone-col-word" style={smallStyle}>{textWords.slice(0,splitIdx).join(' ')}</p>
                                  <p className="zone-col-word" style={smallStyle}>{textWords.slice(splitIdx).join(' ')}</p>
                                  <p className="zone-col-word" style={smallStyle}>{PREVIEW_WORDS[3]}</p>
                                </div>
                                <div className="zone-col-canonical-large">
                                  {PREVIEW_WORDS.map(word => <p key={word} className="zone-col-word" style={largeStyle}>{word}</p>)}
                                </div>
                              </>
                            )
                          })()}
                        </div>
                        <div className="zone-swatch-row" onClick={() => handleSliderChange('GEOM', z.mid)}>
                          <div className="zone-swatch" />
                          <span className="zone-range-label">
                            GEOM: <span className="zone-range-nums">{z.start}–{z.end}</span> {z.label}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
              )
            })()}

            <div className="preview-size-row preview-size-row--bottom">
              <label className="hoi-toggle" style={{ marginRight: 8 }}>
                <input type="checkbox" checked={opszDynamic} onChange={e => setOpszDynamic(e.target.checked)} />
                <span>Dynamic size Preview</span>
              </label>
              {opszDynamic && (
                <label className="hoi-toggle" style={{ marginRight: 8, flexShrink: 0 }}>
                  <input type="checkbox" checked={freezeOpsz} onChange={(e) => setFreezeOpsz(e.target.checked)} />
                  <span>Freeze on export</span>
                </label>
              )}
              <span className={`preview-px-label${opszDynamic ? '' : ' preview-size-row--off'}`} style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                <span>{previewSize}pt</span>
                <input type="range" min={12} max={200} step={1} value={previewSize} disabled={!opszDynamic} onChange={(e) => setPreviewSize(parseInt(e.target.value))} style={{ flex: 1 }} />
              </span>
            </div>

            <div className="xray-toggle-row xray-toggle-row--left">
              <button className="xray-toggle-btn" onClick={() => setShowXRay(v => !v)}>
                {showXRay ? 'Hide Type Matrix' : 'Type Matrix'}
              </button>
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
                  {activeZoneName === m.zone.label
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
