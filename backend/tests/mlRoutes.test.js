import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import request from 'supertest'
import { setTestEnv, startDb, stopDb, clearDb, userCookie, adminCookie } from './helpers.js'

vi.mock('../services/mlRecommendationEngine.js', () => ({
  default: {
    getRecommendations: vi.fn(async () => ({ products: [], strategy: 'hybrid' })),
  },
}))

setTestEnv()
const { default: app } = await import('../app.js')
const { default: User } = await import('../model/userModel.js')
const { default: Engine } = await import('../services/mlRecommendationEngine.js')

let alice, bob

beforeAll(startDb)
afterAll(stopDb)
beforeEach(async () => {
  await clearDb()
  Engine.getRecommendations.mockClear()
  alice = await User.create({ name: 'A', email: 'a@test.com', password: 'x' })
  bob = await User.create({ name: 'B', email: 'b@test.com', password: 'x' })
})

describe('ML / recommendation routes require auth', () => {
  const protectedPosts = [
    '/api/ml/recommendations', '/api/ml/rating-based', '/api/ml/review-based',
    '/api/ml/track/view', '/api/ml/track/search', '/api/ml/track/add-to-cart',
    '/api/ml/track/purchase', '/api/ml/track/recommendation-click',
    '/api/ml/track/time-on-page', '/api/ml/track/session-start',
    '/api/recommendations/recommendations', '/api/recommendations/track-view',
    '/api/recommendations/track-purchase', '/api/recommendations/user-preferences',
  ]

  it.each(protectedPosts)('POST %s -> 401 without a token', async (path) => {
    await request(app).post(path).send({ userId: alice._id.toString() }).expect(401)
  })

  it('analytics routes require auth', async () => {
    await request(app).get(`/api/ml/analytics/user/${alice._id}`).expect(401)
    await request(app).get('/api/ml/analytics/product/abc').expect(401)
    await request(app).get('/api/ml/analytics/overview').expect(401)
  })

  it('public read-only routes stay public', async () => {
    await request(app).get('/api/ml/strategies').expect(200)
  })
})

describe('IDOR protection', () => {
  it('uses the authenticated user, ignoring a spoofed body userId', async () => {
    await request(app)
      .post('/api/ml/recommendations')
      .set('Cookie', userCookie(alice._id))
      .send({ userId: bob._id.toString() })
      .expect(200)
    expect(Engine.getRecommendations.mock.calls[0][0]).toBe(alice._id.toString())
  })

  it("forbids reading another user's analytics", async () => {
    await request(app).get(`/api/ml/analytics/user/${bob._id}`).set('Cookie', userCookie(alice._id)).expect(403)
    await request(app).get(`/api/ml/analytics/user/${alice._id}`).set('Cookie', userCookie(alice._id)).expect(200)
  })
})

describe('admin-only ML routes', () => {
  it('rejects customers (403) and accepts the admin', async () => {
    const c = userCookie(alice._id)
    await request(app).post('/api/ml/cache/clear').set('Cookie', c).send({ all: true }).expect(403)
    await request(app).post('/api/ml/recompute').set('Cookie', c).send({ userId: bob._id.toString() }).expect(403)
    await request(app).get('/api/ml/analytics/overview').set('Cookie', c).expect(403)
    await request(app).post('/api/ml/cache/clear').set('Cookie', adminCookie()).send({ all: true }).expect(200)
  })

  it('cache/clear with an empty body does not wipe the whole cache', async () => {
    await request(app).post('/api/ml/cache/clear').set('Cookie', adminCookie()).send({}).expect(400)
  })
})
