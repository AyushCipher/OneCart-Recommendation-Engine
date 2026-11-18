import { z } from 'zod'

const email = z.string().trim().email().max(254)
const password = z.string().min(8).max(128)

export const registerSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email,
  password,
  gender: z.string().max(30).optional(),
  dateOfBirth: z.coerce.date().optional().nullable(),
  profession: z.string().max(100).optional(),
  bio: z.string().max(500).optional(),
})

export const loginSchema = z.object({ email, password: z.string().min(1).max(128) })

export const googleLoginSchema = z.object({
  idToken: z.string().min(10).max(5000),
  name: z.string().max(100).optional(),
  email: z.string().optional(),
})

export const sendOtpSchema = z.object({ email })
export const verifyOtpSchema = z.object({ email, otp: z.string().regex(/^\d{4}$/, 'OTP must be 4 digits') })
export const resetPasswordSchema = z.object({ email, password })

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id')

export const placeOrderSchema = z.object({
  items: z
    .array(
      z.object({
        _id: objectId.optional(),
        productId: objectId.optional(),
        quantity: z.coerce.number().int().positive().max(100),
      }).passthrough().refine((i) => i._id || i.productId, 'item id is required')
    )
    .min(1)
    .max(100),
  address: z.record(z.string(), z.any()),
  couponCode: z.string().trim().max(50).optional().nullable(),
})

export const verifyRazorpaySchema = z.object({
  razorpay_order_id: z.string().min(1).max(100),
  razorpay_payment_id: z.string().min(1).max(100),
  razorpay_signature: z.string().min(1).max(200),
})
