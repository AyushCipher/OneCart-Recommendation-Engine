import mongoose from 'mongoose'
import jwt from 'jsonwebtoken'
import { MongoMemoryServer } from 'mongodb-memory-server'

export const ADMIN_EMAIL = 'admin@onecart.test'

export const setTestEnv = () => {
  process.env.JWT_SECRET = 'test-secret'
  process.env.ADMIN_EMAIL = ADMIN_EMAIL
  process.env.ADMIN_PASSWORD = 'admin-pass'
  process.env.RAZORPAY_KEY_ID = 'rzp_test_key'
  process.env.RAZORPAY_KEY_SECRET = 'rzp_test_secret'
}

let mongod
export const startDb = async () => {
  mongod = await MongoMemoryServer.create()
  await mongoose.connect(mongod.getUri())
}
export const stopDb = async () => {
  await mongoose.disconnect()
  await mongod?.stop()
}
export const clearDb = async () => {
  await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})))
}

export const userCookie = (userId) => [`token=${jwt.sign({ userId: userId.toString() }, process.env.JWT_SECRET)}`]
export const adminCookie = () => [`token=${jwt.sign({ email: ADMIN_EMAIL }, process.env.JWT_SECRET)}`]

export const makeProduct = (Product, overrides = {}) =>
  Product.create({
    name: 'Tee', image1: 'a', image2: 'b', image3: 'c', image4: 'd',
    description: 'A tee', price: 500, category: 'Men', subCategory: 'TopWear',
    sizes: ['M'], date: Date.now(), bestseller: false, stock: 10, ...overrides,
  })
