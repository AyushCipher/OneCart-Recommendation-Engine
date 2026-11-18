import { describe, it, expect } from 'vitest'
import { precisionAtK, hitAtK, splitByUser, evaluate, popularityRecommender } from '../scripts/evalRecommender.js'

describe('eval metrics', () => {
  it('computes precision@k and hit@k', () => {
    expect(precisionAtK(['a', 'b', 'c', 'd'], ['b', 'd'], 4)).toBe(0.5)
    expect(hitAtK(['a', 'b'], ['z'], 2)).toBe(0)
    expect(hitAtK(['a', 'b'], ['b'], 2)).toBe(1)
  })

  it('holds out the most recent products per user', () => {
    const events = ['p1', 'p2', 'p3', 'p4', 'p5'].map((p, i) => ({ userId: 'u', productId: p, ts: i }))
    const [s] = splitByUser(events, { testFrac: 0.2, minProducts: 5 })
    expect(s.train).toEqual(['p1', 'p2', 'p3', 'p4'])
    expect(s.test).toEqual(['p5'])
  })

  it('evaluates a recommender on splits', () => {
    const splits = [{ userId: 'u', train: ['a'], test: ['b'] }, { userId: 'v', train: ['b'], test: ['c'] }]
    const r = evaluate(splits, popularityRecommender, 1)
    expect(r.users).toBe(2)
  })
})
