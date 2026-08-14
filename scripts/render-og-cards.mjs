#!/usr/bin/env node
/**
 * Render OG cards (1200×630) from cards.source.html using Puppeteer.
 * Run: npm install puppeteer && node scripts/render-og-cards.mjs
 */

import puppeteer from 'puppeteer'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const CARDS_HTML = resolve('./public/og/cards.source.html')
const OUT_DIR = resolve('./public/og')
const VIEWPORT = { width: 1200, height: 630 }

const SLUGS = ['poppins', 'inter', 'geist', 'futura', 'neutra', 'circular', 'gotham', 'gt-america']

async function renderCards() {
  const browser = await puppeteer.launch()
  const page = await browser.newPage()

  try {
    const html = readFileSync(CARDS_HTML, 'utf-8')
    await page.setViewport(VIEWPORT)
    await page.setContent(html)

    // Wait for fonts to load
    await page.evaluateHandle(() => document.fonts.ready)
    await new Promise(resolve => setTimeout(resolve, 800))

    // Render each card by hiding others and showing just one
    for (let idx = 0; idx < SLUGS.length; idx++) {
      const slug = SLUGS[idx]
      await page.evaluate((targetIdx) => {
        // Hide all cards except the one we want
        document.querySelectorAll('.card').forEach((card, i) => {
          card.style.display = i === targetIdx ? 'block' : 'none'
        })
      }, idx)

      const path = `${OUT_DIR}/${slug}.jpg`
      await page.screenshot({ path, type: 'jpeg', quality: 85 })
      console.log(`✓ ${slug}`)
    }
  } finally {
    await browser.close()
  }

  console.log('\nDone. Commit with:\n  git add public/og/*.jpg\n  git commit -m "regen OG cards with corrected preset axes"')
}

renderCards().catch(e => {
  console.error('Error:', e.message)
  process.exit(1)
})
