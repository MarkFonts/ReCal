import { useEffect, useRef, useState } from 'react'
import './App.css'
import { GlyphGroups, GROUP_DEFS, LANDING_ZONES, PREVIEW_WORDS, getZoneTokens, applyDrop, type ZoneToken } from './GlyphGroups'

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
  standard: `${import.meta.env.BASE_URL}fonts/CalSans-Regular_1_950_opsz14_GEOM25.ttf`,
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
  const [wordWidths, setWordWidths] = useState<{ upm: number; widths: Record<string, Record<string, number>> } | null>(null)
  const [oflAgreed, setOflAgreed] = useState(false)
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
  const zoneGridRef = useRef<HTMLDivElement | null>(null)

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
          geomValuesJson: JSON.stringify([initialDefaults['GEOM'] ?? 0]),
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
      setDragState(s => {
        if (!s) return null
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
        if (targetZone !== s.sourceZone) {
          setGlyphThresholds(prev => applyDrop(s.tok.glyph, s.tok.variantIdx, targetZone, prev))
        }
        return null
      })
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
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
        geomValuesJson: JSON.stringify([defaultsRef.current['GEOM'] ?? 0]),
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
      const opsz = Math.min(Math.max(fontSize / opszMultiplier, opszAxis.min), opszAxis.max)
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
      <div key={axis.tag} className={`axis-row${isAuto ? ' axis-row--auto' : ''}`}>
        <div className="axis-header">
          <span className="axis-name">{axis.name}</span>
          <span className="axis-tag">{axis.tag}</span>
          <span className="axis-value">{Math.round(val)}</span>
        </div>
        <input
          type="range"
          min={axis.min}
          max={axis.max}
          step={1}
          value={val}
          onChange={(e) => handleSliderChange(axis.tag, parseFloat(e.target.value))}
        />
        <div className="axis-bounds">
          <span>{axis.min}</span>
          <span>{axis.max}</span>
        </div>
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
        <div className={`download-gate${oflAgreed ? ' ofl-agreed' : ''}`}>
          <div className="ofl-gate">
            <a
              href="https://openfontlicense.org/open-font-license-official-text/"
              target="_blank"
              rel="noopener noreferrer"
              className="ofl-link"
            >OFL 1.1</a>
            <button className="ofl-accept-btn" onClick={() => setOflAgreed(true)}>
              Accept
            </button>
          </div>
          <button
            disabled={isDownloading || axes.length === 0 || !oflAgreed}
            onClick={downloadTTF}
          >
            {isDownloading ? 'Generating…' : 'Download TTF'}
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
          <section className="controls">
            <div className="control-group">
              <h2>Presets</h2>
              <div className="preset-buttons">
                <button className="preset-btn" disabled>Mobile UI</button>
                <button className="preset-btn" disabled>Display</button>
                <button className="preset-btn" disabled>Wayfinding</button>
              </div>
              <span className="presets-more">+ 6 more</span>
            </div>

            {opszAxis && (
              <div className="control-group">
                <h2>Optical Size Scale</h2>
                <p className="control-note">
                  Cal Sans is tuned for mobile and desktop. Scale up if your type lives on a TV, large display, or in an accessibility context where text is always large.
                </p>
                <div className="axis-row">
                  <div className="axis-header">
                    <span className="axis-name">{opszAxis.name}</span>
                    <span className="axis-tag">opsz</span>
                    <span className="axis-value">
                      ×{opszMultiplier} → {Math.round(opszAxis.min * opszMultiplier)}–{Math.round(opszAxis.max * opszMultiplier)}pt
                    </span>
                  </div>
                  <div className="multiplier-buttons">
                    {OPSZ_MULTIPLIERS.map((m) => (
                      <button
                        key={m}
                        className={`mult-btn${opszMultiplier === m ? ' active' : ''}`}
                        onClick={() => setOpszMultiplier(m)}
                      >
                        ×{m}
                      </button>
                    ))}
                  </div>
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
                  <input
                    type="checkbox"
                    checked={useHoi}
                    onChange={(e) => setUseHoi(e.target.checked)}
                  />
                  <span>HOI interpolation</span>
                </label>
                <p className="control-note">
                  Loads a build with higher-order (parabolic) interpolation along the GEOM axis.
                  This is a test font — only the <em>y</em> glyph is affected.
                </p>
                {ytasAxis && (
                  <>
                    <label className="hoi-toggle" style={{ marginTop: 12 }}>
                      <input
                        type="checkbox"
                        checked={autoAscender}
                        onChange={(e) => setAutoAscender(e.target.checked)}
                      />
                      <span>Auto Ascender Height</span>
                    </label>
                    <p className="control-note">
                      Locks YTAS to an opsz-driven value instead of a fixed default.
                      The exported font will use this relationship parametrically.
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
            <div className="control-group">
              <h2>Dynamic Optical Size Map Preview</h2>
              <div className="preview-size-row">
                <span className="preview-px-label">{previewSize}px</span>
                <input
                  type="range"
                  min={12}
                  max={200}
                  step={1}
                  value={previewSize}
                  onChange={(e) => setPreviewSize(parseInt(e.target.value))}
                />
              </div>
              <label className="hoi-toggle" style={{ marginTop: 6 }}>
                <input
                  type="checkbox"
                  checked={freezeOpsz}
                  onChange={(e) => setFreezeOpsz(e.target.checked)}
                />
                <span>Freeze optical size on export</span>
              </label>
            </div>

            {axes.length > 0 && (() => {
              const zoneTokenMap = getZoneTokens(glyphThresholds)
              const dragTargetZone = dragState && zoneGridRef.current ? (() => {
                const rect = zoneGridRef.current!.getBoundingClientRect()
                const pct = (dragState.x - rect.left) / rect.width
                if (pct < 0 || pct > 1) return null
                return LANDING_ZONES[Math.floor(pct * 4)]?.label ?? null
              })() : null

              return (
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
                      <div
                        className="zone-col-header"
                        onClick={() => handleSliderChange('GEOM', z.mid)}
                        style={{ cursor: 'pointer' }}
                      >
                        <span
                          className="zone-col-preview-word"
                          onClick={(e) => {
                            e.stopPropagation()
                            setPreviewModal({
                              zone: z,
                              size: previewSize,
                              spacing: 0,
                              axisValues: { ...defaults, GEOM: z.mid },
                            })
                          }}
                        >Preview</span>
                        {!isActive && <>{' '}Variable</>}
                        <br />
                        {isActive ? 'Default' : 'Alternate'} Configuration
                        <div className="zone-col-geom-default">
                          {isActive
                            ? `Default GEOM: ${Math.round(defaults['GEOM'] ?? 0)}`
                            : 'Variable font feature'}
                        </div>
                      </div>
                      <div className="zone-col-words">
                        {PREVIEW_WORDS.map(word => (
                          <p key={word} className="zone-col-word" style={{
                            fontSize: previewSize,
                            fontVariationSettings: previewVarSettings(previewSize, z.mid),
                            fontFeatureSettings: "'rclt' 1",
                          }}>
                            {word}
                          </p>
                        ))}
                      </div>
                      <div
                        className="zone-swatch-row"
                        onClick={() => handleSliderChange('GEOM', z.mid)}
                      >
                        <div className="zone-swatch" />
                        <span className="zone-range-label">
                          GEOM: <span className="zone-range-nums">{z.start}–{z.end}</span> {z.label}
                        </span>
                      </div>
                      <div className="zone-rosetta-bin">
                        {(zoneTokenMap[z.label] ?? []).map(tok => {
                          const isDraggingThis = dragState?.tok.glyph === tok.glyph && dragState.tok.variantIdx === tok.variantIdx
                          return (
                            <span
                              key={`${tok.glyph}-${tok.variantIdx}`}
                              className={`zone-token${tok.isDefault ? ' zone-token--default' : ''}${isDraggingThis ? ' zone-token--dragging' : ''}`}
                              style={{
                                fontVariationSettings: previewVarSettings(52, z.sampleGeom),
                                fontFeatureSettings: "'rclt' 1",
                              }}
                              onPointerDown={tok.isDefault ? undefined : (e) => {
                                e.preventDefault()
                                e.currentTarget.setPointerCapture(e.pointerId)
                                pushThresholdHistory()
                                setDragState({ tok, sourceZone: z.label, x: e.clientX, y: e.clientY })
                              }}
                            >
                              {tok.glyph}
                            </span>
                          )
                        })}
                      </div>
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
                  fontSize: m.size,
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
        <span
          className="zone-token drag-ghost"
          style={{
            left: dragState.x,
            top: dragState.y,
            fontVariationSettings: previewVarSettings(52, LANDING_ZONES.find(z => z.label === dragState.sourceZone)?.sampleGeom ?? 50),
            fontFeatureSettings: "'rclt' 1",
            color: LANDING_ZONES.find(z => z.label === dragState.sourceZone)?.color ?? '#e8e8e8',
          } as React.CSSProperties}
        >
          {dragState.tok.glyph}
        </span>
      )}
    </div>
  )
}
