import express from "express";
import {
  registration,
  login,
  sendOtp,
  verifyOtp,
  resetPassword,
  logOut,
  googleLogin,
  adminLogin
} from "../controller/authController.js";
import { loginLimiter, otpLimiter, resetPasswordLimiter } from "../middleware/rateLimiter.js";
import validate from "../middleware/validate.js";
import {
  registerSchema, loginSchema, googleLoginSchema, sendOtpSchema, verifyOtpSchema, resetPasswordSchema
} from "../validation/schemas.js";

const router = express.Router();

// USER AUTH
router.post("/register", validate(registerSchema), registration);
router.post("/login", loginLimiter, validate(loginSchema), login);
router.post("/googlelogin", loginLimiter, validate(googleLoginSchema), googleLogin);
router.post("/adminlogin", loginLimiter, adminLogin);

// OTP FLOW
router.post("/send-otp", otpLimiter, validate(sendOtpSchema), sendOtp);
router.post("/verify-otp", otpLimiter, validate(verifyOtpSchema), verifyOtp);
router.post("/reset-password", resetPasswordLimiter, validate(resetPasswordSchema), resetPassword);

// LOGOUT
router.post("/logout", logOut);

export default router;
