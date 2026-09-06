import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  STRATEGY_PLAN,
  difficultyForStrategy,
  strategyStepIsLegal,
} from './strategy.ts'

describe('strategyStepIsLegal', () => {
  it('allows staying put or moving one rung', () => {
    assert.equal(strategyStepIsLegal('NORMAL', 'NORMAL'), true)
    assert.equal(strategyStepIsLegal('NORMAL', 'STRUGGLING'), true)
    assert.equal(strategyStepIsLegal('STRUGGLING', 'PERSISTENT'), true)
    assert.equal(strategyStepIsLegal('PERSISTENT', 'STRUGGLING'), true)
  })
  it('rejects a two-rung jump in either direction', () => {
    assert.equal(strategyStepIsLegal('NORMAL', 'PERSISTENT'), false)
    assert.equal(strategyStepIsLegal('PERSISTENT', 'NORMAL'), false)
  })
})

describe('difficultyForStrategy', () => {
  it('keeps the base tier at NORMAL', () => {
    assert.equal(difficultyForStrategy('medium', 'NORMAL'), 'medium')
  })
  it('drops one tier when scaffolding is on', () => {
    assert.equal(difficultyForStrategy('medium', 'STRUGGLING'), 'easy')
    assert.equal(difficultyForStrategy('medium', 'PERSISTENT'), 'easy')
  })
  it('floors at trivial', () => {
    assert.equal(difficultyForStrategy('trivial', 'PERSISTENT'), 'trivial')
  })
})

describe('STRATEGY_PLAN', () => {
  it('only PERSISTENT injects a prerequisite review', () => {
    assert.equal(STRATEGY_PLAN.NORMAL.insertPrerequisiteReview, false)
    assert.equal(STRATEGY_PLAN.STRUGGLING.insertPrerequisiteReview, false)
    assert.equal(STRATEGY_PLAN.PERSISTENT.insertPrerequisiteReview, true)
  })
  it('scaffolding grows with the level', () => {
    assert.equal(STRATEGY_PLAN.NORMAL.scaffold.length, 0)
    assert.ok(STRATEGY_PLAN.STRUGGLING.scaffold.length > 0)
    assert.ok(STRATEGY_PLAN.PERSISTENT.scaffold.includes('steps'))
  })
})
