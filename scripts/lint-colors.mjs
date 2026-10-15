#!/usr/bin/env node
/* lint-colors -- a literal grey, white or light ink in a stylesheet is a dark-mode-only colour.
 *
 * ReCal has Auto / Light / Dark now, so a hard-coded #fff, #999, rgba(232,232,232,.4) or the word
 * `white` in src/ CSS stays what it is when the page goes light: invisible text, a dark panel on a
 * light ground. This fails the build on them. The fix is always the token: --text and its
 * rgba(var(--text-rgb), a) ramp, --bg / --surface / --surface-hi, --border, --accent, --signal-acid.
 *
 * Flagged (outside comments):
 *   - a grey hex (#rgb / #rrggbb with r = g = b, so #fff and #000 too);
 *   - the keywords white and black;
 *   - rgb()/rgba() whose three channels are equal and 128 or more (a light ink); rgba(0,0,0,a) shadows and
 *     scrims are a different thing and are not flagged.
 * Not flagged: a fallback inside var(--x, #333) (it never applies once the token exists).
 *
 * ALLOWLIST (explain each in one sentence):
 *   - src/instrument/tokens.css: where the palette itself is DEFINED -- the dark values and the light block.
 *   - src/instrument/holo.css: the holographic foil's rainbow ramp and its white core are the effect, not a theme color.
 *   - src/App.css: the classic UI (?ui=classic), kept for regression comparison. It is dark-only by design and is
 *     pinned to data-theme=dark in main.tsx; its one global rule, body, reads the tokens.
 *   - a line or the line above it carrying `color-lint: allow -- reason`.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ALLOW_FILES = new Set(['src/instrument/tokens.css', 'src/instrument/holo.css', 'src/App.css'])
const walk = d => readdirSync(d).flatMap(n => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : p.endsWith('.css') ? [p] : [] })
let bad = 0
for (const file of walk('src')) {
  if (ALLOW_FILES.has(file)) continue
  const lines = readFileSync(file, 'utf8').split('\n')
  let inComment = false
  lines.forEach((raw, i) => {
    // blank comments out, keeping columns (a comment can span lines)
    let line = ''
    for (let k = 0; k < raw.length; k++) {
      if (inComment) { if (raw[k] === '*' && raw[k + 1] === '/') { inComment = false; k++ } continue }
      if (raw[k] === '/' && raw[k + 1] === '*') { inComment = true; k++; continue }
      line += raw[k]
    }
    const allowed = /color-lint: allow/.test(raw) || /color-lint: allow/.test(lines[i - 1] ?? '')
    if (allowed) return
    // drop var(--x, <fallback>) fallbacks
    const code = line.replace(/var\(\s*--[\w-]+\s*,[^()]*(?:\([^()]*\)[^()]*)*\)/g, 'var()')
    const hits = []
    for (const m of code.matchAll(/#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g)) {
      const h = m[1].length === 3 ? m[1].split('').map(c => c + c).join('') : m[1]
      if (h.slice(0, 2) === h.slice(2, 4) && h.slice(2, 4) === h.slice(4, 6)) hits.push(m[0])
    }
    for (const m of code.matchAll(/(?<![\w-])(white|black)(?![\w-])/g)) hits.push(m[0])
    for (const m of code.matchAll(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/g)) {
      if (m[1] === m[2] && m[2] === m[3] && +m[1] >= 128) hits.push(m[0] + ')')
    }
    hits.forEach(h => { console.error(`${file}:${i + 1}  ${h}  ${raw.trim().slice(0, 110)}`); bad++ })
  })
}
if (bad) { console.error(`\nlint-colors: ${bad} hard-coded grey/white/light ink${bad === 1 ? '' : 's'}. Use the tokens (--text, rgba(var(--text-rgb), a), --bg, --surface, --border, --signal-acid), or add "color-lint: allow -- why".`); process.exit(1) }
console.log('lint-colors: ok')
