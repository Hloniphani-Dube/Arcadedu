import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  applySession,
  clamp01,
  nextMastery,
  observedQuality,
  rollQualityAvg,
  seedMastery,
} from './mastery.ts'
import { closeTo } from './testkit.ts'
import type { GradedItem } from './types.ts'

const item = (correct: boolean, quality: number): GradedItem => ({ correct, quality })

describe('observedQuality', () => {
  it('passes quality straight through for a correct answer', () => {
    closeTo(observedQuality(item(true, 0.82)), 0.82)
  })
  it('discounts a wrong answer to 40% of its quality', () => {
    closeTo(observedQuality(item(false, 0.5)), 0.2)
  })
  it('clamps out-of-range quality', () => {
    assert.equal(observedQuality(item(true, 1.7)), 1)
    assert.equal(observedQuality(item(true, -0.3)), 0)
  })
})

describe('nextMastery (single EWMA step, alpha 0.4)', () => {
  it('correct + high quality moves mastery up', () => {
    closeTo(nextMastery(0.5, item(true, 0.9)), 0.66)
  })
  it('correct + low quality barely moves, can dip', () => {
    closeTo(nextMastery(0.5, item(true, 0.3)), 0.42)
  })
  it('wrong answer pulls mastery down', () => {
    closeTo(nextMastery(0.5, item(false, 0.6)), 0.396)
  })
  it('stays in [0,1] near the boundaries', () => {
    assert.equal(nextMastery(0, item(false, 0)), 0)
    assert.equal(nextMastery(1, item(true, 1)), 1)
    assert.ok(nextMastery(0.98, item(true, 1)) <= 1)
  })
})

describe('applySession', () => {
  it('folds every item and reports session aggregates', () => {
    const r = applySession(0.4, [item(true, 0.8), item(true, 0.9)], 0)
    closeTo(r.mastery_before, 0.4)
    closeTo(r.mastery_after, 0.696)
    assert.equal(r.correct, 2)
    assert.equal(r.items, 2)
    closeTo(r.quality_avg, 0.85)
    assert.equal(r.flat, false)
    assert.equal(r.consecutive_flat_sessions, 0)
  })

  it('flags a flat session and increments the streak', () => {
    const r = applySession(0.45, [item(true, 0.47), item(false, 0.5)], 1)
    assert.ok(r.mastery_after - r.mastery_before < 0.03)
    assert.ok(r.mastery_after < 0.75)
    assert.equal(r.flat, true)
    assert.equal(r.consecutive_flat_sessions, 2)
  })

  it('a small delta at/above target is NOT flat and resets the streak', () => {
    const r = applySession(0.8, [item(true, 0.8)], 3)
    assert.ok(r.mastery_after - r.mastery_before < 0.03)
    assert.ok(r.mastery_after >= 0.75)
    assert.equal(r.flat, false)
    assert.equal(r.consecutive_flat_sessions, 0)
  })

  it('a real gain resets a running flat streak', () => {
    const r = applySession(0.3, [item(true, 0.95), item(true, 0.95)], 2)
    assert.ok(r.mastery_after - r.mastery_before >= 0.03)
    assert.equal(r.flat, false)
    assert.equal(r.consecutive_flat_sessions, 0)
  })
})

describe('seedMastery (diagnostic)', () => {
  it('two strong items from zero land in a sensible band', () => {
    closeTo(seedMastery([item(true, 0.9), item(true, 0.8)]), 0.536)
  })
  it('two wrong items from zero stay very low', () => {
    assert.ok(seedMastery([item(false, 0.5), item(false, 0.5)]) < 0.15)
  })
})

describe('rollQualityAvg', () => {
  it('is the running mean weighted by item counts', () => {
    closeTo(rollQualityAvg(0.6, 4, 0.8, 4), 0.7)
  })
  it('handles the first-ever session', () => {
    closeTo(rollQualityAvg(0, 0, 0.75, 4), 0.75)
  })
})

describe('clamp01', () => {
  it('treats every non-finite input as 0', () => {
    assert.equal(clamp01(NaN), 0)
    assert.equal(clamp01(Infinity), 0)
    assert.equal(clamp01(-Infinity), 0)
  })
})
