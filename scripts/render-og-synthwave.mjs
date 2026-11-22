/**
 * Render /gta-art-deco/'s OG card from public/og/gta-art-deco.source.html: the one card that is
 * not in cards.source.html: the house card's text over a synthwave scene instead of the mesh. Writes
 * gta-art-deco.jpg (og:image) and gta-art-deco-light.jpg (the same art; the scene is dark by design).
 *   node scripts/render-og-synthwave.mjs
 */
import puppeteer from 'puppeteer'
import { readFileSync, copyFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SRC = resolve('./public/og/gta-art-deco.source.html')
const OUT = resolve('./public/og/gta-art-deco.jpg')
const font = readFileSync(resolve('./shared/fonts/CalSansVF.ttf')).toString('base64')
const html = readFileSync(SRC, 'utf-8').replace('__CALSANS__', `data:font/ttf;base64,${font}`)

// Installed Chrome, not puppeteer's bundled Chromium: CalSansVF 2.020 carries avar2, which the
// bundled build rejects at decode (NetworkError), and the card would bake a fallback serif.
const browser = await puppeteer.launch({ channel: 'chrome' })
try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1200, height: 630 })
  await page.setContent(html)
  // fonts.ready can settle before an unused face starts loading; ask for the exact cut first
  await page.evaluate(() => document.fonts.load("625 178px Cal"))
  await page.evaluateHandle(() => document.fonts.ready)
  const ok = await page.evaluate(() => document.fonts.check("625 178px Cal"))
  if (!ok) throw new Error('Cal Sans did not load; refusing to bake a fallback face into the card')
  await new Promise(r => setTimeout(r, 500))
  await page.screenshot({ path: OUT, type: 'jpeg', quality: 88 })
  copyFileSync(OUT, OUT.replace('.jpg', '-light.jpg'))
  console.log('✓ gta-art-deco (dark + light)')
} finally {
  await browser.close()
}
