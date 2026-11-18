import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import request from 'supertest'
import crypto from 'crypto'
import { setTestEnv, startDb, stopDb, clearDb, userCookie, makeProduct } from './helpers.js'

vi.mock('razorpay', () => ({
  default: class {
    orders = { create: vi.fn(async (o) => ({ id: 'order_rzp_1', amount: o.amount, currency: o.currency, receipt: o.receipt })) }
  },
}))

setTestEnv()
const { default: app } = await import('../app.js')
const { default: User } = await import('../model/userModel.js')
const { default: Product } = await import('../model/productModel.js')
const { default: Order } = await import('../model/orderModel.js')
const { default: Coupon } = await import('../model/couponModel.js')
const { redeemCoupon } = await import('../services/couponService.js')

const address = { street: '1 Main St', city: 'X' }
let user, other, product

const sign = (orderId, paymentId) =>
  crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(`${orderId}|${paymentId}`).digest('hex')

const placeCod = (u, body) =>
  request(app).post('/api/order/placeorder').set('Cookie', userCookie(u._id)).send({ address, ...body })

beforeAll(startDb)
afterAll(stopDb)
beforeEach(async () => {
  await clearDb()
  user = await User.create({ name: 'U', email: 'u@test.com', password: 'x' })
  other = await User.create({ name: 'O', email: 'o@test.com', password: 'x' })
  product = await makeProduct(Product, { price: 500 })
})

describe('order totals', () => {
  it('recomputes the total from DB prices and ignores client-sent price/amount', async () => {
    const res = await placeCod(user, {
      amount: 1,
      items: [{ _id: product._id.toString(), quantity: 2, price: 1 }],
    }).expect(201)
    expect(res.body.amount).toBe(500 * 2 + 40)
    const order = await Order.findOne({ userId: user._id.toString() })
    expect(order.items[0].price).toBe(500)
  })

  it('rejects an empty cart and invalid quantity', async () => {
    await placeCod(user, { items: [] }).expect(400)
    await placeCod(user, { items: [{ _id: product._id.toString(), quantity: 0 }] }).expect(400)
  })

  it('rejects unknown products', async () => {
    await placeCod(user, { items: [{ _id: '64b7f0f0f0f0f0f0f0f0f0f0', quantity: 1 }] }).expect(404)
  })

  it('requires authentication', async () => {
    await request(app).post('/api/order/placeorder').send({ address, items: [] }).expect(401)
  })
})

describe('coupons', () => {
  const items = () => [{ _id: product._id.toString(), quantity: 2 }] // subtotal 1000 (+40 delivery)

  it('applies a percentage coupon capped by maxDiscountAmount', async () => {
    await Coupon.create({ code: 'SAVE20', discountType: 'percentage', discountValue: 20, maxDiscountAmount: 100 })
    const res = await placeCod(user, { items: items(), couponCode: 'save20' }).expect(201)
    expect(res.body.discount).toBe(100)
    expect(res.body.amount).toBe(1040 - 100)
  })

  it('never lets a flat discount push the total below zero', async () => {
    await Coupon.create({ code: 'BIG', discountType: 'flat', discountValue: 99999 })
    const res = await placeCod(user, { items: items(), couponCode: 'BIG' }).expect(201)
    expect(res.body.amount).toBe(0)
  })

  it('rejects expired, inactive, below-minimum and unknown coupons', async () => {
    await Coupon.create({ code: 'OLD', discountType: 'flat', discountValue: 10, expiresAt: new Date(Date.now() - 1000) })
    await Coupon.create({ code: 'OFF', discountType: 'flat', discountValue: 10, isActive: false })
    await Coupon.create({ code: 'MIN', discountType: 'flat', discountValue: 10, minOrderAmount: 100000 })
    for (const code of ['OLD', 'OFF', 'MIN', 'NOPE']) {
      await placeCod(user, { items: items(), couponCode: code }).expect(400)
    }
  })

  it('a user can redeem a coupon only once', async () => {
    await Coupon.create({ code: 'ONCE', discountType: 'flat', discountValue: 10 })
    await placeCod(user, { items: items(), couponCode: 'ONCE' }).expect(201)
    await placeCod(user, { items: items(), couponCode: 'ONCE' }).expect(400)
  })

  it('respects usageLimit', async () => {
    await Coupon.create({ code: 'ONE', discountType: 'flat', discountValue: 10, usageLimit: 1 })
    await placeCod(user, { items: items(), couponCode: 'ONE' }).expect(201)
    await placeCod(other, { items: items(), couponCode: 'ONE' }).expect(400)
  })

  it('redeemCoupon is atomic under concurrency (last use goes to exactly one caller)', async () => {
    const c = await Coupon.create({ code: 'RACE', discountType: 'flat', discountValue: 10, usageLimit: 1 })
    const results = await Promise.all([redeemCoupon(c._id, user._id), redeemCoupon(c._id, other._id)])
    expect(results.filter(Boolean)).toHaveLength(1)
    expect((await Coupon.findById(c._id)).usedCount).toBe(1)
  })

  it('redeemCoupon refuses the same user twice', async () => {
    const c = await Coupon.create({ code: 'TWICE', discountType: 'flat', discountValue: 10 })
    const results = await Promise.all([redeemCoupon(c._id, user._id), redeemCoupon(c._id, user._id)])
    expect(results.filter(Boolean)).toHaveLength(1)
  })
})

describe('razorpay flow', () => {
  const startRazorpay = () =>
    request(app)
      .post('/api/order/razorpay')
      .set('Cookie', userCookie(user._id))
      .send({ address, items: [{ _id: product._id.toString(), quantity: 1 }] })
      .expect(200)

  it('does not mark paid or track the purchase when the order is created', async () => {
    await startRazorpay()
    const order = await Order.findOne({ userId: user._id.toString() })
    expect(order.payment).toBe(false)
    expect(order.razorpayOrderId).toBe('order_rzp_1')
    const u = await User.findById(user._id)
    expect(u.purchasedProducts).toHaveLength(0)
  })

  it('rejects a bad signature', async () => {
    await startRazorpay()
    await request(app)
      .post('/api/order/verifyrazorpay')
      .set('Cookie', userCookie(user._id))
      .send({ razorpay_order_id: 'order_rzp_1', razorpay_payment_id: 'pay_1', razorpay_signature: 'deadbeef' })
      .expect(400)
    expect((await Order.findOne({ userId: user._id.toString() })).payment).toBe(false)
  })

  it('accepts a valid signature, marks paid and tracks the purchase', async () => {
    await startRazorpay()
    await request(app)
      .post('/api/order/verifyrazorpay')
      .set('Cookie', userCookie(user._id))
      .send({ razorpay_order_id: 'order_rzp_1', razorpay_payment_id: 'pay_1', razorpay_signature: sign('order_rzp_1', 'pay_1') })
      .expect(200)
    expect((await Order.findOne({ userId: user._id.toString() })).payment).toBe(true)
    await vi.waitFor(async () => {
      expect((await User.findById(user._id)).purchasedProducts).toHaveLength(1)
    })
  })

  it("will not let another user verify someone else's order", async () => {
    await startRazorpay()
    await request(app)
      .post('/api/order/verifyrazorpay')
      .set('Cookie', userCookie(other._id))
      .send({ razorpay_order_id: 'order_rzp_1', razorpay_payment_id: 'pay_1', razorpay_signature: sign('order_rzp_1', 'pay_1') })
      .expect(404)
    expect((await Order.findOne({ userId: user._id.toString() })).payment).toBe(false)
  })
})
