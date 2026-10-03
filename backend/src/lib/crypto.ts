import crypto from "crypto";

const DUMMY_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const _ENCRYPTION_KEY = process.env.EMAIL_ENCRYPTION_KEY;
if (!_ENCRYPTION_KEY || _ENCRYPTION_KEY === DUMMY_KEY) {
  throw new Error(
    "EMAIL_ENCRYPTION_KEY must be set to a real 32-byte hex secret (64 hex chars). " +
    "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
  );
}
const ENCRYPTION_KEY: string = _ENCRYPTION_KEY; // narrowed: guard above guarantees non-null, non-dummy

const SALT_POSTING = process.env.SALT_POSTING || "default_posting_salt_change_in_prod";

/**
 * Encrypts a string (e.g., work email) using AES-256-GCM.
 */
export function encryptEmail(email: string): string {
  const cleanEmail = email.toLowerCase().trim();
  const key = Buffer.from(ENCRYPTION_KEY, "hex");
  const iv = crypto.randomBytes(12); // 12-byte IV for GCM
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  
  let encrypted = cipher.update(cleanEmail, "utf8", "hex");
  encrypted += cipher.final("hex");
  const tag = cipher.getAuthTag().toString("hex");
  
  // Format: iv:tag:ciphertext
  return `${iv.toString("hex")}:${tag}:${encrypted}`;
}

/**
 * Decrypts an encrypted email.
 */
export function decryptEmail(encryptedData: string): string {
  const [ivHex, tagHex, encryptedText] = encryptedData.split(":");
  if (!ivHex || !tagHex || !encryptedText) {
    throw new Error("Invalid encrypted format");
  }
  
  const key = Buffer.from(ENCRYPTION_KEY, "hex");
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  
  let decrypted = decipher.update(encryptedText, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

/**
 * Derives the persistent posting identity hash (HMAC-SHA256) of the email.
 */
export function derivePostingHash(email: string): string {
  const cleanEmail = email.toLowerCase().trim();
  return crypto
    .createHmac("sha256", SALT_POSTING)
    .update(cleanEmail)
    .digest("hex");
}
