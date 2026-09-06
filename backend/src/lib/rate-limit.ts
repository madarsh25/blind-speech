// Simple in-memory sliding window rate limiter
const windows: Record<string, number[]> = {};

/**
 * Checks if a key has exceeded the allowed rate limit.
 * @param key Unique key identifier (e.g. "userId:action")
 * @param limit Maximum number of actions allowed in the window
 * @param windowMs Time window in milliseconds
 * @returns true if action is allowed, false if rate limited
 */
export function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  if (!windows[key]) {
    windows[key] = [];
  }
  
  // Remove timestamps outside the sliding window
  windows[key] = windows[key].filter((timestamp) => now - timestamp < windowMs);
  
  if (windows[key].length >= limit) {
    return false;
  }
  
  windows[key].push(now);
  return true;
}
