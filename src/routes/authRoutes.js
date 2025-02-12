import express from "express";
import crypto from "crypto";
import dbConnect from "../config/db.mjs";
import bcrypt from "bcrypt";
import { v4 as uuidv4 } from "uuid";
import jwt from "jsonwebtoken";
const router = express.Router();
const db = await dbConnect();
import cookie from "cookie";
import { ObjectId } from "mongodb";
import {
  ACCESS_COOKIE_MAX_AGE,
  ACCESS_COOKIE_NAME,
  ACCESS_EXPIRATION,
  ACCESS_TOKEN_SECRET_KEY,
  REFRESH_COOKIE_MAX_AGE,
  REFRESH_COOKIE_NAME,
  REFRESH_EXPIRATION,
  REFRESH_SECRET_KEY,
} from "../constants/names.mjs";

const usersCollection = db.collection("users");
const otpCollection = db.collection("otps");
const sessionsCollection = db.collection("sessions");

// Login
router.post("/login", async (req, res) => {
  const { userIdentifier, password } = req.body;
  try {
    const user = await usersCollection.findOne({
      $or: [{ email: userIdentifier }, { mobile: userIdentifier }],
    });

    if (!user || !(await bcrypt.compare(password, user?.password))) {
      return res
        .status(401)
        .json({ message: "Invalid credentials", status: 401 });
    }
    delete user.password;

    const sessionId = uuidv4();
    await sessionsCollection.insertOne({
      sessionId,
      userId: user._id,
      createdAt: new Date(),
    });
    const { cart, ...userForPayload } = user;
    const accessTokenPayload = {
      user:userForPayload,
    };

    const refreshTokenPayload = {
      userId: user._id,
      sessionId,
    };

    const accessToken = jwt.sign(accessTokenPayload, ACCESS_TOKEN_SECRET_KEY, {
      expiresIn: ACCESS_EXPIRATION,
    });

    const refreshToken = jwt.sign(refreshTokenPayload, REFRESH_SECRET_KEY, {
      expiresIn: REFRESH_EXPIRATION,
    });
    // console.log(accessToken)
    res.cookie(ACCESS_COOKIE_NAME, accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production" ? true : false,
      sameSite: "strict",
      maxAge: ACCESS_COOKIE_MAX_AGE,
    });

    res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production" ? true : false,
      sameSite: "strict",
      maxAge: REFRESH_COOKIE_MAX_AGE,
    });

    return res.status(200).json({
      message: "Login successful",
      status: 200,
      accessToken,
      refreshToken,
      user,
    });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ message: "Server error", error, status: 500 });
  }
});

// logout
router.post("/logout", async (req, res) => {
  try {
    const cookies = cookie.parse(req.headers?.cookie || "");
    const rfrToken = cookies?.rfr_token;
    const refreshToken = rfrToken || req.body.refreshToken;
    if (!refreshToken) {
      return res
        .status(401)
        .json({ message: "Refresh token missing", status: 401 });
    }
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, REFRESH_SECRET_KEY);
    } catch (error) {
      return res
        .status(403)
        .json({ message: "Invalid or expired refresh token", status: 403 });
    }
    let sessionId = decoded?.sessionId;

    if (!sessionId) {
      return res.status(400).json({ message: "No session found", status: 400 });
    }

    // Remove session from the database
    await sessionsCollection.deleteOne({ sessionId });

    // Clear the cookies by setting an expired date
    res.clearCookie(ACCESS_COOKIE_NAME, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
    });

    res.clearCookie(REFRESH_COOKIE_NAME, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
    });

    return res.status(200).json({ message: "Logout successful", status: 200 });
  } catch (error) {
    console.error(error);
    res.clearCookie(ACCESS_COOKIE_NAME, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
    });

    res.clearCookie(REFRESH_COOKIE_NAME, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
    });
    return res
      .status(500)
      .json({ message: "Server error", error, status: 500 });
  }
});

// Signup
router.post("/signup", async (req, res) => {
  const { email, mobile, password, name } = req.body;
  try {
    const existingUser = await usersCollection.findOne({
      $or: [{ email }, { mobile }],
    });

    if (existingUser) {
      return res
        .status(409)
        .json({ message: "User already exists.", status: 409 });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = {
      name,
      mobile,
      email,
      photoUrl: "",
      password: hashedPassword,
      role: "user",
      status: "active",
      joined: new Date(),
      cart: [],
    };
    await usersCollection.insertOne(newUser);
    return res.status(201).json({ message: "Signup successful", status: 200 });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Server error", error, status: 500 });
  }
});

// Request OTP
router.post("/request-otp", async (req, res) => {
  const { userIdentifier } = req.body;

  try {
    const user = await usersCollection.findOne({
      $or: [{ email: userIdentifier }, { mobile: userIdentifier }],
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const otp = crypto.randomInt(100000, 999999).toString();
    await otpCollection.insertOne({
      userId: user._id,
      otp,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000), // OTP valid for 5 minutes
    });

    // TODO: Send OTP via email/SMS
    console.log(`OTP for ${userIdentifier}: ${otp}`);

    return res.status(200).json({ message: "OTP sent successfully" });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error });
  }
});

// Verify OTP
router.post("/verify-otp", async (req, res) => {
  const { userIdentifier, otp } = req.body;

  try {
    const user = await usersCollection.findOne({
      $or: [{ email: userIdentifier }, { mobile: userIdentifier }],
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const storedOtp = await otpCollection.findOne({
      userId: user._id,
      otp,
    });

    if (!storedOtp || storedOtp.expiresAt < new Date()) {
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }

    // Clean up the OTP after successful verification
    await otpCollection.deleteOne({ _id: storedOtp._id });

    return res.status(200).json({ message: "OTP verified successfully" });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error });
  }
});

// Reset Password
router.post("/reset-password", async (req, res) => {
  const { userIdentifier, newPassword } = req.body;

  try {
    const result = await usersCollection.updateOne(
      {
        $or: [{ email: userIdentifier }, { mobile: userIdentifier }],
      },
      { $set: { password: newPassword } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.status(200).json({ message: "Password reset successfully" });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error });
  }
});

router.post("/refresh", async (req, res) => {
  try {
    const cookies = cookie.parse(req.headers?.cookie || "");
    const rfrToken = cookies?.rfr_token;
    // const accessToken = cookies.acs_token;
    // if (accessToken) {
    //   return res.status(200).json({
    //     message: "Access token is valid. No need to refresh.",
    //     status: "success",
    //   });
    // }

    const refreshToken = rfrToken || req.body.refreshToken;
    if (!refreshToken) {
      return res
        .status(401)
        .json({ message: "Refresh token missing", status: 401 });
    }

    let decoded;
    try {
      decoded = jwt.verify(refreshToken, REFRESH_SECRET_KEY);
    } catch (error) {
      return res
        .status(403)
        .json({ message: "Invalid or expired refresh token", status: 403 });
    }
    const sessionId = decoded.sessionId;
    const isValidSessionId = await sessionsCollection.findOne({ sessionId });
    if (!isValidSessionId) {
      res.clearCookie(REFRESH_COOKIE_NAME, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
      });

      return res
        .status(403)
        .json({ message: "SessionId closed. Login to continue.", status: 403 });
    }
    // Find the user associated with the refresh token
    const user = await usersCollection.findOne({
      _id: new ObjectId(decoded?.userId),
    });
    if (!user) {
      return res.status(404).json({ message: "User not found", status: 404 });
    }
    if (user?.status === "blocked") {
      res.clearCookie(REFRESH_COOKIE_NAME, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
      });
      res.clearCookie(ACCESS_COOKIE_NAME, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
      });

      return res
        .status(403)
        .json({ message: "Blocked by admin. Contact Support.", status: 403 });
    }

    delete user.password;
    const { cart, ...userForPayload } = user;
    const accessTokenPayload = {
      user:userForPayload,
    };

    const newAccessToken = jwt.sign(
      accessTokenPayload,
      ACCESS_TOKEN_SECRET_KEY,
      {
        expiresIn: ACCESS_EXPIRATION,
      }
    );

    // Update cookies for web clients

    if (rfrToken) {
      res.cookie(ACCESS_COOKIE_NAME, newAccessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        // sameSite: "lax",
        maxAge: ACCESS_COOKIE_MAX_AGE,
      });
    }

    // Return the new tokens for mobile clients
    return res.status(200).json({
      accessToken: newAccessToken,
      message: "Token refreshed successfully",
      status: 200,
      user,
    });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ message: "Server error", error, status: 500 });
  }
});

export default router;
