import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, ArrowRight, ShieldAlert, KeyRound } from "lucide-react";
import { api } from "../api/client";

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
      const res = await api.auth.verifyOtp({ id, code });
      if (res.success) {
        if (res.exists) {
          navigate({ to: "/" });
        } else {
          navigate({
            to: "/signup",
            search: { token: res.token || "" },
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
    <div className="flex flex-col min-h-screen bg-canvas font-sans text-ink">
      <header className="sticky top-0 z-50 bg-canvas/90 backdrop-blur-md border-b border-hairline-soft px-4 sm:px-6 lg:px-10 h-14 sm:h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <SpikeMark className="w-5 h-5 text-coral shrink-0" />
          <span className="font-display text-[19px] sm:text-[22px] leading-none text-ink tracking-tight">the tweeting platform</span>
        </Link>
        <Link to="/" className="text-[13px] sm:text-[14px] font-medium text-muted-ink hover:text-ink transition-colors flex items-center gap-1 min-h-[40px]">
          <ArrowLeft className="w-3.5 h-3.5" /> <span className="hidden xs:inline">Back to</span> Landing
        </Link>
      </header>

      <main className="flex-grow flex items-center justify-center py-8 sm:py-16 px-4 sm:px-6">
        <div className="w-full max-w-[460px] bg-surface-card rounded-xl p-5 sm:p-8 hairline animate-fade-up">
          <div className="w-11 h-11 sm:w-12 sm:h-12 bg-surface-soft rounded-lg flex items-center justify-center mb-5 sm:mb-6">
            <KeyRound className="w-5 h-5 sm:w-6 sm:h-6 text-coral" />
          </div>

          <h2 className="font-display text-[22px] sm:text-display-sm text-ink mb-2">Check your inbox</h2>
          <p className="text-[13.5px] sm:text-[14px] text-body mb-5 sm:mb-6 leading-relaxed">
            We sent a 6-digit magic code to your work email. Please enter the code below to verify your account.
          </p>

          {!id ? (
            <div className="bg-red-50 text-destructive p-4 rounded-md hairline mb-6 flex items-start gap-3">
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
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  placeholder="123456"
                  pattern="[0-9]{6}"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ""))}
                  disabled={isLoading}
                  className="w-full bg-canvas text-ink text-center tracking-[6px] sm:tracking-[8px] font-mono text-[22px] sm:text-[24px] font-bold py-3 rounded-md hairline focus:outline-none focus:border-coral transition-colors"
                />
              </div>

              {errorMsg && (
                <p className="text-destructive text-[13px] font-medium mt-1">{errorMsg}</p>
              )}

              <button
                type="submit"
                disabled={isLoading || code.length !== 6}
                className="w-full bg-coral hover:bg-coral-active active:scale-[0.98] text-white min-h-[48px] h-12 rounded-md text-[14.5px] sm:text-[14px] font-medium flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50 mt-6"
              >
                {isLoading ? "Verifying..." : "Verify Code"}
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          )}
        </div>
      </main>

      <footer className="bg-surface-dark py-6 sm:py-8 px-4 border-t border-white/10 text-center text-on-dark-soft">
        <p className="text-[11.5px] sm:text-[12px]">
          &copy; 2026. Standalone anonymous network. Protected by cryptographically isolated hashing.
        </p>
      </footer>
    </div>
  );
}
