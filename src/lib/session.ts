import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "default_jwt_secret_change_in_prod";
const COOKIE_NAME = "tweeting_session";

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
 * Extracts the session token from the Request headers.
 */
export function getSessionTokenFromRequest(request: Request): string | null {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(";").reduce((acc, cookie) => {
    const [key, value] = cookie.trim().split("=");
    if (key && value) acc[key] = value;
    return acc;
  }, {} as Record<string, string>);

  return cookies[COOKIE_NAME] || null;
}

/**
 * Retrieves the session payload from the Request.
 */
export function getSession(request: Request): SessionPayload | null {
  const token = getSessionTokenFromRequest(request);
  if (!token) return null;
  return verifySessionToken(token);
}

/**
 * Generates the Set-Cookie header string for creating a session.
 */
export function serializeSessionCookie(postingHash: string): string {
  const token = signSessionToken({ postingHash });
  const maxAge = 30 * 24 * 60 * 60; // 30 days in seconds
  
  const secure = process.env.NODE_ENV === "production" ? "Secure; " : "";
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; ${secure}SameSite=Lax; Max-Age=${maxAge}`;
}

/**
 * Generates the Set-Cookie header string to delete the session.
 */
export function serializeDestroyCookie(): string {
  const secure = process.env.NODE_ENV === "production" ? "Secure; " : "";
  return `${COOKIE_NAME}=; Path=/; HttpOnly; ${secure}SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}
