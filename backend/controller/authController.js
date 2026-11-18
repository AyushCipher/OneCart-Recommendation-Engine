// ======================== ADMIN LOGIN ========================
export const adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (
      email === process.env.ADMIN_EMAIL &&
      password === process.env.ADMIN_PASSWORD
    ) {
      // Generate a JWT token for admin
      const token = genToken1(email); // { email } claim, checked by adminAuth
      res.cookie("token", token, {
        httpOnly: true,
        secure: true,
        sameSite: "none",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
      return res.status(200).json({ message: "Admin Login Successful", admin: { email } });
    } else {
      return res.status(401).json({ message: "Invalid admin credentials" });
    }
  } catch (err) {
    return res.status(500).json({ message: `Admin Login Error: ${err.message}` });
  }
};
import User from "../model/userModel.js";
import validator from "validator";
import bcrypt from "bcryptjs";
import { genToken, genToken1 } from "../config/token.js";
import { verifyFirebaseIdToken, isFirebaseConfigured } from "../config/firebaseAdmin.js";
import crypto from "crypto";
import sendMail from "../config/Mail.js";

// Never send the password hash / OTP fields to the client.
const toSafeUser = (user) => {
  const obj = user.toObject ? user.toObject() : { ...user };
  delete obj.password;
  delete obj.resetOtp;
  delete obj.otpExpires;
  return obj;
};

// COMMON COOKIE OPTIONS
const cookieConfig = {
  httpOnly: true,
  secure: true,
  sameSite: "none",
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

// ======================== REGISTER ========================
export const registration = async (req, res) => {
  try {
    const { name, email, password, gender, dateOfBirth, profession, bio } = req.body;

    if (!validator.isEmail(email))
      return res.status(400).json({ message: "Invalid email!" });

    if (!validator.isStrongPassword(password)) {
      return res.status(400).json({
        message: "Password must include uppercase, lowercase, number & symbol."
      });
    }

    const existUser = await User.findOne({ email });
    if (existUser)
      return res.status(400).json({ message: "User already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      gender: gender || "",
      dateOfBirth: dateOfBirth || null,
      profession: profession || "",
      bio: bio || "",
      isOtpVerifed: false,
    });

    const token = genToken(user._id);

    res.cookie("token", token, cookieConfig);

    return res.status(201).json({
      message: "Registration Successful",
      user: toSafeUser(user),
    });

  } catch (err) {
    return res.status(500).json({ message: `Registration Error: ${err.message}` });
  }
};

// ======================== LOGIN ========================
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    let user = await User.findOne({ email }).select("+password");

    if (!user) return res.status(404).json({ message: "User not found" });

    // Google-created accounts have no password
    let isMatch = user.password ? await bcrypt.compare(password, user.password) : false;
    if (!isMatch)
      return res.status(400).json({ message: "Incorrect Password" });

    const token = genToken(user._id);

    res.cookie("token", token, cookieConfig);

    return res.status(200).json({
      message: "Login Successful",
      user: toSafeUser(user),
    });

  } catch (err) {
    return res.status(500).json({ message: `Login Error: ${err.message}` });
  }
};


// ======================== SEND OTP ========================
export const sendOtp = async (req, res) => {
  try {
    const { email } = req.body;

    let user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User Not Found" });

    const otp = crypto.randomInt(1000, 10000).toString();

    user.resetOtp = otp;
    user.otpExpires = Date.now() + 5 * 60 * 1000;
    user.isOtpVerifed = false;

    await user.save();
    await sendMail(email, otp);

    return res.status(200).json({ message: "OTP sent" });

  } catch (err) {
    return res.status(500).json({ message: `Send OTP Error: ${err.message}` });
  }
};

// ======================== VERIFY OTP ========================
export const verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    const user = await User.findOne({ email }).select("+resetOtp +otpExpires");

    if (!user || !user.resetOtp || user.resetOtp !== otp || user.otpExpires < Date.now())
      return res.status(400).json({ message: "Invalid or Expired OTP" });

    user.isOtpVerifed = true;
    user.resetOtp = undefined;
    user.otpExpires = undefined;
    await user.save();

    const token = genToken(user._id);

    res.cookie("token", token, cookieConfig);

    return res.status(200).json({ message: "OTP Verified", user: toSafeUser(user) });

  } catch (err) {
    return res.status(500).json({ message: `OTP Error: ${err.message}` });
  }
};

// ======================== RESET PASSWORD ========================
export const resetPassword = async (req, res) => {
  try {
    const { email, password } = req.body;

    let user = await User.findOne({ email });
    if (!user || !user.isOtpVerifed)
      return res.status(403).json({ message: "OTP Not Verified" });

    const hashedPass = await bcrypt.hash(password, 10);

    user.password = hashedPass;
    user.isOtpVerifed = false; // one OTP verification = one reset
    user.resetOtp = undefined;
    user.otpExpires = undefined;

    await user.save();

    return res.status(200).json({ message: "Password Reset Successful" });

  } catch (err) {
    return res.status(500).json({ message: `Reset Error: ${err.message}` });
  }
};

// ======================== GOOGLE LOGIN ========================
export const googleLogin = async (req, res) => {
  try {
    // Fail closed: without Firebase admin credentials we cannot trust any identity claim.
    if (!isFirebaseConfigured()) {
      return res.status(503).json({ message: "Google login is not configured" });
    }

    const { idToken, name } = req.body;

    let decoded;
    try {
      decoded = await verifyFirebaseIdToken(idToken);
    } catch (err) {
      return res.status(401).json({ message: "Invalid Google token" });
    }

    // Identity comes from the verified token, never from the request body.
    const email = decoded?.email;
    if (!email || decoded.email_verified === false) {
      return res.status(401).json({ message: "Google account email is not verified" });
    }

    let user = await User.findOne({ email });

    if (!user) {
      user = await User.create({
        name: decoded.name || name || email.split("@")[0],
        email,
        password: "",
        isOtpVerifed: false,
      });
    }

    const token = genToken(user._id);

    res.cookie("token", token, cookieConfig);

    return res.status(200).json({
      message: "Google Login Successful",
      user: toSafeUser(user)
    });

  } catch (err) {
    return res.status(500).json({ message: `Google Login Error: ${err.message}` });
  }
};

// ======================== LOGOUT ========================
export const logOut = async (req, res) => {
  try {
    res.clearCookie("token", {
        httpOnly: true,
        secure: true,
        sameSite: "none",
        path: "/"
    });

    return res.status(200).json({ message: "Logged Out Successfully" });

  } catch (err) {
    return res.status(500).json({ message: `Logout Error: ${err.message}` });
  }
};
