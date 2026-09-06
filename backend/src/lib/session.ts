import jwt from "jsonwebtoken";
import { CookieOptions, Response } from "express";

const JWT_SECRET = process.env.JWT_SECRET || "default_jwt_secret_change_in_prod";
export const COOKIE_NAME = "tweeting_session";

export interface SessionPayload {
  postingHash: string;
}

/**
 * Signs a JWT session token.
 */
export function signSessionToken(payload: SessionPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "30d" });
}

/**
 * Verifies a JWT session token.
 */
export function verifySessionToken(token: string): SessionPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as SessionPayload;
  } catch (e) {
    return null;
  }
}

/**
 * Sets the session cookie on an Express response.
 */
export function setSessionCookie(res: Response, postingHash: string) {
  const token = signSessionToken({ postingHash });
  const isProd = process.env.NODE_ENV === "production";
  
  const options: CookieOptions = {
    path: "/",
    httpOnly: true,
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days in ms
    sameSite: isProd ? "none" : "lax",
    secure: isProd,
  };
  
  res.cookie(COOKIE_NAME, token, options);
}

/**
 * Clears the session cookie on an Express response.
 */
export function clearSessionCookie(res: Response) {
  const isProd = process.env.NODE_ENV === "production";
  
  const options: CookieOptions = {
    path: "/",
    httpOnly: true,
    sameSite: isProd ? "none" : "lax",
    secure: isProd,
  };
  
  res.clearCookie(COOKIE_NAME, options);
}
