// Bundled by esbuild in `npm test` (the store pulls in JSX, which node cannot load bare).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createInitialState, reducer, type Action, type InstrumentState } from '../src/instrument/store'
import { applyUrlState, decodeDefaults, encodeDefaults, syncQuery } from '../src/instrument/urlState'

const play = (search: string, s: InstrumentState = createInitialState()) => {
  applyUrlState((a: Action) => { s = reducer(s, a) }, decodeDefaults(search))
  return s
}
const enc = (s: InstrumentState) => encodeDefaults(s.defaults, { shippedThresholds: s.shippedThresholds })

test('an untouched instrument serialises to the empty string', () => {
  assert.equal(enc(createInitialState()), '')
})

test('clamps, frozen axes, and subset options round-trip exactly', () => {
  const q = 'g=60&lw=450-650&lg=40-80&fz=o.y&sk=0&sc=all'
  const s = play(q)
  assert.deepEqual(s.defaults.limits.wght, [450, 650])
  assert.deepEqual(s.defaults.limits.GEOM, [40, 80])
  assert.deepEqual(s.defaults.frozenAxes, ['YTAS'])
  assert.equal(s.defaults.freezeOpsz, true)   // opsz freezes through its own flag
  assert.equal(s.defaults.subsetKeepFeatures, false)
  assert.equal(s.defaults.subsetCharset, 'all')
  const again = play(enc(s))
  assert.deepEqual(again.defaults, s.defaults)
  assert.equal(enc(again), enc(s))
})

test('a hostile link cannot leave the default outside its clamp', () => {
  const s = play('w=700&lw=450-550')
  assert.deepEqual(s.defaults.limits.wght, [450, 550])
  assert.equal(s.defaults.axes.wght, 550)
})

test('pre-2.020 links carry YTAS in font units and are halved', () => {
  assert.equal(decodeDefaults('y=1600').axes.YTAS, 800)
  assert.equal(decodeDefaults('y=760').axes.YTAS, 760)
})

test('bad clamps are dropped, not thrown', () => {
  const d = decodeDefaults('lw=650-450&lg=abc&ly=1400-1700&li=0-1&fz=i.q')
  assert.equal(d.limits?.wght, undefined)
  assert.equal(d.limits?.GEOM, undefined)
  assert.deepEqual(d.limits?.YTAS, [720, 800])   // legacy font-unit clamp, halved then clipped
  assert.equal(d.limits?.ital, undefined)
  assert.equal(d.frozenAxes, undefined)
})

test('frozen figure styles survive a reload alongside ss/cv', () => {
  const s = play('ff=cv02.ss16.tnum.zero.bogus.liga')
  assert.deepEqual([...s.defaults.frozenFeatures].sort(), ['cv02', 'ss16', 'tnum', 'zero'])
  assert.equal(enc(play(enc(s))), enc(s))
})

test('the legacy f key still freezes opsz', () => {
  const s = play('f=12')
  assert.equal(s.defaults.freezeOpsz, true)
  assert.equal(s.defaults.frozenOpszValue, 12)
})

test('syncQuery rewrites only the keys urlState owns', () => {
  // boot's preset, the ui switch and ?grid stay; the old clamp and axis go; the new state lands
  assert.equal(syncQuery('?preset=Poppins&lw=450-650&g=60&grid&ui=classic', 'w=500&fz=y'),
    '?preset=Poppins&grid=&ui=classic&w=500&fz=y')
  assert.equal(syncQuery('?g=60&lw=450-650', ''), '')          // back to stock: no query at all
  assert.equal(syncQuery('?scene=words', ''), '?scene=words')  // nothing of ours, nothing touched
})

test('a link replayed onto a preset that already froze its features keeps them frozen', () => {
  // the reload path: boot applies the preset (cv22 + ss16 frozen), then the address bar's ff= replays
  let s = createInitialState()
  for (const tag of ['cv22', 'ss16']) s = reducer(s, { type: 'toggleFrozenFeature', tag } as Action)
  s = play('ff=cv22.ss16', s)
  assert.deepEqual([...s.defaults.frozenFeatures].sort(), ['cv22', 'ss16'])
  assert.deepEqual([...play('ff=cv22.ss16').defaults.frozenFeatures].sort(), ['cv22', 'ss16'])   // and from stock
})
