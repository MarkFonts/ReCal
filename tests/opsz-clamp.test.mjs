// node --test tests/  (render.ts only has type imports, so Node strips it bare)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { opszCss, opszPreviewForSize } from '../src/instrument/render.ts'

const d = (m = 1) => ({ freezeOpsz: false, frozenOpszValue: null, opszMultiplier: m })

test('stock limits leave opsz to font-optical-sizing: auto', () => {
  const r = opszCss(d(), true, 14, null, { sizePx: 100, limits: [8, 45] })
  assert.equal(r.optical, 'auto')
  assert.equal(r.renderOpts.skipOpsz, true)
})

test('a narrow clamp resolves opsz per size, in stock units', () => {
  const lim = [10, 20]
  assert.equal(opszCss(d(), true, 14, null, { sizePx: 100, limits: lim }).renderOpts.opszOverride, 20)
  assert.equal(opszCss(d(), true, 14, null, { sizePx: 4, limits: lim }).renderOpts.opszOverride, 10)
  assert.equal(opszCss(d(), true, 14, null, { sizePx: 15, limits: lim }).renderOpts.opszOverride, 15)
  assert.equal(opszCss(d(2), true, 14, null, { sizePx: 100, limits: lim }).renderOpts.opszOverride, 20)
  assert.equal(opszCss(d(2), true, 14, null, { sizePx: 30, limits: lim }).renderOpts.opszOverride, 15)
  assert.equal(opszCss(d(), true, 14, null, { sizePx: 100, limits: lim }).optical, 'none')
})

test('no size known: stay on auto; Try value is held inside the clamp', () => {
  assert.equal(opszCss(d(), true, 14, null, { limits: [10, 20] }).optical, 'auto')
  assert.equal(opszCss(d(), true, 14, 40, { limits: [10, 20] }).renderOpts.opszOverride, 20)
  assert.equal(opszPreviewForSize(30, 1.5, [8, 45]), 20)
})

test('the Optical scale is CSS arithmetic: px / m in stock units, no auto', () => {
  const r = opszCss(d(2), true, 14, null, { sizePx: 32, limits: [8, 45] })
  assert.equal(r.optical, 'none')
  assert.equal(r.renderOpts.opszOverride, 16)
  assert.equal(opszCss(d(6), true, 14, null, { sizePx: 16, limits: [8, 45] }).renderOpts.opszOverride, 8)
  assert.equal(opszCss(d(0.625), true, 14, null, { sizePx: 20, limits: [8, 45] }).renderOpts.opszOverride, 32)
  // Try dial values come in export units (stock x m)
  assert.equal(opszCss(d(2), true, 14, 60, { sizePx: 32, limits: [8, 45] }).renderOpts.opszOverride, 30)
  // 1x full range stays on auto
  assert.equal(opszCss(d(1), true, 14, null, { sizePx: 32, limits: [8, 45] }).optical, 'auto')
})
