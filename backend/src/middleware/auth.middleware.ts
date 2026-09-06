import { Request, Response, NextFunction } from "express";
import { verifySessionToken, COOKIE_NAME } from "../lib/session.js";
import { db } from "../lib/db.js";
import { PostingIdentity } from "@prisma/client";

// Extend Express Request interface to include optional user
declare global {
  namespace Express {
    interface Request {
      user?: PostingIdentity | null;
    }
  }
}

/**
 * Middleware that extracts posting identity from session cookie if present.
 * Does not block if unauthenticated.
 */
export async function optionalAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.[COOKIE_NAME];
    if (!token) {
      req.user = null;
      return next();
    }

    const session = verifySessionToken(token);
    if (!session || !session.postingHash) {
      req.user = null;
      return next();
    }

    const identity = await db.postingIdentity.findUnique({
      where: { postingHash: session.postingHash },
    });

    req.user = identity || null;
    next();
  } catch (error) {
    req.user = null;
    next();
  }
}

/**
 * Middleware that enforces valid authentication.
 * Returns 401 Unauthorized if no valid session is found.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.[COOKIE_NAME];
    if (!token) {
      return res.status(401).json({ success: false, error: "Unauthorized: No active session cookie found" });
    }

    const session = verifySessionToken(token);
    if (!session || !session.postingHash) {
      return res.status(401).json({ success: false, error: "Unauthorized: Invalid session token" });
    }

    const identity = await db.postingIdentity.findUnique({
      where: { postingHash: session.postingHash },
    });

    if (!identity) {
      return res.status(401).json({ success: false, error: "Unauthorized: Posting identity not found" });
    }

    req.user = identity;
    next();
  } catch (error: any) {
    return res.status(401).json({ success: false, error: error.message || "Unauthorized" });
  }
}
