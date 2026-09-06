import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import jwt from "jsonwebtoken";
import { UserCheck, ShieldAlert, Sparkles } from "lucide-react";
import { db } from "../lib/db";
import { signSessionToken } from "../lib/session";

const JWT_SECRET = process.env.JWT_SECRET || "default_jwt_secret_change_in_prod";

// Server function to create a new Posting Identity profile
export const createProfile = createServerFn({ method: "POST" })
  .validator((data: { token: string; username: string }) => {
    if (!data.token) throw new Error("Missing signup token");
    
    const username = data.username.trim();
    if (username.length < 3 || username.length > 20) {
      throw new Error("Username must be between 3 and 20 characters");
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      throw new Error("Username can only contain alphanumeric characters, underscores, and hyphens");
    }
    return { token: data.token, username };
  })
  .handler(async ({ data: { token, username } }) => {
    try {
      let payload: any;
      try {
        payload = jwt.verify(token, JWT_SECRET);
      } catch (err: any) {
        console.error("DEBUG - JWT VERIFY ERROR DETAILS:", {
          name: err.name,
          message: err.message,
          token: token ? token.substring(0, 15) + "..." : "null",
          secretUsed: JWT_SECRET ? JWT_SECRET.substring(0, 10) + "..." : "undefined",
        });
        throw new Error("Invalid or expired signup session. Please verify your email again.");
      }

      const { postingHash, companyDomain } = payload;
      if (!postingHash || !companyDomain) {
        throw new Error("Invalid signup token payload");
      }

      const existingHash = await db.postingIdentity.findUnique({
        where: { postingHash },
      });
      if (existingHash) {
        throw new Error("This email is already registered. Please login instead.");
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
        throw new Error("Username is already taken. Please choose another one.");
      }

      await db.postingIdentity.create({
        data: {
          postingHash,
          username,
          companyDomain,
        },
      });

      const sessionToken = signSessionToken({ postingHash });
      const { setCookie } = await import("@tanstack/react-start/server");
      setCookie("tweeting_session", sessionToken, {
        path: "/",
        httpOnly: true,
        maxAge: 30 * 24 * 60 * 60,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      });

      return { success: true };
    } catch (e: any) {
      console.error("Signup error:", e);
      throw new Error(e.message || "An unexpected error occurred during signup.");
    }
  });

export const Route = createFileRoute("/signup")({
  validateSearch: (search: Record<string, unknown>) => {
    return {
      token: (search.token as string) || "",
    };
  },
  component: SignupPage,
});

function SpikeMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12 1.5c.3 3.6 1.4 6.6 3.4 8.7 2 2 5 3.1 8.6 3.4v-3.2c-2.5-.2-4.5-1-5.9-2.4-1.4-1.4-2.2-3.4-2.4-5.9zM12 22.5c-.3-3.6-1.4-6.6-3.4-8.7-2-2-5-3.1-8.6-3.4v3.2c2.5.2 4.5 1 5.9 2.4 1.4 1.4 2.2 3.4 2.4 5.9zM22.5 12c-3.6.3-6.6 1.4-8.7 3.4-2 2-3.1 5-3.4 8.6h3.2c.2-2.5 1-4.5 2.4-5.9 1.4-1.4 3.4-2.2 5.9-2.4zM1.5 12c3.6-.3 6.6-1.4 8.7-3.4 2-2 3.1-5 3.4-8.6h-3.2c-.2 2.5-1 4.5-2.4 5.9-1.4 1.4-3.4 2.2-5.9 2.4z" />
    </svg>
  );
}

function SignupPage() {
  const { token } = Route.useSearch();
  const [username, setUsername] = useState("");
  const [domain, setDomain] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    if (token) {
      try {
        const base64Url = token.split(".")[1];
        const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
        const jsonPayload = decodeURIComponent(
          window
            .atob(base64)
            .split("")
            .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
            .join("")
        );
        const payload = JSON.parse(jsonPayload);
        if (payload?.companyDomain) {
          setDomain(payload.companyDomain);
        }
      } catch (e) {
        setErrorMsg("Invalid signup token payload. Please verify your email again.");
      }
    }
  }, [token]);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      setErrorMsg("Missing registration token. Please verify your email first.");
      return;
    }
    setIsLoading(true);
    setErrorMsg("");

    try {
      const res = await createProfile({ data: { token, username } });
      if (res.success) {
        navigate({ to: "/" });
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to create profile. Please try again.");
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
        </div>
      </header>

      <main className="flex-grow flex items-center justify-center py-16 px-6 font-sans">
        <div className="w-full max-w-[460px] bg-surface-card rounded-xl p-8 hairline animate-fade-up">
          <div className="w-12 h-12 bg-surface-soft rounded-lg flex items-center justify-center mb-6">
            <UserCheck className="w-6 h-6 text-coral" />
          </div>

          <h2 className="font-display text-display-sm text-ink mb-2">Create posting identity</h2>
          
          {domain && (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-coral/10 rounded-pill text-coral font-mono text-[12px] font-semibold mb-6">
              <Sparkles className="w-3.5 h-3.5" /> Verified at @{domain}
            </div>
          )}

          <p className="text-[14px] text-body mb-6 leading-relaxed">
            Please choose a unique, anonymous username. Do not use your real name or any identifier that could reveal your identity.
          </p>

          {!token ? (
            <div className="bg-red-50 text-error p-4 rounded-md hairline mb-6 flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" />
              <p className="text-[13px] leading-relaxed font-medium">
                Missing verification token. Please verify your work email first.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSignup} className="space-y-4">
              <div>
                <label htmlFor="username" className="caption-upper text-[11px] text-muted-ink block mb-2">
                  Anonymous Username
                </label>
                <input
                  type="text"
                  id="username"
                  required
                  placeholder="e.g. tech_lead_42"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={isLoading}
                  className="w-full bg-canvas text-ink px-4 py-2.5 text-[14px] rounded-md hairline focus:outline-none focus:border-coral transition-colors"
                />
              </div>

              {errorMsg && (
                <p className="text-destructive text-[13px] font-medium mt-1">{errorMsg}</p>
              )}

              <button
                type="submit"
                disabled={isLoading || username.trim().length < 3}
                className="w-full bg-coral hover:bg-coral-active text-white h-11 rounded-md text-[14px] font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50 mt-6"
              >
                {isLoading ? "Creating..." : "Create Account & Sign In"}
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
