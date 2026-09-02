// Build-time generator for the fused SEO landing pages (Appendix A).
// Emits dist/<slug>/index.html — one crawlable page per comparison preset,
// engineered to rank for "<referent> alternative".
//
// FUSED SHAPE (app on top, article below): each page loads the REAL app bundle,
// booted via window.__RECAL_BOOT into that referent's preset in the Paragraph
// scene — initial state only, fully editable. The static article (h1, specimen,
// pitch, FAQ, cross-links) sits BELOW #root in normal flow, so it survives in the
// rendered DOM: humans scroll to it, and Google's rendering crawler indexes it.
// Never put the article inside #root — React would replace it on mount and the
// content would vanish from Google's rendered index.
//
// Copy is kind-aware: 'paid' referents get the "free alternative" angle; 'free'
// (OFL) referents get the variable/customizable angle — never price.
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SEO_PRESETS, ADOBE_KIT, ff, GLYPHS, FEATURE_LABELS } from './seo-presets.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = join(__dirname, '..', 'dist')
const ORIGIN = 'https://wordmark.nyc'
const BASE = '/recalsans'
const GA_ID = 'G-MZ4M1P8P1P'
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// The fused pages load the same hashed bundle as the app root — extract the tags
// vite wrote into dist/index.html (this script runs after `vite build`).
// The letterbox is the shared primitive, copied in beside the pages so all eight load
// one cached module rather than inlining ~18KB into each. Source of truth is the
// submodule; this is a copy step, not a fork.
const LB_SRC = join(__dirname, '..', 'shared', 'src', 'letterbox.js')
if (existsSync(LB_SRC)) writeFileSync(join(OUT, 'letterbox.js'), readFileSync(LB_SRC))
else console.warn('[seo] shared/src/letterbox.js missing — run `git submodule update --init`')

const appHtml = readFileSync(join(OUT, 'index.html'), 'utf8')
const appScript = appHtml.match(/<script type="module"[^>]*><\/script>/)?.[0]
const appCss = appHtml.match(/<link rel="stylesheet"[^>]*>/)?.[0]
if (!appScript || !appCss) throw new Error('[seo] could not find app asset tags in dist/index.html')

// 4 weights x roman/italic = 8 slots. Zipped against each preset's p.words (also 8,
// one per slot) so every landing page shows its full style range, not one static line.
const STYLES = [
  { wght: 400, ital: 0, label: 'Regular' },
  { wght: 400, ital: 1, label: 'Regular Italic' },
  { wght: 500, ital: 0, label: 'Medium' },
  { wght: 500, ital: 1, label: 'Medium Italic' },
  { wght: 600, ital: 0, label: 'Semibold' },
  { wght: 600, ital: 1, label: 'Semibold Italic' },
  { wght: 700, ital: 0, label: 'Bold' },
  { wght: 700, ital: 1, label: 'Bold Italic' },
]

function page(p, all) {
  const url = `${ORIGIN}${BASE}/${p.slug}/`
  // Each landing page gets its own card: the referent set in ReCal Sans at that page's
  // exact axes. Every page used to share /thumb.png -- the studio wordmark -- so the
  // pages built to rank for "free <font> alternative" all previewed identically and
  // told a sharer nothing. It is also the only image Google Images has to work with.
  const ogImage = `${ORIGIN}${BASE}/og/${p.slug}.jpg`
  const ogAlt = `The word ${p.referent} set in ReCal Sans, a free open-source variable alternative to ${p.referent}.`
  const readableAxes = p.axes.replace(/'/g, '').split(', ')
    .filter(a => !['wght 400', 'YTAS 720', 'SHRP 0'].includes(a)).join(' \u00b7 ')
  const others = all.filter(x => x.slug !== p.slug)
  const paid = p.kind === 'paid'

  // THE FIRST TWO ANSWERS ARE PER-REFERENT, IN seo-presets.mjs. They were templates with
  // the name swapped in, and across eight pages that made ~88 words of every page byte-
  // identical to its siblings -- the near-duplicate shape Google's scaled-content policy
  // describes. p.faqWhy / p.faqDiff carry copy written for THIS face; the templates below
  // survive only as a fallback so a newly added preset still generates before its copy is
  // written. A new preset that ships on the fallback is a page that reads as scaled content
  // -- write the two answers.
  const faq = [
    paid
      ? {
          q: `Is there a free alternative to ${p.referent}?`,
          a: p.faqWhy ?? `Yes. ReCal Sans is free and open-source (SIL Open Font License). It is a variable font you tune in the browser — set the geometric, weight, optical-size and ascender axes to taste — then download a static TTF. No account, no cost, no license fee.`,
        }
      : {
          q: `${p.referent} is already free — why use ReCal Sans instead?`,
          a: p.faqWhy ?? `Because of control, not cost. ${p.referent} ships fixed; ReCal Sans is variable and customizable — a GEOM axis from accessibility-optimized to geometric forms, a real optical-size axis, and adjustable ascender height. You set the defaults in the browser and download a font with those decisions baked in.`,
        },
    {
      q: `How is ReCal Sans different from ${p.referent}?`,
      a: p.faqDiff ?? `${p.referent} ships fixed. ReCal Sans is variable and customizable: a single GEOM axis moves letterforms from accessibility-optimized through clean UI to geometric display, and a real optical-size axis keeps the design honest across sizes. You bake your own settings into the exported font.`,
    },
    {
      q: `Can I use ReCal Sans commercially?`,
      a: `Yes — the SIL Open Font License permits commercial use, embedding and modification. The font is yours to ship.`,
    },
  ]

  const jsonld = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      // The card, tied to the page entity. Structured data is a second, independent way
      // for Google to associate this image with this page -- alt text and the sitemap are
      // the other two, and they do not always agree with each other.
      image: `${ORIGIN}${BASE}/og/${p.slug}.jpg`,
      // EACH PAGE IS ITS OWN ENTITY, AT ITS OWN URL. All eight used to name the same
      // `url` (the app root) and the same `name`, so eight pages asserted eight different
      // descriptions about ONE thing -- a machine-readable instruction to consolidate onto
      // /recalsans/, which is exactly the single page Search Console kept. The @id makes
      // the identity explicit rather than inferred, and `mainEntityOfPage` ties the entity
      // to THIS document. Do not point either back at the app root.
      '@id': `${url}#app`,
      name: `ReCal Sans customizer — ${p.referent} preset`,
      applicationCategory: 'DesignApplication',
      operatingSystem: 'Web browser',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      url,
      mainEntityOfPage: url,
      description: p.description,
      isAccessibleForFree: true,
      license: 'https://opensource.org/license/ofl-1-1',
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faq.map(f => ({
        '@type': 'Question', name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'WORDMARK', item: ORIGIN + '/' },
        { '@type': 'ListItem', position: 2, name: 'ReCal Sans', item: `${ORIGIN}${BASE}/` },
        { '@type': 'ListItem', position: 3, name: `${p.referent} alternative`, item: url },
      ],
    },
  ]

  const keywords = paid
    ? `${p.referent} alternative, free ${p.referent} alternative, ${p.referent} free font, variable font, open source geometric sans, OFL font`
    : `${p.referent} alternative, customizable ${p.referent} alternative, variable font, tunable font, open source geometric sans, OFL font`

  // Referent webfont stylesheet, when legally embeddable: Google Fonts or the Adobe
  // kit. NOT loaded in <head> — the URL rides boot.compare.css and the app injects
  // it lazily on the first compare-on, so visitors who never press ⇄ never fetch it.
  const fontHref = p.gf
    ? `https://fonts.googleapis.com/css2?family=${p.gf}&display=swap`
    : p.adobe && ADOBE_KIT
      ? `https://use.typekit.net/${ADOBE_KIT}.css`
      : null

  const boot = { scene: 'paragraph', pitch: p.pitch }
  // Referents that aren't app presets (Gotham) resemble themselves via raw axes;
  // the rest apply their named preset.
  if (p.bootAxes) { boot.axes = p.bootAxes; if (p.bootFreezeOpsz != null) boot.freezeOpsz = p.bootFreezeOpsz }
  else boot.preset = p.preset
  // Compare control, in order of capability:
  //  · css  → live webfont (Google Fonts / Adobe kit), lazy-loaded
  //  · svg  → no embeddable webfont, but a committed static specimen exists
  //           (public/compare/<slug>.svg, rendered locally from ref/*.otf)
  //  · neither → grayed/disabled control; specimen stays Cal Sans resembling it
  const svgPath = join(__dirname, '..', 'public', 'compare', `${p.slug}.svg`)
  if (p.compare) {
    boot.compare = fontHref
      ? { ...p.compare, css: fontHref }
      : existsSync(svgPath)
        ? { ...p.compare, svg: `${BASE}/compare/${p.slug}.svg` }
        : p.compare
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(p.title)}</title>
<meta name="description" content="${esc(p.description)}">
<link rel="canonical" href="${url}">
<meta name="robots" content="index, follow, max-image-preview:large">
<meta name="keywords" content="${esc(keywords)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(p.title)}">
<meta property="og:description" content="${esc(p.description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${ogImage}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:type" content="image/jpeg">
<meta property="og:image:alt" content="${esc(ogAlt)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(p.title)}">
<meta name="twitter:description" content="${esc(p.description)}">
<meta name="twitter:image" content="${ogImage}">
<meta name="twitter:image:alt" content="${esc(ogAlt)}">
<link rel="icon" type="image/svg+xml" href="${BASE}/favicon.svg">
<link rel="preload" href="${BASE}/fonts/CalSansVF.ttf" as="font" type="font/ttf" crossorigin>
<script type="application/ld+json">${JSON.stringify(jsonld)}</script>
<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=${GA_ID}"></script>
<script>
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA_ID}');
</script>
<!-- Boot the app frozen into this page's preset (initial state only — fully editable) -->
<script>window.__RECAL_BOOT = ${JSON.stringify(boot)};</script>
${appScript}
${appCss}
<style>
  /* The app owns the first viewport; reserve it pre-mount so the article never jumps. */
  #root { min-height: 100vh; }
  /* Article styles — everything scoped under .seo-below so nothing leaks into the app. */
  .seo-below { --sbg:#0f0f0f; --sfg:#e8e8e8; --smut:#999; --sline:#333;
    background:var(--sbg); color:var(--sfg); font-family:'CalSansSEO',system-ui,sans-serif;
    font-variation-settings:'GEOM' 25; line-height:1.5; -webkit-font-smoothing:antialiased; }
  @font-face { font-family:'CalSansSEO'; src:url('${BASE}/fonts/CalSansVF.ttf') format('truetype'); font-display:swap; }
  .seo-below .wrap { max-width:760px; margin:0 auto; padding:72px 24px 96px; box-sizing:border-box; }
  /* The letterbox closes the page: full bleed, and the document ends on its last row.
     --lb-bleed grows the canvas upward so repelled glyphs are not cut off, and the same
     amount comes back out of the layout so it costs no space. */
  /* NOTHING CLIPS. The glyphs are supposed to be able to leave the box -- that is the
     whole effect -- so there is no overflow:hidden here, and its absence is deliberate.
     The bleed grows the canvas upward and the negative margin takes the space back, so
     escaping glyphs have somewhere to go without costing layout height. */
  .seo-lb { --lb-bleed:180px; background:var(--sbg); }
  .seo-lb canvas { display:block; margin:calc(-1 * var(--lb-bleed)) auto 0; }
  .seo-below .live-note { font-size:13px; color:var(--smut); margin-bottom:40px; }
  .seo-below .live-note a { color:var(--sfg); }
  .seo-below nav.crumb { font-size:13px; color:var(--smut); margin-bottom:40px; }
  .seo-below nav.crumb a { color:var(--smut); text-decoration:none; }
  .seo-below nav.crumb a:hover { color:var(--sfg); }
  .seo-below h1 { font-size:clamp(30px,5vw,46px); line-height:1.1; letter-spacing:-.01em; margin:0 0 28px; }
  /* DISPLAY WEARS THE PRESET, PROSE STAYS IN THE UI ZONE. The headline and the section
     heads are set in this referent's axes -- Neutraface's YTAS, Futura's GEOM 100, and
     so on down the eight -- so the page speaks in the voice it is arguing for, while the
     body copy stays at GEOM 25 where a FAQ is comfortable to read.
     opsz is dropped from the pinned set: it belongs to the specimen's single size, and a
     46px headline should get its own optical treatment rather than the specimen's. */
  /* Display type in this referent's voice. wght is deliberately NOT pinned: an h1 is
     bold from the UA sheet, and a variable face holds that bold alongside the preset's
     other axes -- no preset states a weight, so nothing here should either.
     Emitted raw: font-variation-settings takes 'TAG' n pairs, and wrapping the list in
     another pair of quotes makes it one invalid string that the browser drops -- which
     is what silently left these headings inheriting GEOM 25 and nothing else. */
  .seo-below h1, .seo-below h2 { font-variation-settings:${p.axes.split(', ').filter(a => !a.startsWith("'opsz'")).join(', ') || "'GEOM' 25"}; font-optical-sizing:auto;${ff(p.preset) ? ` font-feature-settings:${ff(p.preset)};` : ''} }
  /* The specimen grid is the preset in use, so it takes the freezes as well as the axes.
     Each row adds this preset's own 'wght'/'ital' on top of p.axes -- wght is never in
     p.axes itself (see the h1/h2 rule above for why). opsz is dropped from the pinned
     set for the same reason it's dropped from h1/h2: these rows render at their own
     display size, not the preset's specimen size, so they get their own optical
     treatment (auto) instead of inheriting a pinned opsz meant for a different size. */
.card-fig{margin:26px 0 32px;max-width:820px}
.card-fig img{width:100%;height:auto;display:block;border-radius:10px;border:1px solid #262626}
  .seo-below .specimen-grid { margin:28px 0 48px; }
  /* THE SPECIMEN SHOWS THE PRESET, OPTICAL SIZE INCLUDED. opsz used to be stripped from
     these rows in favour of font-optical-sizing:auto, which at 58px resolved to opsz ~58 --
     so /gotham/ captioned itself "opsz 10" above a specimen rendering at nothing of the
     kind, and every page's specimen was a preset the preset does not describe.
     A small opsz shown large is a deliberate peak target, not a bug: plenty of families
     freeze one drawing and let the designer track in by hand at display size. That is what
     the -.03em is -- the manual correction the pinned opsz asks for -- and the caption
     states both so the reader knows this is a choice. font-optical-sizing:none stops the UA
     from re-deriving opsz from font-size and overriding the pin. */
  .seo-below .specimen-row {${ff(p.preset) ? ` font-feature-settings:${ff(p.preset)};` : ''}
    /* TRACKING FOLLOWS THE PIN, NOT THE ROW. -.03em is the manual correction a SMALL pinned
       opsz asks for when it is shown at display size. Inter and Neutra pin nothing, so their
       rows ride font-optical-sizing:auto -- which clamps to the axis maximum of 45, already
       the tightest-fitting end of the design. Tracking those in another 3% tightened what
       was tight to begin with. Auto rows get no correction; the font is doing the work. */
    font-size:clamp(32px,6.4vw,58px); line-height:1.15; font-style:normal;
    letter-spacing:${p.axes.includes("'opsz'") ? '-.03em' : 'normal'};
    font-optical-sizing:${p.axes.includes("'opsz'") ? 'none' : 'auto'}; padding:18px 0; border-bottom:1px solid var(--sline); }
  .seo-below .specimen-row:first-child { padding-top:0; }
  .seo-below .specimen-row .style-cap { display:block; font-size:13px; color:var(--smut);
    /* letter-spacing does NOT re-relativize on inherit -- it's the parent's resolved px
       value (-.01em of the ~40-58px specimen) that would otherwise land here verbatim,
       reading as roughly -3% tracking on 13px text. Reset it for this element's own size. */
    letter-spacing:normal;
    font-variation-settings:'GEOM' 25, 'wght' 400, 'ital' 0; font-style:normal; margin-bottom:6px; }
  .seo-below .specimen-cap { font-size:12px; color:var(--smut); letter-spacing:.04em; text-transform:uppercase; margin-bottom:48px; }
  .seo-below p { font-size:17px; color:#ccc; margin:0 0 20px; }
  .seo-below h2 { font-size:22px; margin:48px 0 16px; }
  .seo-below .cta { display:inline-block; margin:12px 0 8px; padding:14px 26px; background:var(--sfg); color:var(--sbg);
    text-decoration:none; border-radius:8px; font-size:16px; font-weight:600; }
  .seo-below .faq dt { font-weight:600; margin-top:22px; }
  .seo-below .faq dd { margin:6px 0 0; color:#ccc; }
  .seo-below .also { display:flex; flex-wrap:wrap; gap:10px; margin-top:14px; }
  .seo-below .also a { font-size:14px; color:var(--sfg); border:1px solid var(--sline); border-radius:999px; padding:6px 14px; text-decoration:none; }
  .seo-below .also a:hover { border-color:var(--sfg); }
  .seo-below ul.freezes { list-style:none; margin:0 0 20px; padding:0; }
  .seo-below ul.freezes li { font-size:16px; color:#ccc; padding:7px 0; border-bottom:1px solid var(--sline); }
  .seo-below ul.freezes code { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:14px; color:var(--sfg); }
  .seo-below footer { margin-top:72px; padding-top:24px; border-top:1px solid var(--sline); font-size:13px; color:var(--smut); }
  .seo-below footer a { color:var(--smut); }
</style>
</head>
<body>
<div id="root"></div>
<article class="seo-below" id="about">
<div class="wrap">
  <div class="live-note">▲ Live above, already set to ${esc(p.referent)}. <a href="#top" onclick="scrollTo({top:0,behavior:'smooth'});return false">Back to the tool</a></div>
  <nav class="crumb"><a href="${ORIGIN}/">WORDMARK</a> › <a href="${BASE}/">ReCal Sans</a> › ${esc(p.referent)} alternative</nav>

  <h1>${esc(p.h1)}</h1>


  <!-- The card as a real <img>, not only an og:image: Image search indexes what is IN the
       document, and an og tag is a share preview, not a ranked image. Explicit width/height
       so it reserves its box instead of shifting the text under it.
       THE JPG IS BAKED, SO IT GOES STALE SILENTLY. It is rendered by scripts/render-og-cards.mjs,
       which npm run build does NOT call -- re-run it whenever a preset's axes or freezes change,
       and commit public/og/*.jpg with them. -->
  <figure class="card-fig">
    <img src="${ogImage}" width="1200" height="630" fetchpriority="high" decoding="async"
         alt="${esc(ogAlt)}">
  </figure>

  <div class="specimen-grid" aria-label="ReCal Sans specimen, all weights and italics, tuned toward ${esc(p.referent)}">
    ${(() => {
      // THE CAPS ARE STYLE NAMES, NOTHING MORE. They used to read "ReCal Sans Bold
      // Italic, reconfigured and inspired by <referent> Bold Italic" on all eight rows --
      // 80 words identical on every page once the name is swapped, and 8 of the ~20
      // mentions of the referent on it. The comparison is made ONCE, in the caption below
      // the grid and in the grid's aria-label; repeating it per row bought no meaning and
      // read as keyword stuffing. Keep this comment on THIS side of the template literal:
      // written into the emitted HTML it shipped the removed string to all eight pages.
      // opsz stays in. It is part of the preset, and dropping it was what made the
      // specimen disagree with its own caption.
      const rowAxes = p.axes.split(', ').filter(Boolean).join(', ')
      return STYLES.map((s, i) => `<div class="specimen-row" style="font-variation-settings:${JSON.stringify(`${rowAxes ? rowAxes + ', ' : ''}'wght' ${s.wght}, 'ital' ${s.ital}`).slice(1, -1)}"><span class="style-cap">${esc(s.label)}</span>${esc(p.words[i])}</div>`).join('\n    ')
    })()}
  </div>
  <!-- The caption carries the settings the specimen is actually rendered at, tracking
       included. The pinned opsz is a small drawing shown large on purpose; saying so is
       what separates a peak target from a mistake. -->
  <div class="specimen-cap">ReCal Sans — all 8 weights &amp; italics, tuned toward ${esc(p.referent)} · ${esc(readableAxes)}${p.axes.includes("'opsz'") ? ' &middot; tracking &minus;0.03em' : ' &middot; optical sizing auto'}</div>

  ${p.body.map(par => `<p>${esc(par)}</p>`).join('\n  ')}

  <a class="cta" href="#top" onclick="scrollTo({top:0,behavior:'smooth'});return false">Customize it above ↑</a>

  <!-- THE FOUR SECTIONS BELOW ARE WHY THESE PAGES ARE NOT EACH OTHER. Everything above
       argues for ReCal Sans in general; this is the part that only makes sense on THIS
       page -- the giveaway glyph, the place ReCal Sans honestly loses, a measured x-height
       figure, and what the frozen optical size actually encodes. Written from the type
       designer's own notes. If a future preset ships without them it ships as a duplicate. -->
  <h2>The tell: what gives ${esc(p.referent)} away</h2>
  <p>${esc(p.tell)}</p>

  <h2>Where ReCal Sans loses</h2>
  <p>${esc(p.loses)}</p>

  <h2>Will it drop into a ${esc(p.referent)} layout?</h2>
  <p>${esc(p.swapNote ?? `Close stylistically, not a drop-in: the copyfit differs. WORDMARK builds metrically compatible versions on request — mark@wordmark.nyc.`)}</p>
  <p>${esc(p.xheight)} Measured on the cap-height-normalized comparison, ${esc(p.xhPct)}.</p>

${(() => {
    const g = GLYPHS[p.preset]
    if (!g) return ''
    // The labels are the font's own, read from CalSansVF's name table -- not a map kept
    // in this repo, of which there are two and they disagree.
    const items = g.sets.map(t => `<li><code>${t}</code> — ${esc(FEATURE_LABELS[t] ?? t)}</li>`).join('\n      ')
    return `
  <h2>What this preset freezes</h2>
  <p>Baked into the font you download, named as CalSansVF declares them:</p>
  <ul class="freezes">
      ${items}
  </ul>`
  })()}

  <h2>Frequently asked</h2>
  <dl class="faq">
    ${faq.map(f => `<dt>${esc(f.q)}</dt><dd>${esc(f.a)}</dd>`).join('\n    ')}
  </dl>

  <h2>More alternatives</h2>
  <div class="also">
    ${others.map(o => `<a href="${BASE}/${o.slug}/">${esc(o.referent)} alternative</a>`).join('\n    ')}
    <a href="${BASE}/">Open the customizer</a>
  </div>

  <footer>
    ReCal Sans is built on Cal Sans and produced by <a href="${ORIGIN}/">WORDMARK</a>. Free under the SIL Open Font License.
  </footer>
</div>
</article>
<div class="seo-lb"><canvas id="lb-footer" aria-label="ReCal Sans"></canvas></div>
<script type="module">
  import { createLetterbox } from '${BASE}/letterbox.js'
  // The closer is WORDMARK's, not this page's: the studio signs the page, so it is the
  // house wordmark in plain Cal Sans on every one of the eight. Nothing here varies per
  // referent -- the specimen above already argues that case.
  const lb = createLetterbox(document.getElementById('lb-footer'), {
    words: ['WORDMARK'],
    largeFontFamily: "'CalSansSEO', system-ui, sans-serif",
    fillFontFamily:  "'CalSansSEO', system-ui, sans-serif",
    fillSize: 10, widthFraction: 0.98, minFillSize: 6, bleedTop: 180,
    ink: '#e8e8e8',
    signal: 'color(display-p3 0.9333 1 0.2549)',
    colorSpace: 'display-p3',
    speckle: { share: 1 / 6, groups: 5 },
  })
  if (lb) document.fonts?.ready.then(lb.init) ?? lb.init()
</script>
</body>
</html>
`
}

let n = 0
for (const p of SEO_PRESETS) {
  const dir = join(OUT, p.slug)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'index.html'), page(p, SEO_PRESETS))
  n++
}

// Section sitemap — served at wordmark.nyc/recalsans/sitemap.xml, listing the app +
// every landing page. Kept in sync with the generator, indexed by the root sitemap.
// Each landing URL declares its card with <image:image>. A page can be crawled without
// its images ever being picked up; this is what tells Google the image exists, what it
// shows, and that it belongs to this page.
const entries = [
  { loc: `${ORIGIN}${BASE}/`, img: null },
  ...SEO_PRESETS.map(p => ({
    loc: `${ORIGIN}${BASE}/${p.slug}/`,
    img: {
      loc: `${ORIGIN}${BASE}/og/${p.slug}.jpg`,
      title: `${p.referent} alternative — ReCal Sans`,
      caption: `The word ${p.referent} set in ReCal Sans, a free open-source variable alternative to ${p.referent}.`,
    },
  })),
]
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${entries.map(e => `  <url><loc>${e.loc}</loc><changefreq>monthly</changefreq>` + (e.img
    ? `\n    <image:image><image:loc>${e.img.loc}</image:loc>`
      + `<image:title>${esc(e.img.title)}</image:title>`
      + `<image:caption>${esc(e.img.caption)}</image:caption></image:image>\n  `
    : '') + `</url>`).join('\n')}
</urlset>
`
writeFileSync(join(OUT, 'sitemap.xml'), sitemap)
console.log(`[seo] generated ${n} fused landing pages + sitemap: ${SEO_PRESETS.map(p => '/' + p.slug + '/').join(' ')}`)
