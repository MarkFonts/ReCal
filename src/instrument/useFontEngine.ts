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
  autoAscender: boolean
  thresholds: Record<string, number[]>   // ◆ GEOM swap map → FeatureVariations
}

const fontUrl = (hoi: boolean) =>
  `${import.meta.env.BASE_URL}fonts/${hoi ? 'CalSansFlexVF' : 'CalSansVF'}.ttf`
const flexUrl = `${import.meta.env.BASE_URL}fonts/CalSansFlexVF.ttf`

export function useFontEngine(useHoi: boolean) {
  const workerRef = useRef<Worker | null>(null)
  const resolveRef = useRef<((buf: ArrayBuffer) => void) | null>(null)
  const useHoiRef = useRef(useHoi)
  useHoiRef.current = useHoi

  const [started, setStarted] = useState(false)
  const [ready, setReady] = useState(false)
  const [building, setBuilding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadMain = useCallback((worker: Worker) => {
    setReady(false)
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
        setReady(true)                                  // font loaded + axes parsed
      } else if (msg.type === 'fontResult') {
        resolveRef.current?.(msg.ttf as ArrayBuffer)
        resolveRef.current = null
        setBuilding(false)
      } else if (msg.type === 'error') {
        console.error('[fontEngine]', msg.message)
        setError(String(msg.message))
        setBuilding(false)
        resolveRef.current = null
      }
    }
  }, [loadMain])

  // HOI toggle swaps the source font — reload it (only once the worker exists).
  useEffect(() => {
    if (workerRef.current) loadMain(workerRef.current)
  }, [useHoi, loadMain])

  useEffect(() => () => { workerRef.current?.terminate() }, [])

  const download = useCallback((config: ExportConfig) =>
    new Promise<ArrayBuffer>((resolve) => {
      setError(null)
      resolveRef.current = resolve
      setBuilding(true)
      workerRef.current!.postMessage({ type: 'applyConfig', configJson: JSON.stringify(config) })
    }), [])

  return { started, ready, building, error, init, download }
}
