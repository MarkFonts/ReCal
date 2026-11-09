// node --test tests/  (Node strips the types; the module has no JSX or store import)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeAxis, setLimit, slideLimits } from '../src/instrument/clampMath.ts'

const wght = { min: 400, max: 700 }

test('normalize orders, clips, and pulls the default inside', () => {
  assert.deepEqual(normalizeAxis(650, [600, 500], wght), { value: 600, limits: [500, 600] })
  assert.deepEqual(normalizeAxis(350, [300, 800], wght), { value: 400, limits: [400, 700] })
  assert.deepEqual(normalizeAxis(550, [550, 550], wght), { value: 550, limits: [550, 550] })
})

test('an edge drag pushes the default', () => {
  const lim = setLimit([400, 700], 'hi', 500)
  assert.deepEqual(lim, [400, 500])
  assert.equal(normalizeAxis(600, lim, wght).value, 500)
})

test('an edge cannot cross the other edge', () => {
  assert.deepEqual(setLimit([450, 650], 'lo', 690), [650, 650])
  assert.deepEqual(setLimit([450, 650], 'hi', 300), [450, 450])
})

test('a slide keeps the span and stops at the range', () => {
  assert.deepEqual(slideLimits([450, 550], 500, wght), [500, 600])
  assert.deepEqual(slideLimits([450, 550], 680, wght), [600, 700])
  assert.deepEqual(slideLimits([450, 550], 100, wght), [400, 500])
})
