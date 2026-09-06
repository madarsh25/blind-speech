import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useState } from "react";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { ArrowLeft, ArrowRight, ShieldAlert, KeyRound } from "lucide-react";
import { db } from "../lib/db";
import { decryptEmail, derivePostingHash } from "../lib/crypto";
import { signSessionToken } from "../lib/session";

const JWT_SECRET = process.env.JWT_SECRET || "default_jwt_secret_change_in_prod";

// Server function to verify OTP code
export const verifyOtp = createServerFn({ method: "POST" })
  .validator((data: { id: string; code: string }) => {
    if (!data.id) throw new Error("Missing verification session ID");
    if (!data.code || data.code.length !== 6) throw new Error("Please enter a 6-digit code");
    return data;
  })
  .handler(async ({ data: { id, code } }) => {
    try {
      const verification = await db.otpVerification.findUnique({
        where: { id },
      });

      if (!verification) {
        throw new Error("Verification session not found or expired. Please request a new code.");
      }

      if (new Date() > verification.expiresAt) {
        await db.otpVerification.delete({ where: { id } });
        throw new Error("This verification code has expired. Please request a new code.");
      }

      if (verification.attempts >= 5) {
        await db.otpVerification.delete({ where: { id } });
        throw new Error("Too many failed attempts. Please request a new code.");
      }

      const enteredHash = crypto.createHash("sha256").update(code.trim()).digest("hex");
      if (enteredHash !== verification.otpHash) {
        await db.otpVerification.update({
          where: { id },
          data: { attempts: { increment: 1 } },
        });
        throw new Error("Invalid verification code. Please try again.");
      }

      const email = decryptEmail(verification.encryptedEmail);
      const companyDomain = email.split("@")[1];
      const postingHash = derivePostingHash(email);

      await db.otpVerification.delete({ where: { id } });

      const existingUser = await db.postingIdentity.findUnique({
        where: { postingHash },
      });

      if (existingUser) {
        const token = signSessionToken({ postingHash });
        const { setCookie } = await import("@tanstack/react-start/server");
        setCookie("tweeting_session", token, {
          path: "/",
          httpOnly: true,
          maxAge: 30 * 24 * 60 * 60,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
        });
        return { success: true, exists: true };
      } else {
        const tempToken = jwt.sign(
          { postingHash, companyDomain },
          JWT_SECRET,
          { expiresIn: "15m" }
        );
        return { success: true, exists: false, token: tempToken };
      }
    } catch (e: any) {
      console.error("Verification error:", e);
      throw new Error(e.message || "An unexpected error occurred during verification.");
    }
  });

export const Route = createFileRoute("/verify")({
  validateSearch: (search: Record<string, unknown>) => {
    return {
      id: (search.id as string) || "",
    };
  },
  component: VerifyPage,
});

function SpikeMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12 1.5c.3 3.6 1.4 6.6 3.4 8.7 2 2 5 3.1 8.6 3.4v-3.2c-2.5-.2-4.5-1-5.9-2.4-1.4-1.4-2.2-3.4-2.4-5.9zM12 22.5c-.3-3.6-1.4-6.6-3.4-8.7-2-2-5-3.1-8.6-3.4v3.2c2.5.2 4.5 1 5.9 2.4 1.4 1.4 2.2 3.4 2.4 5.9zM22.5 12c-3.6.3-6.6 1.4-8.7 3.4-2 2-3.1 5-3.4 8.6h3.2c.2-2.5 1-4.5 2.4-5.9 1.4-1.4 3.4-2.2 5.9-2.4zM1.5 12c3.6-.3 6.6-1.4 8.7-3.4 2-2 3.1-5 3.4-8.6h-3.2c-.2 2.5-1 4.5-2.4 5.9-1.4 1.4-3.4 2.2-5.9 2.4z" />
    </svg>
  );
}

function VerifyPage() {
  const { id } = Route.useSearch();
  const [code, setCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const navigate = useNavigate();

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) {
      setErrorMsg("Invalid verification session. Please go back to the homepage.");
      return;
    }
    setIsLoading(true);
    setErrorMsg("");

    try {
      const res = await verifyOtp({ data: { id, code } });
      if (res.success) {
        if (res.exists) {
          navigate({ to: "/" });
        } else {
          navigate({
            to: "/signup",
            search: { token: res.token },
          });
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to verify. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen">
      <header className="sticky top-0 z-50 bg-canvas/85 backdrop-blur-md border-b border-hairline-soft font-sans">
        <div className="max-w-[1200px] mx-auto px-6 lg:px-10 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <SpikeMark className="w-5 h-5 text-coral" />
            <span className="font-display text-[22px] leading-none text-ink tracking-tight font-display">the tweeting platform</span>
          </Link>
          <div className="flex items-center gap-6">
            <Link to="/" className="text-[14px] font-medium text-muted-ink hover:text-ink transition-colors flex items-center gap-1">
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Landing
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-grow flex items-center justify-center py-16 px-6 font-sans">
        <div className="w-full max-w-[460px] bg-surface-card rounded-xl p-8 hairline animate-fade-up">
          <div className="w-12 h-12 bg-surface-soft rounded-lg flex items-center justify-center mb-6">
            <KeyRound className="w-6 h-6 text-coral" />
          </div>

          <h2 className="font-display text-display-sm text-ink mb-2">Check your inbox</h2>
          <p className="text-[14px] text-body mb-6 leading-relaxed">
            We sent a 6-digit magic code to your work email. Please enter the code below to verify your account.
          </p>

          {!id ? (
            <div className="bg-red-50 text-error p-4 rounded-md hairline mb-6 flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" />
              <p className="text-[13px] leading-relaxed font-medium">
                Invalid verification link. Please go back to the homepage and re-submit your email.
              </p>
            </div>
          ) : (
            <form onSubmit={handleVerify} className="space-y-4">
              <div>
                <label htmlFor="code" className="caption-upper text-[11px] text-muted-ink block mb-2">
                  Verification Code
                </label>
                <input
                  type="text"
                  id="code"
                  maxLength={6}
                  required
                  placeholder="123456"
                  pattern="[0-9]{6}"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ""))}
                  disabled={isLoading}
                  className="w-full bg-canvas text-ink text-center tracking-[8px] font-mono text-[24px] font-bold py-3 rounded-md hairline focus:outline-none focus:border-coral transition-colors"
                />
              </div>

              {errorMsg && (
                <p className="text-destructive text-[13px] font-medium mt-1">{errorMsg}</p>
              )}

              <button
                type="submit"
                disabled={isLoading || code.length !== 6}
                className="w-full bg-coral hover:bg-coral-active text-white h-11 rounded-md text-[14px] font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50 mt-6"
              >
                {isLoading ? "Verifying..." : "Verify Code"}
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          )}
        </div>
      </main>

      <footer className="bg-surface-dark py-8 border-t border-white/10 text-center text-on-dark-soft font-sans">
        <p className="text-[12px]">
          &copy; 2026. Standalone anonymous network. Protected by cryptographically isolated hashing.
        </p>
      </footer>
    </div>
  );
}
