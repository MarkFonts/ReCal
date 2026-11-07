import { useEffect, useRef } from 'react'
import { createLetterbox } from '../shared/src/letterbox.js'

// Canvas letterbox footer: the shared wm-primitives letterbox, with this app's settings.
// The large word is scanned into an alpha mask and packed with tiny fill glyphs. The
// font is pinned to the app's chrome settings (unmodified CalSansVF at opsz 10, GEOM 25,
// rclt on) so the footer never responds to the slider or custom thresholds. The mouse
// pushes and scales the fill glyphs, and on an HDR display with WebGPU a seeded share
// of them twinkles into HDR (everywhere else the Canvas 2D path runs).

const LOREM =
  'loremipsumdolorsitametconsecteturadipiscingelitseddoeiusmodtemporincididuntutlaboreetdoloremagnaaliquautenimadminimveniamquisnostrudexercitationullamcolaborisnisiutaliquipexeacommodoconsequatduisauteiruredolorinreprehenderitinvoluptatevelitessecillumdoloreeuefugiatnullapariaturexcepteursintoccaecatcupidatatnonproidentsuntinculpaquiofficiadeseruntmollitanimidestlaborum'

export function Letterbox({ ink = '#e8e8e8' }: { ink?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const lb = createLetterbox(canvasRef.current, {
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
      // Big top headroom = room for the upward mouse-push. The canvas is pulled up
      // behind the page content (App.css z-index:-1 + negative margin-top), so this
      // headroom overlaps the UI invisibly and the push never clips. Bottom pad 0 so
      // WORDMARK sits flush to the page bottom.
      extraTopPad: 280,
      extraBottomPad: 0,
      minFillSize: 6,
      fvs: "'opsz' 10, 'GEOM' 25",
      ffs: "'rclt' 1",
      pool: LOREM,
      ink,
      // The canvas is pointer-events:none, so react to the window, inside its rect only.
      pointer: 'window-gated',
      hdr: { gain: 1, twinkle: { mode: 'stars', share: 1 / 6, peak: 2.5 } },
    })
    if (!lb) return
    document.fonts.ready.then(lb.init)
    return () => lb.destroy()
  }, [ink])

  return (
    <div className="footer-letterbox">
      <canvas ref={canvasRef} aria-label="ReCal Sans" />
    </div>
  )
}
