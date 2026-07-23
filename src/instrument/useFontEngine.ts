// Font-export engine for the instrument UI — ports the legacy App.tsx download path.
// Owns the Pyodide/fontTools worker, loads the font on demand, and exposes a
// promise-based `download(config)` that returns the baked TTF bytes. The worker,
// the `applyConfig` message, and `_rebuild_fv` (what-you-preview-is-what-you-get)
// are the SAME ones the classic app uses — only the wiring is new.
//
// Lazy: the worker (Pyodide is several MB + ~10–20s) is only created once the user
// signals download intent via `init()`, so pure-preview visitors never pay for it.
import { useCallback, useEffect, useRef, useState } from 'react'

export interface ExportConfig {
  axisDefaults: Record<string, number>   // ◆ axis defaults, EXCLUDING opsz
  opszMultiplier: number
  freezeOpsz: boolean
  frozenOpszValue: number | null          // opsz to pin to when frozen (null → axis default)
  autoAscender: boolean
  thresholds: Record<string, number[]>   // ◆ GEOM swap map → FeatureVariations
}

// Preview rebuild config — the rebuild-only edits CSS can't show (opsz-axis rescale/pin +
// FeatureVariations threshold rewrite). Axis DEFAULTS stay stock here (the instrument
// applies those live via font-variation-settings), so this is a subset of ExportConfig.
export interface PreviewConfig {
  thresholds: Record<string, number[]>
  opszMultiplier: number
  freezeOpsz: boolean
  frozenOpszValue: number | null
  autoAscender: boolean
}

const fontUrl = (hoi: boolean) =>
  `${import.meta.env.BASE_URL}fonts/${hoi ? 'CalSansFlexVF' : 'CalSansVF'}.ttf`
const flexUrl = `${import.meta.env.BASE_URL}fonts/CalSansFlexVF.ttf`

function postPreview(w: Worker, cfg: PreviewConfig) {
  w.postMessage({
    type: 'previewFont',
    thresholdsJson: JSON.stringify(cfg.thresholds),
    autoAscender: cfg.autoAscender,
    opszMultiplier: cfg.opszMultiplier,
    freezeOpsz: cfg.freezeOpsz,
    frozenOpszValue: cfg.frozenOpszValue,
  })
}

export function useFontEngine(useHoi: boolean) {
  const workerRef = useRef<Worker | null>(null)
  const resolveRef = useRef<((buf: ArrayBuffer) => void) | null>(null)
  const useHoiRef = useRef(useHoi)
  useHoiRef.current = useHoi

  const [started, setStarted] = useState(false)
  const [ready, setReady] = useState(false)
  const [building, setBuilding] = useState(false)
  const [rebuilding, setRebuilding] = useState(false)   // preview (◆) recompile in flight
  const [error, setError] = useState<string | null>(null)

  // Preview @font-face plumbing: the latest requested config (re-fired once the worker
  // is ready / after a HOI font reload), plus the injected CalSansPreview style element.
  const readyRef = useRef(false)
  const previewCfgRef = useRef<PreviewConfig | null>(null)
  const faceStyleRef = useRef<HTMLStyleElement | null>(null)
  const faceUrlRef = useRef<string | null>(null)

  const injectPreviewFace = useCallback((buf: ArrayBuffer) => {
    const url = URL.createObjectURL(new Blob([new Uint8Array(buf)], { type: 'font/ttf' }))
    if (faceUrlRef.current) URL.revokeObjectURL(faceUrlRef.current)
    faceUrlRef.current = url
    if (!faceStyleRef.current) { faceStyleRef.current = document.createElement('style'); document.head.appendChild(faceStyleRef.current) }
    faceStyleRef.current.textContent = `@font-face { font-family: 'CalSansPreview'; src: url('${url}') format('truetype'); font-display: swap; }`
  }, [])

  const loadMain = useCallback((worker: Worker) => {
    setReady(false); readyRef.current = false
    fetch(fontUrl(useHoiRef.current)).then(r => r.arrayBuffer())
      .then(buf => worker.postMessage({ type: 'loadFont', fontBytes: buf }, [buf]))
  }, [])

  // Create the worker on first intent. Idempotent.
  const init = useCallback(() => {
    if (workerRef.current) return
    const worker = new Worker(new URL('../worker/fontWorker.ts', import.meta.url), { type: 'module' })
    workerRef.current = worker
    setStarted(true)
    worker.onmessage = (e: MessageEvent) => {
      const msg = e.data
      if (msg.type === 'ready') {
        loadMain(worker)
        // Cache Flex's avar2 store so Auto Ascender can graft it (matches legacy).
        fetch(flexUrl).then(r => r.arrayBuffer())
          .then(buf => worker.postMessage({ type: 'loadFlexAvar', fontBytes: buf }, [buf]))
      } else if (msg.type === 'axisInfo') {
        setReady(true); readyRef.current = true          // font loaded + axes parsed
        if (previewCfgRef.current) postPreview(worker, previewCfgRef.current)   // re-fire pending
      } else if (msg.type === 'fontResult') {
        resolveRef.current?.(msg.ttf as ArrayBuffer)
        resolveRef.current = null
        setBuilding(false)
      } else if (msg.type === 'previewFontResult') {
        injectPreviewFace(msg.ttf as ArrayBuffer)
        setRebuilding(false)
      } else if (msg.type === 'error') {
        console.error('[fontEngine]', msg.message)
        setError(String(msg.message))
        setBuilding(false)
        setRebuilding(false)
        resolveRef.current = null
      }
    }
  }, [loadMain, injectPreviewFace])

  // HOI toggle swaps the source font — reload it (only once the worker exists).
  useEffect(() => {
    if (workerRef.current) loadMain(workerRef.current)
  }, [useHoi, loadMain])

  useEffect(() => () => {
    workerRef.current?.terminate()
    if (faceUrlRef.current) URL.revokeObjectURL(faceUrlRef.current)
    faceStyleRef.current?.remove()
  }, [])

  const download = useCallback((config: ExportConfig) =>
    new Promise<ArrayBuffer>((resolve) => {
      setError(null)
      resolveRef.current = resolve
      setBuilding(true)
      workerRef.current!.postMessage({ type: 'applyConfig', configJson: JSON.stringify(config) })
    }), [])

  // Rebuild the CalSansPreview face for the current ◆ (inits the worker if needed).
  const rebuildPreview = useCallback((cfg: PreviewConfig) => {
    init()
    setRebuilding(true)   // stays true through Pyodide init + recompile, until previewFontResult
    previewCfgRef.current = cfg
    if (workerRef.current && readyRef.current) postPreview(workerRef.current, cfg)
  }, [init])

  // Drop the preview face → scenes fall back to raw CalSansVF (◆ is back at stock).
  const clearPreviewFont = useCallback(() => {
    previewCfgRef.current = null
    setRebuilding(false)
    if (faceStyleRef.current) faceStyleRef.current.textContent = ''
    if (faceUrlRef.current) { URL.revokeObjectURL(faceUrlRef.current); faceUrlRef.current = null }
  }, [])

  return { started, ready, building, rebuilding, error, init, download, rebuildPreview, clearPreviewFont }
}
