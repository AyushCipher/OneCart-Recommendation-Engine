import express from 'express'
import isAuth from '../middleware/isAuth.js'
import { allOrders, placeOrder, placeOrderRazorpay, updateStatus, userOrders, verifyRazorpay } from '../controller/orderController.js'
import adminAuth from '../middleware/adminAuth.js'
import validate from '../middleware/validate.js'
import { placeOrderSchema, verifyRazorpaySchema } from '../validation/schemas.js'

const orderRoutes = express.Router()

//for User
orderRoutes.post("/placeorder",isAuth,validate(placeOrderSchema),placeOrder)
orderRoutes.post("/razorpay",isAuth,validate(placeOrderSchema),placeOrderRazorpay)
orderRoutes.post("/userorder",isAuth,userOrders)
orderRoutes.post("/verifyrazorpay",isAuth,validate(verifyRazorpaySchema),verifyRazorpay)
 
//for Admin
orderRoutes.post("/list",adminAuth,allOrders)
orderRoutes.post("/status",adminAuth,updateStatus)

export default orderRoutes