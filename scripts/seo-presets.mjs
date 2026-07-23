// SEO landing-page data — the crawlable comparison surface (Appendix A).
// Hand-curated marketing copy per preset (nominative use only: no competitor logos
// or wordmarks, no "is X" claims; honest type criticism is the moat). Axes mirror
// src/instrument/presets.ts but as plain CSS font-variation-settings for a Pyodide-free
// specimen — the GEOM axis drives the real glyph swaps in pure CSS.
//
// kind: 'paid' referents get the "free alternative" angle; 'free' referents are
// already OFL (Google Fonts) so the pitch is variable/customizable/tunable — never
// price. Claiming a "free alternative" to an already-free font is wrong and reads
// as clueless to any designer.
//
// pitch: the referent-aware text the fused landing page boots the app's Paragraph
// scene with (via window.__RECAL_BOOT) — the first thing a visitor reads *inside*
// the live tool.
//
// vs(): a font-variation-settings string. Defaults: wght 400, YTAS 720, SHRP 0, GEOM 25.
const vs = ({ GEOM = 25, wght = 400, YTAS = 720, SHRP = 0, opsz }) => {
  const parts = [`'wght' ${wght}`, `'GEOM' ${GEOM}`, `'YTAS' ${YTAS}`, `'SHRP' ${SHRP}`]
  if (opsz !== undefined) parts.push(`'opsz' ${opsz}`)
  return parts.join(', ')
}

export const SEO_PRESETS = [
  {
    slug: 'poppins',
    referent: 'Poppins',
    preset: 'Poppins',
    kind: 'free',
    axes: vs({ GEOM: 50, opsz: 10 }),
    opticalSizing: false,
    title: 'ReCal Sans — a tunable variable alternative to Poppins',
    description:
      'Poppins is already free — so the reason to switch is control. ReCal Sans is a variable font you tune in the browser: a geometric axis, a real optical-size axis, and your own defaults baked into the file you download.',
    h1: 'A tunable, variable alternative to Poppins',
    body: [
      'Poppins is a clean geometric sans with near-monolinear strokes and circular bowls — deservedly popular for friendly, modern UI, and free under the OFL. So a "free alternative" pitch would be meaningless. The honest comparison is about control: Poppins ships one optical treatment across every size, and its perfect circles can feel generic at text sizes.',
      'ReCal Sans is built on Cal Sans, a variable font with a geometric axis (GEOM) and a real optical-size axis (opsz). Push GEOM up for the same circular, display-geometric feel; keep opsz honest so the same file reads well from body copy to billboards. Then bake your choices into a static file and ship it — no per-site font-variation-settings required.',
    ],
    pitch: {
      title: 'Tuned toward Poppins',
      paragraphs: [
        'This is ReCal Sans with the geometric axis raised toward the circular, monolinear feel Poppins is loved for — and a real optical-size axis Poppins doesn’t have. Everything here is live: drag the axes, edit this text, then download the font with your settings baked in.',
      ],
    },
  },
  {
    slug: 'gotham',
    referent: 'Gotham',
    preset: 'Gotham',
    kind: 'paid',
    axes: vs({ GEOM: 50, opsz: 14 }),
    opticalSizing: false,
    title: 'ReCal Sans — a free variable alternative to Gotham',
    description:
      'ReCal Sans is a free, open-source variable geometric sans you can tune in the browser and download. If you use Gotham, this is a customizable, OFL alternative with a real optical-size axis.',
    h1: 'A free, tunable alternative to Gotham',
    body: [
      'Gotham is a confident American geometric sans — even strokes, a tall x-height, and squared-off geometry drawn from mid-century signage. It set a tone for a decade of branding, and it is licensed accordingly.',
      'ReCal Sans is free and open (OFL), built on the variable Cal Sans. Raise GEOM for the same upright, geometric construction and set a generous ascender; keep the optical-size axis honest so one file works from captions to headlines. Tune it, then download a static TTF — no license, no per-weight purchase.',
    ],
    pitch: {
      title: 'Tuned toward Gotham',
      paragraphs: [
        'This is ReCal Sans set upright and geometric — the confident, even-stroked construction Gotham made a branding default, without the license. Everything here is live: drag the axes, edit this text, then download the font with your settings baked in. Free under the OFL.',
      ],
    },
  },
  {
    slug: 'gt-america',
    referent: 'GT America',
    preset: 'GT America',
    kind: 'paid',
    axes: vs({ GEOM: 25, opsz: 8 }),
    opticalSizing: false,
    title: 'ReCal Sans — a free variable alternative to GT America',
    description:
      'ReCal Sans is a free, open-source variable sans you can tune in the browser and download. If you license GT America, this is a customizable, OFL alternative with an accessibility-to-geometric axis.',
    h1: 'A free, tunable alternative to GT America',
    body: [
      'GT America is a versatile American-grotesque family that bridges 19th-century grotesques and mid-century neo-grotesques — an excellent, and paid, workhorse. Its breadth is the point; its cost and closed license are the constraint.',
      'ReCal Sans is free and open (OFL) and built on the variable Cal Sans. Its GEOM axis runs from accessibility-optimized forms (disambiguated I, l, a, g) through clean UI shapes toward geometric display cuts — a grotesque-to-geometric range you set yourself, then download as a static file.',
    ],
    pitch: {
      title: 'Tuned toward GT America',
      paragraphs: [
        'This is ReCal Sans in its grotesque register — the plainspoken, workhorse feel GT America is licensed for, free under the OFL. Everything here is live: drag the axes, edit this text, then download the font with your settings baked in.',
      ],
    },
  },
]
