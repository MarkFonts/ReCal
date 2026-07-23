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
// compare + gf/adobe: the referent webfont, when one is legally embeddable.
//   gf:     Google Fonts css2 family query — the page loads it and the app's ⇄
//           button swaps the specimen text into the referent.
//   adobe:  true = ships via the Adobe Fonts kit (ADOBE_KIT below). Until the kit
//           id is set, those pages generate without the swap.
//   Paid fonts with no webfont source (Gotham, GT America, Circular, Neutra) get
//   no compare — we can't legally embed them.
//
// vs(): a font-variation-settings string. Defaults: wght 400, YTAS 720, SHRP 0, GEOM 25.
const vs = ({ GEOM = 25, wght = 400, YTAS = 720, SHRP = 0, opsz }) => {
  const parts = [`'wght' ${wght}`, `'GEOM' ${GEOM}`, `'YTAS' ${YTAS}`, `'SHRP' ${SHRP}`]
  if (opsz !== undefined) parts.push(`'opsz' ${opsz}`)
  return parts.join(', ')
}

// Adobe Fonts Web Project id (use.typekit.net/<id>.css). Kit carries Futura PT
// 300/400/500/600/700(Heavy)/800 + obliques as 'futura-pt' (the separate
// 'futura-pt-bold' family duplicates 700 — unused).
export const ADOBE_KIT = 'nsz1oha'

export const SEO_PRESETS = [
  {
    slug: 'poppins',
    referent: 'Poppins',
    preset: 'Poppins',
    kind: 'free',
    axes: vs({ GEOM: 50, opsz: 10 }),
    opticalSizing: false,
    gf: 'Poppins:ital,wght@0,400;0,500;0,600;0,700;1,400;1,700',
    compare: { label: 'Poppins', family: "'Poppins', sans-serif", wghtRange: [400, 700], italic: true },
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
        'This is ReCal Sans with the geometric axis raised toward the circular, monolinear feel Poppins is loved for — and a real optical-size axis Poppins doesn’t have. Everything here is live: drag the axes, edit this text, press ⇄ to see it in Poppins itself, then download the font with your settings baked in.',
      ],
    },
  },
  {
    slug: 'inter',
    referent: 'Inter',
    preset: 'Inter',
    kind: 'free',
    axes: vs({ GEOM: 25 }),
    opticalSizing: true,
    gf: 'Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900',
    compare: { label: 'Inter', family: "'Inter', sans-serif", wghtRange: [100, 900], opszRange: [14, 32], italic: true },
    title: 'ReCal Sans — a tunable variable alternative to Inter',
    description:
      'Inter is already free and excellent — the reason to look further is voice. ReCal Sans adds a geometric-form axis Inter doesn’t have: one file that runs from accessibility-optimized shapes to geometric display, tuned and downloaded in the browser.',
    h1: 'A tunable, variable alternative to Inter',
    body: [
      'Inter is the modern UI workhorse: a tall x-height screen grotesque with meticulous spacing, variable weight and optical sizing, free under the OFL. If you need neutral, Inter is close to unbeatable — and "free alternative" would be an empty pitch, because Inter costs nothing.',
      'What ReCal Sans adds is range of voice. Its GEOM axis moves the letterforms themselves — from disambiguated, accessibility-first shapes through clean UI forms to circular geometric display — where Inter stays deliberately neutral. Keep the optical sizing you expect, pick the construction you want, and bake it into a static file that ships anywhere.',
    ],
    pitch: {
      title: 'Tuned toward Inter',
      paragraphs: [
        'This is ReCal Sans in its clean UI register — the screen-native neutrality Inter is famous for, plus a geometric axis Inter doesn’t carry. Everything here is live: drag the axes, edit this text, press ⇄ to see it in Inter itself, then download the font with your settings baked in.',
      ],
    },
  },
  {
    slug: 'geist',
    referent: 'Geist',
    preset: 'Geist',
    kind: 'free',
    axes: vs({ GEOM: 50, opsz: 16 }),
    opticalSizing: false,
    gf: 'Geist:wght@100..900',
    compare: { label: 'Geist', family: "'Geist', sans-serif", wghtRange: [100, 900], italic: false },
    title: 'ReCal Sans — a tunable variable alternative to Geist',
    description:
      'Geist is free and sharp — the reason to reach past it is control. ReCal Sans adds real optical sizing and a geometric-form axis you set yourself, then bake into a static font in the browser.',
    h1: 'A tunable, variable alternative to Geist',
    body: [
      'Geist is a crisp, Swiss-leaning developer sans — variable weight, tight spacing, free under the OFL. It nails one voice extremely well: the terminal-adjacent modernism of the platform it was drawn for. It also ships without italics and without optical sizing.',
      'ReCal Sans covers that same clean-geometric ground at GEOM 50, then keeps going: a real optical-size axis so text sizes stay readable, an italic axis, ascender and sharpness controls, and glyph-swap thresholds you can move. Tune the file to your product, download it, ship it.',
    ],
    pitch: {
      title: 'Tuned toward Geist',
      paragraphs: [
        'This is ReCal Sans set crisp and geometric — the developer-tool sharpness Geist is known for, with optical sizing and italics Geist doesn’t ship. Everything here is live: drag the axes, edit this text, press ⇄ to see it in Geist itself, then download the font with your settings baked in.',
      ],
    },
  },
  {
    slug: 'futura',
    referent: 'Futura',
    preset: 'Futura',
    kind: 'paid',
    axes: vs({ GEOM: 100, YTAS: 800, SHRP: 100, opsz: 16 }),
    opticalSizing: false,
    adobe: true,
    compare: {
      label: 'Futura PT', family: "'futura-pt', sans-serif", wghtRange: [400, 700], italic: true,
      // Kit subset to English + ligatures, weights 400–700 (Light/Extra Bold dropped).
      // The blackest cut ships as its own family, so slider 700 → Futura PT Bold.
      heavy: { from: 700, family: "'futura-pt-bold', sans-serif", weight: 700 },
      // Headers read cleaner in Demi than the heavy Bold cut.
      headingWght: 600,
    },
    title: 'ReCal Sans — a free variable alternative to Futura',
    description:
      'ReCal Sans is a free, open-source variable geometric sans you can tune in the browser and download. If you reach for Futura, this is an OFL alternative with true geometric forms, tall ascenders, and a real optical-size axis.',
    h1: 'A free, tunable alternative to Futura',
    body: [
      'Futura is the geometric sans — Paul Renner’s 1927 circles-and-triangles modernism, with its pointed apexes, long ascenders, and single-story a. Nearly a century on it still reads as "the future," and it is still licensed commercially, weight by weight.',
      'ReCal Sans at GEOM 100 goes fully geometric: circular bowls, sharpened terminals, and an ascender axis you can push to Futura’s classical proportions. Unlike a static Futura license, the file is free (OFL), variable, and optically sized — one download covers captions to display. Tune it, then bake your settings in.',
    ],
    pitch: {
      title: 'Tuned toward Futura',
      paragraphs: [
        'This is ReCal Sans pushed fully geometric — tall ascenders, sharp terminals, the circles-first construction Futura defined in 1927. Everything here is live: drag the axes, edit this text, then download the font with your settings baked in. Free under the OFL.',
      ],
    },
  },
  {
    slug: 'neutra',
    referent: 'Neutra',
    preset: 'Neutra 2',
    kind: 'paid',
    axes: vs({ GEOM: 25, YTAS: 800, SHRP: 100 }),
    opticalSizing: false,
    compare: { label: 'Neutraface', family: 'sans-serif', italic: false },
    title: 'ReCal Sans — a free variable alternative to Neutra',
    description:
      'ReCal Sans is a free, open-source variable sans you can tune in the browser and download. If you like Neutra’s architectural modernism, this is an OFL alternative with tall ascenders, sharp terminals, and real optical sizing.',
    h1: 'A free, tunable alternative to Neutra',
    body: [
      'Neutra (and Neutraface after it) channels Richard Neutra’s mid-century architectural modernism: long elegant ascenders, low waists, flat sharp terminals — typography as signage. It is beautiful, distinctive, and commercially licensed.',
      'ReCal Sans can be tuned into that architectural register: raise the ascender axis to 800, push terminal sharpness to full, and keep the construction clean. The result is free (OFL), variable, and optically sized — and the exported file bakes your proportions in, no styling required at the call site.',
    ],
    pitch: {
      title: 'Tuned toward Neutra',
      paragraphs: [
        'This is ReCal Sans in an architectural register — tall ascenders, flat sharpened terminals, the mid-century signage feel Neutra made famous. Everything here is live: drag the axes, edit this text, then download the font with your settings baked in. Free under the OFL.',
      ],
    },
  },
  {
    slug: 'circular',
    referent: 'Circular',
    preset: 'Circular',
    kind: 'paid',
    axes: vs({ GEOM: 25, opsz: 20 }),
    opticalSizing: false,
    compare: { label: 'Circular', family: 'sans-serif', italic: false },
    title: 'ReCal Sans — a free variable alternative to Circular',
    description:
      'ReCal Sans is a free, open-source variable geometric sans you can tune in the browser and download. If you use Circular, this is a customizable, OFL alternative with a friendlier license and a real optical-size axis.',
    h1: 'A free, tunable alternative to Circular',
    body: [
      'Circular is the friendly geometric that powered a decade of consumer brands — round bowls warmed up with humanist details, licensed from a boutique foundry at boutique prices. Its warmth is the point; its cost and closed license are the constraint.',
      'ReCal Sans sits in the same geometric-with-warmth territory, and it is free (OFL) and variable. Set the geometric axis where you want the temperature, fix an optical size for your product’s range, and download a static file you can embed anywhere — apps, sites, print — without a license conversation.',
    ],
    pitch: {
      title: 'Tuned toward Circular',
      paragraphs: [
        'This is ReCal Sans in its warm geometric register — the rounded, friendly construction Circular sold to a decade of brands, without the license. Everything here is live: drag the axes, edit this text, then download the font with your settings baked in. Free under the OFL.',
      ],
    },
  },
  {
    slug: 'gotham',
    referent: 'Gotham',
    // Gotham is deliberately NOT an app preset — the page resembles it via raw boot
    // axes so the tool never ships a named "Gotham" preset. Still fully SEO-findable.
    bootAxes: { GEOM: 50 },
    bootFreezeOpsz: 14,
    kind: 'paid',
    axes: vs({ GEOM: 50, opsz: 14 }),
    opticalSizing: false,
    // No embeddable webfont → disabled compare control (label only, no css).
    compare: { label: 'Gotham', family: 'sans-serif', italic: false },
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
    compare: { label: 'GT America', family: 'sans-serif', italic: false },
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
