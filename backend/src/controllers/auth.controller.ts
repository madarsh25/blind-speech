import { Request, Response } from "express";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { db } from "../lib/db.js";
import { encryptEmail, decryptEmail, derivePostingHash } from "../lib/crypto.js";
import { sendOtpEmail } from "../lib/email.js";
import { setSessionCookie, clearSessionCookie } from "../lib/session.js";

const JWT_SECRET = process.env.JWT_SECRET || "default_jwt_secret_change_in_prod";

export async function requestOtp(req: Request, res: Response) {
  try {
    const { email } = req.body;
    if (!email || typeof email !== "string") {
      return res.status(400).json({ success: false, error: "Please enter a valid email address" });
    }

    const clean = email.toLowerCase().trim();
    if (!clean || !clean.includes("@") || clean.split("@")[1].split(".").length < 2) {
      return res.status(400).json({ success: false, error: "Please enter a valid work email address" });
    }

    const domain = clean.split("@")[1];
    const publicDomains = ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "aol.com", "icloud.com"];

    // Dev bypass for testing
    const devEmails = (process.env.DEV_BYPASS_EMAILS || "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);

    const isDevBypass = devEmails.includes(clean);
    console.log("BYPASS DEBUG", { clean, count: devEmails.length, isDevBypass });

    if (publicDomains.includes(domain) && !isDevBypass) {
      return res.status(400).json({ success: false, error: "Please use your official work email (e.g. name@company.com)" });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash = crypto.createHash("sha256").update(otp).digest("hex");
    const encryptedEmail = encryptEmail(clean); // encryption takes place here
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    // after encyption, the encrypted value is stored in the database
    const verification = await db.otpVerification.create({
      data: {
        encryptedEmail, //cyphered text only
        otpHash, // SHA256 hash only
        expiresAt,
      },
    });

    await sendOtpEmail(clean, otp);

    return res.json({ success: true, verificationId: verification.id });
  } catch (e: any) {
    console.error("OTP Request error:", e);
    return res.status(500).json({ success: false, error: e.message || "An unexpected error occurred while sending the OTP." });
  }
}

export async function verifyOtp(req: Request, res: Response) {
  try {
    const { id, code } = req.body;
    if (!id) {
      return res.status(400).json({ success: false, error: "Missing verification session ID" });
    }
    if (!code || code.length !== 6) {
      return res.status(400).json({ success: false, error: "Please enter a 6-digit code" });
    }

    const verification = await db.otpVerification.findUnique({
      where: { id },
    });

    if (!verification) {
      return res.status(400).json({ success: false, error: "Verification session not found or expired. Please request a new code." });
    }

    if (new Date() > verification.expiresAt) {
      await db.otpVerification.delete({ where: { id } });
      return res.status(400).json({ success: false, error: "This verification code has expired. Please request a new code." });
    }

    if (verification.attempts >= 5) {
      await db.otpVerification.delete({ where: { id } });
      return res.status(400).json({ success: false, error: "Too many failed attempts. Please request a new code." });
    }

    const enteredHash = crypto.createHash("sha256").update(code.trim()).digest("hex");
    if (enteredHash !== verification.otpHash) {
      await db.otpVerification.update({
        where: { id },
        data: { attempts: { increment: 1 } },
      });
      return res.status(400).json({ success: false, error: "Invalid verification code. Please try again." });
    }

    const email = decryptEmail(verification.encryptedEmail);
    const companyDomain = email.split("@")[1];
    const postingHash = derivePostingHash(email);

    await db.otpVerification.delete({ where: { id } });

    const existingUser = await db.postingIdentity.findUnique({
      where: { postingHash },
    });

    if (existingUser) {
      setSessionCookie(res, postingHash);
      return res.json({ success: true, exists: true });
    } else {
      const tempToken = jwt.sign(
        { postingHash, companyDomain },
        JWT_SECRET,
        { expiresIn: "15m" }
      );
      return res.json({ success: true, exists: false, token: tempToken });
    }
  } catch (e: any) {
    console.error("Verification error:", e);
    return res.status(500).json({ success: false, error: e.message || "An unexpected error occurred during verification." });
  }
}

export async function signup(req: Request, res: Response) {
  try {
    const { token, username: rawUsername } = req.body;
    if (!token) {
      return res.status(400).json({ success: false, error: "Missing signup token" });
    }

    const username = (rawUsername || "").trim();
    if (username.length < 3 || username.length > 20) {
      return res.status(400).json({ success: false, error: "Username must be between 3 and 20 characters" });
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      return res.status(400).json({ success: false, error: "Username can only contain alphanumeric characters, underscores, and hyphens" });
    }

    let payload: any;
    try {
      payload = jwt.verify(token, JWT_SECRET);
    } catch (err: any) {
      return res.status(400).json({ success: false, error: "Invalid or expired signup session. Please verify your email again." });
    }

    const { postingHash, companyDomain } = payload;
    if (!postingHash || !companyDomain) {
      return res.status(400).json({ success: false, error: "Invalid signup token payload" });
    }

    const existingHash = await db.postingIdentity.findUnique({
      where: { postingHash },
    });
    if (existingHash) {
      return res.status(400).json({ success: false, error: "This email is already registered. Please login instead." });
    }

    const existingUsername = await db.postingIdentity.findFirst({
      where: {
        username: {
          equals: username,
          mode: "insensitive",
        },
      },
    });

    if (existingUsername) {
      return res.status(400).json({ success: false, error: "Username is already taken. Please choose another one." });
    }

    await db.postingIdentity.create({
      data: {
        postingHash,
        username,
        companyDomain,
      },
    });

    setSessionCookie(res, postingHash);
    return res.json({ success: true });
  } catch (e: any) {
    console.error("Signup error:", e);
    return res.status(500).json({ success: false, error: e.message || "An unexpected error occurred during signup." });
  }
}

export async function getMe(req: Request, res: Response) {
  if (!req.user) {
    return res.json({ success: true, user: null });
  }

  return res.json({
    success: true,
    user: {
      id: req.user.id,
      username: req.user.username,
      companyDomain: req.user.companyDomain,
    },
  });
}

export async function logout(req: Request, res: Response) {
  clearSessionCookie(res);
  return res.json({ success: true });
}
