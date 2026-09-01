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
// vs(): a font-variation-settings string. Only includes axes explicitly passed in.
const vs = (specified) => {
  const parts = []
  if ('wght' in specified) parts.push(`'wght' ${specified.wght}`)
  if ('GEOM' in specified) parts.push(`'GEOM' ${specified.GEOM}`)
  if ('YTAS' in specified) parts.push(`'YTAS' ${specified.YTAS}`)
  if ('SHRP' in specified) parts.push(`'SHRP' ${specified.SHRP}`)
  if ('opsz' in specified) parts.push(`'opsz' ${specified.opsz}`)
  return parts.join(', ')
}

// GLYPH DECISIONS — what each preset freezes, and what a static page asks for by name.
// Native rclt is left exactly as the font ships it; this only augments it, through the
// set-freezing ReCal's rail already does.
//
// A SET WHERE THE SET IS EXACT, A CHARACTER VARIANT WHERE IT IS NOT. Verified coverage:
//   ss16  six nine                                     -- exactly the pair, so use the set
//   ss02  a (+ae aring)                                -- tight
//   ss10  C a→ss01 c j t u y (+13 more)                -- a whole geometric cut
//   ss18  I a g l (+IJ ae aring ldot)                  -- drags three letters with the a
// So `y` is cv22, not ss10: ss10 would swap seven letters to move one, and its a→a.ss01
// collides with ss02's a→a.ss02 in any preset naming both -- which one wins depends on
// lookup order in the font rather than on intent. Same reason `a` is cv02/cv03 and not
// ss18. The equivalence only ever held for cv26+cv27 === ss16.
//
//   cv02 -> a.ss02   (the default 'a', made addressable)
//   cv03 -> a.ss18       cv11 -> G.ss07       cv22 -> y.ss10
//
// FIGURES ARE PAGE-ONLY FOR NOW: ss16 is not in the baker yet, so the landing pages can
// render it before the customizer above them can.
const GLYPHS = {
  'GT America': { sets: ['cv02'] },
  Gotham:       { sets: ['cv02', 'ss16'], pending: ['ss16'] },
  'Neutra 2':   { sets: ['cv02', 'cv22'] },
  Geist:        { sets: ['cv03', 'cv11', 'ss16'], pending: ['ss16'] },
  Poppins:      { sets: ['cv22', 'ss16'],         pending: ['ss16'] },
  Circular:     { sets: ['cv30', 'cv31'] },
  Inter:        { sets: ['ss16'],                 pending: ['ss16'] },
}

/** The freeze list as a font-feature-settings value, for the pages and the OG cards. */
export const ff = (presetName) => {
  const g = GLYPHS[presetName]
  return g ? g.sets.map(t => `'${t}' 1`).join(', ') : ''
}

export { GLYPHS }

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
    // One word per weight x italic slot (400/500/600/700 x roman/italic) -- natural
    // vocabulary that happens to carry the preset's frozen y (cv22) and figures (ss16),
    // not built ONLY from them. See [[sample-vs-unique-glyphs]].
    words: ['Journey 96', 'Runway 719', 'Holiday 68', 'Symphony 1794', 'Getaway 29', 'Melody Canvas', 'Odyssey Draft', 'Rhapsody 953'],
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
    // Per-referent FAQ copy. These two answers used to be one shared template with the
    // name swapped in -- the single largest duplicated block across the eight pages, and
    // exactly the near-duplicate shape Google's scaled-content policy names. Each page
    // now says something true about THIS face. Keep them specific or the duplication
    // comes straight back.
    faqWhy:
      'Because of control, not cost. Poppins ships one drawing for every size — the same circles at 12px and at 120px, with no optical-size axis to reconcile them. ReCal Sans gives you a GEOM axis that runs from accessibility-optimized shapes to fully geometric ones, a real opsz axis, and an export that bakes your position on both into the file.',
    faqDiff:
      'Poppins is a fixed design that varies only in weight: its circles are the same circles at every size. ReCal Sans varies the shapes themselves — GEOM moves the letterforms between accessibility-optimized and geometric, opsz adjusts the drawing to the size it is set at, and the exported static file keeps whatever you chose.',
    pitch: {
      title: 'Tuned toward Poppins',
      paragraphs: [
        'The geometric axis raised toward the circular, monolinear feel Poppins is loved for — and a real optical-size axis Poppins doesn’t have. Everything here is live: drag the axes, edit this text, press ⇄ to see it in Poppins itself, then download the font with your settings baked in.',
      ],
    },
  },
  {
    slug: 'inter',
    referent: 'Inter',
    preset: 'Inter',
    kind: 'free',
    words: ['Horizon 68', 'Balance 719', 'Contrast 29', 'Precision 1794', 'Interval 953', 'Outline 602', 'Texture 46', 'Sequence 891'],
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
    // Per-referent FAQ copy. These two answers used to be one shared template with the
    // name swapped in -- the single largest duplicated block across the eight pages, and
    // exactly the near-duplicate shape Google's scaled-content policy names. Each page
    // now says something true about THIS face. Keep them specific or the duplication
    // comes straight back.
    faqWhy:
      'Because of voice, not cost. Inter is an excellent screen face and it already carries an optical-size axis — what it does not carry is a way out of its own register. ReCal Sans adds a GEOM axis that moves the letterforms from accessibility-optimized through clean UI to geometric display, covering ground Inter deliberately does not.',
    faqDiff:
      'Inter varies weight, optical size and slant inside one deliberately neutral design. ReCal Sans varies the design itself: GEOM travels from accessibility-optimized shapes through clean UI to geometric display, so a single file can be a UI face on one screen and a display face on the next.',
    pitch: {
      title: 'Tuned toward Inter',
      paragraphs: [
        'A clean UI register — the screen-native neutrality Inter is famous for, plus a geometric axis Inter doesn’t carry. Everything here is live: drag the axes, edit this text, press ⇄ to see it in Inter itself, then download the font with your settings baked in.',
      ],
    },
  },
  {
    slug: 'geist',
    referent: 'Geist',
    preset: 'Geist',
    kind: 'free',
    words: ['Garage 96', 'Gravity 719', 'Gadget 68', 'Voyage Grid', 'Gallery 1794', 'Signal Garage', 'Guardian 29', 'Grand Canvas'],
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
    // Per-referent FAQ copy. These two answers used to be one shared template with the
    // name swapped in -- the single largest duplicated block across the eight pages, and
    // exactly the near-duplicate shape Google's scaled-content policy names. Each page
    // now says something true about THIS face. Keep them specific or the duplication
    // comes straight back.
    faqWhy:
      'Because of range, not cost. Geist is drawn tight around developer tooling — one register, sized by you rather than by the font. ReCal Sans adds a real optical-size axis and a GEOM axis you set yourself, then bakes both into a static file you ship.',
    faqDiff:
      'Geist ships as fixed families drawn for one register, with no optical-size axis to adapt them. ReCal Sans is a single variable file: GEOM re-draws the letterforms between accessibility-optimized and geometric, opsz keeps the drawing honest from body copy to headline, and you freeze your settings in before you ship.',
    pitch: {
      title: 'Tuned toward Geist',
      paragraphs: [
        'Crisp and geometric — the developer-tool sharpness Geist is known for, with optical sizing and italics Geist doesn’t ship. Everything here is live: drag the axes, edit this text, press ⇄ to see it in Geist itself, then download the font with your settings baked in.',
      ],
    },
  },
  {
    slug: 'futura',
    referent: 'Futura',
    preset: 'Futura',
    kind: 'paid',
    // No frozen glyph set for this referent (not in GLYPHS) -- words lean on Futura's
    // own story (Paul Renner, 1927 German Bauhaus) instead, and double as a diacritic check.
    words: ['Neue Form', 'Klare Linie', 'Bauhaus Kreis', 'Reine Geometrie', 'Kühne Zukunft', 'Cercle Parfait', 'Nouvelle Ère', 'Círculo Perfecto'],
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
    // Per-referent FAQ copy. These two answers used to be one shared template with the
    // name swapped in -- the single largest duplicated block across the eight pages, and
    // exactly the near-duplicate shape Google's scaled-content policy names. Each page
    // now says something true about THIS face. Keep them specific or the duplication
    // comes straight back.
    faqWhy:
      'Yes. ReCal Sans is free and open-source under the SIL Open Font License. Push GEOM to 100 and raise the ascender axis and you reach the circles-first construction and above-cap-height extenders Futura established in 1927 — plus an optical-size axis no metal-era design was ever drawn with. Tune it in the browser, download a static TTF, pay nothing.',
    faqDiff:
      'Futura is a 1927 design distributed as static styles: what the foundry drew is what you set. ReCal Sans reaches the same geometric territory through axes instead — GEOM for the construction, an ascender axis for those characteristic tall extenders, terminal sharpness, and an optical-size axis the original never had.',
    pitch: {
      title: 'Tuned toward Futura',
      paragraphs: [
        'Fully geometric — tall ascenders, sharp terminals, the circles-first construction Futura defined in 1927. Everything here is live: drag the axes, edit this text, then download the font with your settings baked in. Free under the OFL.',
      ],
    },
  },
  {
    slug: 'neutra',
    referent: 'Neutra',
    preset: 'Neutra 2',
    kind: 'paid',
    words: ['Yesterday Study', 'Runaway Season', 'Highway Habitat', 'Getaway Notes', 'Everyday Canvas', 'Halfway Draft', 'Layaway Cabinet', 'Anyway Statement'],
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
    // Per-referent FAQ copy. These two answers used to be one shared template with the
    // name swapped in -- the single largest duplicated block across the eight pages, and
    // exactly the near-duplicate shape Google's scaled-content policy names. Each page
    // now says something true about THIS face. Keep them specific or the duplication
    // comes straight back.
    faqWhy:
      'Yes. ReCal Sans is free and open-source under the SIL Open Font License. Its ascender and terminal-sharpness axes reach the tall-extender, flat-cut architectural register Neutra is loved for, and you decide where to stop rather than picking a cut someone else stopped at. No per-seat license, no web tier.',
    faqDiff:
      'Neutra ships fixed, in the optical sizes its foundry chose to draw. ReCal Sans hands you those decisions as controls: ascender height, terminal sharpness, and a continuous optical-size axis — so you set the register instead of choosing between cut names.',
    pitch: {
      title: 'Tuned toward Neutra',
      paragraphs: [
        'An architectural register — tall ascenders, flat sharpened terminals, the mid-century signage feel Neutra made famous. Everything here is live: drag the axes, edit this text, then download the font with your settings baked in. Free under the OFL.',
      ],
    },
  },
  {
    slug: 'circular',
    referent: 'Circular',
    preset: 'Circular',
    kind: 'paid',
    words: ['Warm Circle', 'Friendly Round', 'Círculo Cálido', 'Buenas Vibras', 'Cercle Doux', 'Rond Joyeux', 'Warmer Kreis', 'Runde Wärme'],
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
    // Per-referent FAQ copy. These two answers used to be one shared template with the
    // name swapped in -- the single largest duplicated block across the eight pages, and
    // exactly the near-duplicate shape Google's scaled-content policy names. Each page
    // now says something true about THIS face. Keep them specific or the duplication
    // comes straight back.
    faqWhy:
      'Yes. ReCal Sans is free and open-source under the SIL Open Font License. The warm, rounded geometric register Circular is licensed for is a GEOM setting here, and the licensing question disappears with it: no pageview tiers, no renewals, no counting seats.',
    faqDiff:
      'Circular ships fixed, and its web license is metered by traffic. ReCal Sans is a variable file under the OFL: GEOM sets how geometric the letterforms are, opsz adapts the drawing to size, and the static font you export is yours to deploy anywhere without counting anything.',
    pitch: {
      title: 'Tuned toward Circular',
      paragraphs: [
        'A warm geometric register — the rounded, friendly construction Circular sold to a decade of brands, without the license. Everything here is live: drag the axes, edit this text, then download the font with your settings baked in. Free under the OFL.',
      ],
    },
  },
  {
    slug: 'gotham',
    referent: 'Gotham',
    // Boots the app's own Gotham preset, so the page and the preset cannot drift.
    preset: 'Gotham',
    kind: 'paid',
    words: ['Quiet Season', 'Bold Statement', 'Modern Habitat', 'Wide Passage', 'Steady Signal', 'Diagram Study', 'Package Notes', 'Cabinet Draft'],
    axes: vs({ opsz: 10 }),
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
    // Per-referent FAQ copy. These two answers used to be one shared template with the
    // name swapped in -- the single largest duplicated block across the eight pages, and
    // exactly the near-duplicate shape Google's scaled-content policy names. Each page
    // now says something true about THIS face. Keep them specific or the duplication
    // comes straight back.
    faqWhy:
      'Yes. ReCal Sans is free and open-source under the SIL Open Font License. Hold GEOM in the upright, even-stroked middle and freeze the optical size small, and you land near the confident American geometry Gotham made a branding default — in a file you own outright.',
    faqDiff:
      'Gotham ships as a large fixed family: you pick a cut, then a weight, and the drawing is settled. ReCal Sans ships as one variable file you tune — GEOM for the construction, a real optical-size axis for the size it will be used at — and freezes your choices into a static TTF on export.',
    pitch: {
      title: 'Tuned toward Gotham',
      paragraphs: [
        'Upright and geometric — the confident, even-stroked construction Gotham made a branding default, without the license. Everything here is live: drag the axes, edit this text, then download the font with your settings baked in. Free under the OFL.',
      ],
    },
  },
  {
    slug: 'gt-america',
    referent: 'GT America',
    preset: 'GT America',
    kind: 'paid',
    words: ['Working Draft', 'Wide Canvas', 'Season Change', 'Payload Ready', 'Habitat Study', 'Almanac Notes', 'Framework Draft', 'Adjacent Lane'],
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
    // Per-referent FAQ copy. These two answers used to be one shared template with the
    // name swapped in -- the single largest duplicated block across the eight pages, and
    // exactly the near-duplicate shape Google's scaled-content policy names. Each page
    // now says something true about THIS face. Keep them specific or the duplication
    // comes straight back.
    faqWhy:
      'Yes. ReCal Sans is free and open-source under the SIL Open Font License. GT America answers the grotesque question by drawing it out across widths and weights; ReCal Sans answers it with axes — one variable file whose GEOM axis runs from accessibility-optimized to geometric, exported static once you have decided.',
    faqDiff:
      'GT America solves range by drawing it: many widths and weights, every one of them fixed. ReCal Sans solves it with axes — a single file whose GEOM axis runs from accessibility-optimized to geometric and whose opsz axis adapts the drawing to the size, exported static when you are done.',
    pitch: {
      title: 'Tuned toward GT America',
      paragraphs: [
        'A grotesque register — the plainspoken, workhorse feel GT America is licensed for, free under the OFL. Everything here is live: drag the axes, edit this text, then download the font with your settings baked in.',
      ],
    },
  },
]
