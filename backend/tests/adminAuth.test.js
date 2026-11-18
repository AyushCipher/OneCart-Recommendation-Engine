import { describe, it, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { setTestEnv, startDb, stopDb, adminCookie, userCookie } from './helpers.js'

setTestEnv()
const { default: app } = await import('../app.js')
const { default: User } = await import('../model/userModel.js')

let user
beforeAll(async () => {
  await startDb()
  user = await User.create({ name: 'U', email: 'u@test.com', password: 'x' })
})
afterAll(stopDb)

describe('adminAuth', () => {
  it('rejects requests with no token (401)', async () => {
    await request(app).get('/api/user/getadmin').expect(401)
  })

  it('rejects a valid customer token (403)', async () => {
    await request(app).get('/api/user/getadmin').set('Cookie', userCookie(user._id)).expect(403)
  })

  it('rejects a token signed with the wrong secret (401)', async () => {
    const bad = jwt.sign({ email: process.env.ADMIN_EMAIL }, 'other-secret')
    await request(app).get('/api/user/getadmin').set('Cookie', [`token=${bad}`]).expect(401)
  })

  it('accepts the admin token', async () => {
    await request(app).get('/api/user/getadmin').set('Cookie', adminCookie()).expect(201)
  })

  it('fails closed when ADMIN_EMAIL is not configured', async () => {
    const saved = process.env.ADMIN_EMAIL
    delete process.env.ADMIN_EMAIL
    await request(app).get('/api/user/getadmin').set('Cookie', adminCookie()).expect(403)
    process.env.ADMIN_EMAIL = saved
  })

  it('protects product, order and coupon admin routes from customers', async () => {
    const c = userCookie(user._id)
    await request(app).post('/api/product/addproduct').set('Cookie', c).expect(403)
    await request(app).post('/api/order/list').set('Cookie', c).expect(403)
    await request(app).post('/api/order/status').set('Cookie', c).send({}).expect(403)
    await request(app).get('/api/coupon/list').set('Cookie', c).expect(403)
    await request(app).post('/api/coupon/create').set('Cookie', c).send({}).expect(403)
  })

  it('adminlogin issues a token that passes adminAuth', async () => {
    const res = await request(app)
      .post('/api/auth/adminlogin')
      .send({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD })
      .expect(200)
    const cookie = res.headers['set-cookie']
    await request(app).get('/api/coupon/list').set('Cookie', cookie).expect(200)
  })
})
