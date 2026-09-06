// Tiny assertion helpers for the node:test suites in this folder.
import assert from 'node:assert/strict'

/** assert `actual` is within `eps` of `expected`. */
export function closeTo(actual: number, expected: number, eps = 1e-6): void {
  assert.ok(
    Math.abs(actual - expected) <= eps,
    `expected ${actual} to be within ${eps} of ${expected}`,
  )
}
