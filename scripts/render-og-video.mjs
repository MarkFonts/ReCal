#!/usr/bin/env node
/**
 * Render og/default.mp4 from og/default.video.source.html: step window.setT at 30 fps,
 * screenshot each frame, encode with ffmpeg (H.264, yuv420p, faststart).
 * Run: node scripts/render-og-video.mjs [frames-dir]
 */
import puppeteer from 'puppeteer'
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const SRC = resolve('./public/og/default.video.source.html')
const OUT = resolve('./public/og/default.mp4')
const FRAMES = resolve(process.argv[2] ?? './.og-frames')
const FPS = 30

mkdirSync(FRAMES, { recursive: true })
const browser = await puppeteer.launch({ args: ['--allow-file-access-from-files', '--force-device-scale-factor=1'] })
try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1200, height: 630 })
  await page.goto('file://' + SRC)
  await page.evaluateHandle(() => document.fonts.ready)
  await new Promise(r => setTimeout(r, 800))
  const dur = await page.evaluate(() => window.OG_DUR)
  const n = Math.round(dur * FPS)
  for (let i = 0; i < n; i++) {
    await page.evaluate(t => window.setT(t), i / FPS)
    await page.screenshot({ path: `${FRAMES}/f${String(i).padStart(4, '0')}.png` })
  }
  console.log(`${n} frames → ${FRAMES}`)
} finally {
  await browser.close()
}
// RGB → BT.709 limited-range YUV, and say so in the stream: untagged, players guess BT.601 and
// the zone colours drift (the Base blue went grey-blue, the A11y orange went brown).
execFileSync('ffmpeg', ['-y', '-framerate', String(FPS), '-i', `${FRAMES}/f%04d.png`,
  '-c:v', 'libx264', '-profile:v', 'high', '-level', '4.0',
  '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p',
  '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
  '-x264-params', 'colorprim=bt709:transfer=bt709:colormatrix=bt709',
  '-crf', '20', '-preset', 'slow', '-movflags', '+faststart', '-an', OUT], { stdio: 'inherit' })
console.log(`→ ${OUT}`)
