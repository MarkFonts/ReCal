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
import { SEO_PRESETS, ADOBE_KIT } from './seo-presets.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = join(__dirname, '..', 'dist')
const ORIGIN = 'https://wordmark.nyc'
const BASE = '/recalsans'
const GA_ID = 'G-MZ4M1P8P1P'
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// The fused pages load the same hashed bundle as the app root — extract the tags
// vite wrote into dist/index.html (this script runs after `vite build`).
const appHtml = readFileSync(join(OUT, 'index.html'), 'utf8')
const appScript = appHtml.match(/<script type="module"[^>]*><\/script>/)?.[0]
const appCss = appHtml.match(/<link rel="stylesheet"[^>]*>/)?.[0]
if (!appScript || !appCss) throw new Error('[seo] could not find app asset tags in dist/index.html')

const SPECIMEN = '2160 just Groovy, I’ll Magic'   // exercises I l a g G j y t + figures

function page(p, all) {
  const url = `${ORIGIN}${BASE}/${p.slug}/`
  const others = all.filter(x => x.slug !== p.slug)
  const paid = p.kind === 'paid'

  const faq = [
    paid
      ? {
          q: `Is there a free alternative to ${p.referent}?`,
          a: `Yes. ReCal Sans is free and open-source (SIL Open Font License). It is a variable font you tune in the browser — set the geometric, weight, optical-size and ascender axes to taste — then download a static TTF. No account, no cost, no license fee.`,
        }
      : {
          q: `${p.referent} is already free — why use ReCal Sans instead?`,
          a: `Because of control, not cost. ${p.referent} ships fixed; ReCal Sans is variable and customizable — a GEOM axis from accessibility-optimized to geometric forms, a real optical-size axis, and adjustable ascender height. You set the defaults in the browser and download a font with those decisions baked in.`,
        },
    {
      q: `How is ReCal Sans different from ${p.referent}?`,
      a: `${p.referent} ships fixed. ReCal Sans is variable and customizable: a single GEOM axis moves letterforms from accessibility-optimized through clean UI to geometric display, and a real optical-size axis keeps the design honest across sizes. You bake your own settings into the exported font.`,
    },
    {
      q: `Can I use ReCal Sans commercially?`,
      a: `Yes — the SIL Open Font License permits commercial use, embedding, and modification. The font ReCal produces is yours to ship.`,
    },
  ]

  const jsonld = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: 'ReCal Sans customizer',
      applicationCategory: 'DesignApplication',
      operatingSystem: 'Web browser',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      url: `${ORIGIN}${BASE}/`,
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
<meta property="og:image" content="${ORIGIN}/thumb.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(p.title)}">
<meta name="twitter:description" content="${esc(p.description)}">
<meta name="twitter:image" content="${ORIGIN}/thumb.png">
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
  .seo-below .live-note { font-size:13px; color:var(--smut); margin-bottom:40px; }
  .seo-below .live-note a { color:var(--sfg); }
  .seo-below nav.crumb { font-size:13px; color:var(--smut); margin-bottom:40px; }
  .seo-below nav.crumb a { color:var(--smut); text-decoration:none; }
  .seo-below nav.crumb a:hover { color:var(--sfg); }
  .seo-below h1 { font-size:clamp(30px,5vw,46px); line-height:1.1; letter-spacing:-.01em; margin:0 0 28px; }
  .seo-below .specimen { font-size:clamp(48px,11vw,104px); line-height:1; letter-spacing:-.02em; margin:28px 0 8px;
    font-variation-settings:${JSON.stringify(p.axes).slice(1, -1)}; font-optical-sizing:${p.opticalSizing ? 'auto' : 'none'}; }
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
  .seo-below footer { margin-top:72px; padding-top:24px; border-top:1px solid var(--sline); font-size:13px; color:var(--smut); }
  .seo-below footer a { color:var(--smut); }
</style>
</head>
<body>
<div id="root"></div>
<article class="seo-below" id="about">
<div class="wrap">
  <div class="live-note">▲ The customizer above is live — it loaded with the ${esc(p.referent)} preset already applied. <a href="#top" onclick="scrollTo({top:0,behavior:'smooth'});return false">Back to the tool</a></div>
  <nav class="crumb"><a href="${ORIGIN}/">WORDMARK</a> › <a href="${BASE}/">ReCal Sans</a> › ${esc(p.referent)} alternative</nav>

  <h1>${esc(p.h1)}</h1>
  <div class="specimen" aria-label="ReCal Sans specimen">${esc(SPECIMEN)}</div>
  <div class="specimen-cap">ReCal Sans — live specimen, tuned toward ${esc(p.referent)}</div>

  ${p.body.map(par => `<p>${esc(par)}</p>`).join('\n  ')}

  <a class="cta" href="#top" onclick="scrollTo({top:0,behavior:'smooth'});return false">Customize it above ↑</a>

  <h2>How it compares to ${esc(p.referent)}</h2>
  <p>ReCal Sans doesn't imitate ${esc(p.referent)} — it gives you the axes to land in the same neighborhood and then keep going, honestly${paid ? ' and for free' : ''}. What you preview is what you download: a static, deployable TTF with your decisions baked in.</p>

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
const urls = [
  `${ORIGIN}${BASE}/`,
  ...SEO_PRESETS.map(p => `${ORIGIN}${BASE}/${p.slug}/`),
]
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${u}</loc><changefreq>monthly</changefreq></url>`).join('\n')}
</urlset>
`
writeFileSync(join(OUT, 'sitemap.xml'), sitemap)
console.log(`[seo] generated ${n} fused landing pages + sitemap: ${SEO_PRESETS.map(p => '/' + p.slug + '/').join(' ')}`)
