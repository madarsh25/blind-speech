import { getCookie } from "@tanstack/react-start/server";
import { verifySessionToken } from "./session";
import { db } from "./db";

/**
 * Resolves the authenticated PostingIdentity from the tweeting_session cookie,
 * throwing a 401 error if unauthorized.
 */
export async function requireAuth() {
  const token = getCookie("tweeting_session");
  if (!token) {
    throw new Error("Unauthorized: No active session cookie found");
  }
  
  const session = verifySessionToken(token);
  if (!session || !session.postingHash) {
    throw new Error("Unauthorized: Invalid session token");
  }
  
  const identity = await db.postingIdentity.findUnique({
    where: { postingHash: session.postingHash },
  });
  
  if (!identity) {
    throw new Error("Unauthorized: Posting identity not found");
  }
  
  return identity;
}

/**
 * Resolves the authenticated PostingIdentity from the tweeting_session cookie
 * if it exists, otherwise returns null.
 */
export async function getOptionalAuth() {
  try {
    const token = getCookie("tweeting_session");
    if (!token) return null;
    
    const session = verifySessionToken(token);
    if (!session || !session.postingHash) return null;
    
    return await db.postingIdentity.findUnique({
      where: { postingHash: session.postingHash },
    });
  } catch (e) {
    return null;
  }
}
