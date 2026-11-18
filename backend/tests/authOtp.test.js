import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import request from 'supertest'
import { setTestEnv, startDb, stopDb } from './helpers.js'

vi.mock('../config/Mail.js', () => ({ default: vi.fn().mockResolvedValue(undefined), sendContactMail: vi.fn() }))
vi.mock('../config/firebaseAdmin.js', () => ({
  isFirebaseConfigured: vi.fn(() => false),
  verifyFirebaseIdToken: vi.fn(),
}))

setTestEnv()
const { default: app } = await import('../app.js')
const { default: User } = await import('../model/userModel.js')
const firebase = await import('../config/firebaseAdmin.js')

const creds = { name: 'Ayush', email: 'a@test.com', password: 'Str0ng!Pass1' }
const token = 'x'.repeat(20)

beforeAll(startDb)
afterAll(stopDb)

describe('registration / login responses', () => {
  it('registers with isOtpVerifed=false and does not leak the password hash', async () => {
    const res = await request(app).post('/api/auth/register').send(creds).expect(201)
    expect(res.body.user.password).toBeUndefined()
    const stored = await User.findOne({ email: creds.email })
    expect(stored.isOtpVerifed).toBe(false)
  })

  it('login does not return the password hash', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: creds.email, password: creds.password }).expect(200)
    expect(res.body.user.password).toBeUndefined()
    expect(res.body.user.resetOtp).toBeUndefined()
  })

  it('rejects malformed input via zod (400)', async () => {
    await request(app).post('/api/auth/login').send({ email: 'not-an-email', password: 'x' }).expect(400)
  })
})

describe('OTP reset flow', () => {
  it('blocks reset-password for a freshly registered user (no OTP)', async () => {
    await request(app).post('/api/auth/reset-password').send({ email: creds.email, password: 'NewStr0ng!Pass' }).expect(403)
  })

  it('rejects a wrong OTP', async () => {
    await request(app).post('/api/auth/send-otp').send({ email: creds.email }).expect(200)
    await request(app).post('/api/auth/verify-otp').send({ email: creds.email, otp: '0000' }).expect(400)
    await request(app).post('/api/auth/reset-password').send({ email: creds.email, password: 'NewStr0ng!Pass' }).expect(403)
  })

  it('allows exactly one reset after a correct OTP', async () => {
    await request(app).post('/api/auth/send-otp').send({ email: creds.email }).expect(200)
    const { resetOtp } = await User.findOne({ email: creds.email }).select('+resetOtp')
    await request(app).post('/api/auth/verify-otp').send({ email: creds.email, otp: resetOtp }).expect(200)
    await request(app).post('/api/auth/reset-password').send({ email: creds.email, password: 'NewStr0ng!Pass' }).expect(200)
    // flag cleared: a second reset needs a new OTP
    await request(app).post('/api/auth/reset-password').send({ email: creds.email, password: 'Another!Pass1' }).expect(403)
  })

  it('rate limits reset-password', async () => {
    let last
    for (let i = 0; i < 7; i++) {
      last = await request(app).post('/api/auth/reset-password').send({ email: creds.email, password: 'Another!Pass1' })
    }
    expect(last.status).toBe(429)
  })
})

describe('google login', () => {
  it('fails closed when Firebase is not configured', async () => {
    await request(app).post('/api/auth/googlelogin').send({ idToken: token, email: 'victim@test.com' }).expect(503)
    expect(await User.findOne({ email: 'victim@test.com' })).toBeNull()
  })

  it('rejects an invalid ID token', async () => {
    firebase.isFirebaseConfigured.mockReturnValue(true)
    firebase.verifyFirebaseIdToken.mockRejectedValue(new Error('bad'))
    await request(app).post('/api/auth/googlelogin').send({ idToken: token, email: 'victim@test.com' }).expect(401)
  })

  it('uses the email from the verified token, not the body', async () => {
    firebase.isFirebaseConfigured.mockReturnValue(true)
    firebase.verifyFirebaseIdToken.mockResolvedValue({ email: 'real@test.com', email_verified: true, name: 'Real' })
    const res = await request(app).post('/api/auth/googlelogin').send({ idToken: token, email: 'victim@test.com' }).expect(200)
    expect(res.body.user.email).toBe('real@test.com')
    expect(await User.findOne({ email: 'victim@test.com' })).toBeNull()
  })
})
