import { useEffect, useRef } from 'react'

// Canvas letterbox footer, ported from the wordmark site (js/letterbox.js).
// The large words are scanned into an alpha mask; the mask is packed with tiny
// fill glyphs. The font is pinned to the app's chrome settings (unmodified
// CalSansVF at opsz 10, GEOM 25) so the footer never responds to the slider or
// custom thresholds — it stays fixed like the rest of the UI. Mouse pushes/
// scales the fill glyphs.

// Match the chrome/UI font (App.css body: CalSansVF, opsz 10, GEOM 25).
const FVS = "'opsz' 10, 'GEOM' 25"

type LetterboxConfig = {
  words: string[]
  largeFontFamily: string
  largeWeight: number
  fillFontFamily: string
  fillWeight: number
  fillSize: number
  widthFraction: number
  verticalPad: number
  wordGap: number
  maxWidth: number
  heroHeightFrac: number
  topPadVh?: number
  extraTopPad?: number
  extraBottomPad?: number
  minFillSize?: number
}

const CONFIG: LetterboxConfig = {
  words: ['WORDMARK'],
  largeFontFamily: "'CalSansVF',sans-serif",
  largeWeight: 700,
  fillFontFamily: "'CalSansVF',sans-serif",
  fillWeight: 400,
  fillSize: 10,
  widthFraction: 0.98,
  verticalPad: 1,
  wordGap: 0,
  maxWidth: Infinity,
  heroHeightFrac: 0,
  topPadVh: 0,
  // Big top headroom = room for the upward mouse-push. The canvas is pulled up
  // behind the page content (App.css z-index:-1 + negative margin-top), so this
  // headroom overlaps the UI invisibly and the push never clips. Bottom pad 0 so
  // WORDMARK sits flush to the page bottom.
  extraTopPad: 280,
  extraBottomPad: 0,
  minFillSize: 6,
}

const LOREM =
  'loremipsumdolorsitametconsecteturadipiscingelitseddoeiusmodtemporincididuntutlaboreetdoloremagnaaliquautenimadminimveniamquisnostrudexercitationullamcolaborisnisiutaliquipexeacommodoconsequatduisauteiruredolorinreprehenderitinvoluptatevelitessecillumdoloreeuefugiatnullapariaturexcepteursintoccaecatcupidatatnonproidentsuntinculpaquiofficiadeseruntmollitanimidestlaborum'
const POOL = LOREM.toLowerCase().repeat(5)

// Returns { init, destroy }. init lays out and starts the rAF loop; destroy tears
// everything down (rAF + window listeners) for React unmount / re-run.
function createLetterbox(canvasEl: HTMLCanvasElement, CFG: LetterboxConfig, ink: string) {
  const ctx = canvasEl.getContext('2d')!
  let FILL_SZ = CFG.fillSize
  let LINE_H = Math.ceil(1.3 * FILL_SZ)

  let isMouseDown = false
  const onDown = () => { isMouseDown = true }
  const onUp = () => { isMouseDown = false }
  window.addEventListener('mousedown', onDown)
  window.addEventListener('mouseup', onUp)

  function scanWord(word: string, fontSize: number, SCAN_SZ: number) {
    const oc = document.createElement('canvas')
    oc.width = oc.height = SCAN_SZ
    const c = oc.getContext('2d')!
    c.font = `${CFG.largeWeight} ${fontSize}px ${CFG.largeFontFamily}`
    ;(c as any).fontVariationSettings = FVS
    c.textBaseline = 'alphabetic'

    const mW = c.measureText(word)
    const wid = mW.actualBoundingBoxLeft + mW.actualBoundingBoxRight
    const cx = (SCAN_SZ - wid) / 2 + mW.actualBoundingBoxLeft
    const asc = mW.actualBoundingBoxAscent
    const dsc = mW.actualBoundingBoxDescent
    const cy = (SCAN_SZ - (asc + dsc)) / 2 + asc

    c.fillStyle = '#000'
    c.fillText(word, cx - mW.actualBoundingBoxLeft, cy)

    const px = c.getImageData(0, 0, SCAN_SZ, SCAN_SZ).data
    const yStart = Math.max(0, Math.floor(cy - asc - LINE_H * 0.5))
    const yEnd = Math.min(SCAN_SZ, Math.ceil(cy + dsc))
    const rows: { x: number; w: number }[][] = []

    for (let row = yStart; row < yEnd; row += LINE_H) {
      const col = new Uint8Array(SCAN_SZ)
      const end = Math.min(row + LINE_H, yEnd)
      for (let y = row; y < end; y++) {
        const base = y * SCAN_SZ * 4
        for (let x = 0; x < SCAN_SZ; x++) {
          if (px[base + x * 4 + 3] > 60) col[x] = 1
        }
      }
      const spans: { x: number; w: number }[] = []
      let s = -1
      for (let x2 = 0; x2 <= SCAN_SZ; x2++) {
        if (x2 < SCAN_SZ && col[x2]) {
          if (s === -1) s = x2
        } else if (s !== -1) {
          if (x2 - s > 4) spans.push({ x: s, w: x2 - s })
          s = -1
        }
      }
      rows.push(spans)
    }

    return { rows, scanH: Math.max(1, yEnd - yStart) }
  }

  type Char = { ch: string; hx: number; hy: number; dx: number; dy: number }

  function buildAllChars(CW: number, layoutCW: number, heroH: number): Char[] {
    const probe = document.createElement('canvas').getContext('2d')!
    const refSize = 200
    probe.font = `${CFG.largeWeight} ${refSize}px ${CFG.largeFontFamily}`
    let maxWid = 0
    for (const word of CFG.words) {
      const m = probe.measureText(word)
      const w = m.actualBoundingBoxLeft + m.actualBoundingBoxRight
      if (w > maxWid) maxWid = w
    }
    if (maxWid < 1) maxWid = refSize * (CFG.words[0].length || 4) * 0.6
    const fontSize = (layoutCW * CFG.widthFraction / maxWid) * refSize

    const SCAN_SZ = Math.max(1000, Math.ceil(layoutCW * 1.1))
    const wordWidthInScan = fontSize * (maxWid / refSize)
    const scanLeftEdge = (SCAN_SZ - wordWidthInScan) / 2
    const displayLeftEdge = (CW - wordWidthInScan) / 2
    const xShift = displayLeftEdge - scanLeftEdge

    const WORD_GAP = LINE_H * CFG.wordGap
    const scans = CFG.words.map((w) => scanWord(w, fontSize, SCAN_SZ))
    let totalH = WORD_GAP * (scans.length - 1)
    for (const sc of scans) totalH += sc.scanH

    const refW2 = Math.min(CW, 850)
    const topPad = LINE_H * CFG.verticalPad + (CFG.extraTopPad || 0) * (refW2 / 850) + (CFG.topPadVh || 0) * window.innerHeight
    let yOff = Math.max(topPad, (heroH - totalH) / 2)

    const sc = document.createElement('canvas').getContext('2d')!
    sc.font = `${CFG.fillWeight} ${FILL_SZ}px ${CFG.fillFontFamily}`
    ;(sc as any).fontVariationSettings = FVS

    const chars: Char[] = []
    let pi = 0

    for (const scan of scans) {
      for (let ri = 0; ri < scan.rows.length; ri++) {
        const hy = yOff + ri * LINE_H
        const spans = scan.rows[ri]
        for (const span of spans) {
          const x0 = span.x + xShift
          const x1 = span.x + span.w + xShift
          let cx2 = x0
          while (cx2 < x1) {
            const ch = POOL[pi % POOL.length]; pi++
            const cw = sc.measureText(ch).width
            if (cx2 + cw > x1) break
            chars.push({ ch, hx: cx2, hy, dx: 0, dy: 0 })
            cx2 += cw
          }
        }
      }
      yOff += scan.scanH + WORD_GAP
    }

    return chars
  }

  function computeCanvasHeight(CW: number, layoutCW: number, heroH: number): number {
    const probe = document.createElement('canvas').getContext('2d')!
    const refSize = 200
    probe.font = `${CFG.largeWeight} ${refSize}px ${CFG.largeFontFamily}`
    let maxWid = 0
    let totalScanH = 0
    for (const word of CFG.words) {
      const m = probe.measureText(word)
      const w = m.actualBoundingBoxLeft + m.actualBoundingBoxRight
      if (w > maxWid) maxWid = w
    }
    if (maxWid < 1) maxWid = refSize * (CFG.words[0].length || 4) * 0.6
    const fontSize = (layoutCW * CFG.widthFraction / maxWid) * refSize

    for (const word of CFG.words) {
      const sc2 = document.createElement('canvas').getContext('2d')!
      sc2.font = `${CFG.largeWeight} ${fontSize}px ${CFG.largeFontFamily}`
      ;(sc2 as any).fontVariationSettings = FVS
      sc2.textBaseline = 'alphabetic'
      const mW2 = sc2.measureText(word)
      totalScanH += Math.ceil(mW2.actualBoundingBoxAscent + mW2.actualBoundingBoxDescent + LINE_H * 0.5)
    }

    const WORD_GAP = LINE_H * CFG.wordGap
    const totalH = totalScanH + WORD_GAP * (CFG.words.length - 1)
    const refW = Math.min(CW, 850)
    const topPad = LINE_H * CFG.verticalPad + (CFG.extraTopPad || 0) * (refW / 850) + (CFG.topPadVh || 0) * window.innerHeight
    const botPad = LINE_H * CFG.verticalPad + (CFG.extraBottomPad || 0) * (refW / 850)
    const yOff = Math.max(topPad, (heroH - totalH) / 2)
    return Math.ceil(yOff + totalH + botPad)
  }

  function drawFrame(chars: Char[], CW: number, CH: number, dpr: number, mp: { x: number; y: number } | null) {
    const fillFont = `${CFG.fillWeight} ${FILL_SZ}px ${CFG.fillFontFamily}`

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, CW, CH)

    ctx.fillStyle = ink
    ctx.font = fillFont
    // Pinned to the chrome font settings; rclt is default-on so GEOM 25 lands the
    // same UI variant forms. (Unsupported canvas props are ignored.)
    ;(ctx as any).fontVariationSettings = FVS
    ;(ctx as any).fontFeatureSettings = "'rclt' 1"
    ctx.textBaseline = 'top'

    const radius = isMouseDown ? 250 : 100
    const strength = isMouseDown ? 105 : 35
    const scalePk = isMouseDown ? 6 : 4

    for (const c of chars) {
      if (mp) {
        const tx = c.hx + c.dx
        const ty = c.hy + c.dy
        const rx = tx - mp.x
        const ry = ty - mp.y
        const dist = Math.sqrt(rx * rx + ry * ry)
        if (dist < radius && dist > 0) {
          const f = (1 - dist / radius) * strength * 0.3
          c.dx += (rx / dist) * f
          c.dy += (ry / dist) * f
        }
      }
      c.dx *= 0.94
      c.dy *= 0.94

      const tx2 = c.hx + c.dx
      const ty2 = c.hy + c.dy
      let scale = 1

      if (mp) {
        const d2 = Math.sqrt((tx2 - mp.x) * (tx2 - mp.x) + (ty2 - mp.y) * (ty2 - mp.y))
        if (d2 < radius) scale = 1 + (scalePk - 1) * (1 - d2 / radius)
      }

      if (scale > 1.05) {
        const sz = FILL_SZ * scale
        ctx.font = `${CFG.fillWeight} ${sz.toFixed(1)}px ${CFG.fillFontFamily}`
        ctx.fillText(c.ch, tx2, ty2 - (sz - FILL_SZ) * 0.5)
        ctx.font = fillFont
      } else {
        ctx.fillText(c.ch, tx2, ty2)
      }
    }
  }

  let chars: Char[] = []
  let rafId: number | null = null
  let mp: { x: number; y: number } | null = null
  let CW = 0, CH = 0, dpr = 1

  function init() {
    dpr = window.devicePixelRatio || 1
    const parentW = Math.floor(canvasEl.parentElement!.getBoundingClientRect().width)
    const capW = isFinite(CFG.maxWidth) ? CFG.maxWidth : parentW
    CW = Math.max(Math.min(parentW, capW), 320)
    const layoutCW = CW

    FILL_SZ = Math.max(CFG.minFillSize || 0, CFG.fillSize * Math.pow(Math.min(CW, 850) / 850, 1.4))
    LINE_H = Math.ceil(1.3 * FILL_SZ)

    const heroH = CFG.heroHeightFrac > 0 ? Math.round(window.innerHeight * CFG.heroHeightFrac) : 0
    CH = computeCanvasHeight(CW, layoutCW, heroH)

    canvasEl.style.width = CW + 'px'
    canvasEl.style.height = CH + 'px'
    canvasEl.width = Math.round(CW * dpr)
    canvasEl.height = Math.round(CH * dpr)

    chars = buildAllChars(CW, layoutCW, heroH)
    drawFrame(chars, CW, CH, dpr, mp)
    if (!rafId) rafId = requestAnimationFrame(loop)
  }

  function loop() {
    rafId = null
    drawFrame(chars, CW, CH, dpr, mp)
    rafId = requestAnimationFrame(loop)
  }

  // Track the pointer on the window (the canvas is pointer-events:none so its
  // tall headroom never blocks the controls beneath it). Gate to the canvas rect.
  const onMove = (e: MouseEvent) => {
    const r = canvasEl.getBoundingClientRect()
    const x = e.clientX - r.left
    const y = e.clientY - r.top
    mp = x >= 0 && x <= r.width && y >= 0 && y <= r.height ? { x, y } : null
  }
  window.addEventListener('mousemove', onMove)

  function destroy() {
    if (rafId != null) cancelAnimationFrame(rafId)
    rafId = null
    window.removeEventListener('mousedown', onDown)
    window.removeEventListener('mouseup', onUp)
    window.removeEventListener('mousemove', onMove)
  }

  return { init, destroy }
}

export function Letterbox({ ink = '#e8e8e8' }: { ink?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const lb = createLetterbox(canvas, CONFIG, ink)

    let rafResize: number
    const onResize = () => {
      cancelAnimationFrame(rafResize)
      rafResize = requestAnimationFrame(lb.init)
    }

    document.fonts.ready.then(() => {
      lb.init()
      window.addEventListener('resize', onResize)
    })

    return () => {
      window.removeEventListener('resize', onResize)
      cancelAnimationFrame(rafResize)
      lb.destroy()
    }
  }, [ink])

  return (
    <div className="footer-letterbox">
      <canvas ref={canvasRef} aria-label="ReCal Sans" />
    </div>
  )
}
