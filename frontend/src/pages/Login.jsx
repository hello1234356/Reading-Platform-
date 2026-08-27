import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { requireSupabase } from "../lib/supabase";
import {
  clearPendingSignupEmail,
  friendlyAuthError,
  passwordLogin,
  readPendingSignupEmail,
  requestSignupOtp,
  resendSignupOtp,
  savePendingSignupEmail,
  verifySignupOtp,
} from "../lib/authOtp";
import loginBackground from "../assets/login-background.png";
import loginBackgroundPortrait from "../assets/login-background-portrait.png";

const RESEND_COOLDOWN_MS = 30_000;

export default function Login() {
  const navigate = useNavigate();
  const restoredEmail = readPendingSignupEmail(window.sessionStorage);
  const [mode, setMode] = useState(restoredEmail ? "verify" : "login");
  const [email, setEmail] = useState(restoredEmail);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendCoolingDown, setResendCoolingDown] = useState(false);

  useEffect(() => {
    if (!resendCoolingDown) return undefined;
    const timeoutId = window.setTimeout(() => setResendCoolingDown(false), RESEND_COOLDOWN_MS);
    return () => window.clearTimeout(timeoutId);
  }, [resendCoolingDown]);

  function goTo(nextMode) {
    setMessage("");
    setPassword("");
    setCode("");
    if (nextMode !== "verify") clearPendingSignupEmail(window.sessionStorage);
    setMode(nextMode);
  }

  async function handleCredentialsSubmit(event) {
    event.preventDefault();
    setMessage("");
    if (password.length < 6) {
      setMessage("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);
    try {
      const auth = requireSupabase().auth;
      if (mode === "signup") {
        const result = await requestSignupOtp(auth, { email, password });
        savePendingSignupEmail(window.sessionStorage, result.email);
        setEmail(result.email);
        setPassword("");
        setMode("verify");
        return;
      }

      const data = await passwordLogin(auth, { email, password });
      if (!data.user?.email_confirmed_at) {
        await auth.signOut();
        setMessage("Please verify your school email before logging in.");
        return;
      }
      navigate("/");
    } catch (error) {
      setMessage(error?.code === "invalid_domain" ? error.message : friendlyAuthError(error, mode));
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(event) {
    event.preventDefault();
    const token = code.trim();
    if (!token) {
      setMessage("Enter the verification code from your email.");
      return;
    }

    setLoading(true);
    setMessage("");
    try {
      await verifySignupOtp(requireSupabase().auth, { email, token });
      clearPendingSignupEmail(window.sessionStorage);
      setCode("");
      // verifyOtp persists the session and emits SIGNED_IN. The existing auth
      // listener remains the sole owner of application auth state/bootstrap.
      navigate("/");
    } catch (error) {
      setMessage(friendlyAuthError(error, "verify"));
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (resending || resendCoolingDown) return;
    setResending(true);
    setMessage("");
    try {
      await resendSignupOtp(requireSupabase().auth, email);
      setResendCoolingDown(true);
      setMessage("A new verification code was sent.");
    } catch (error) {
      setMessage(friendlyAuthError(error, "resend"));
    } finally {
      setResending(false);
    }
  }

  const isVerify = mode === "verify";

  return (
    <main className="login-showcase-page" style={{
      "--login-bg-desktop": `url(${loginBackground})`,
      "--login-bg-portrait": `url(${loginBackgroundPortrait})`,
    }}>
      <section className="login-illustration-panel">
        <div className="login-left-copy">
          <h1>{isVerify ? "Almost there" : "Welcome back"}</h1>
          <span className="login-squiggle" />
          <p>{isVerify
            ? "Enter the code from your inbox to open your LitShelf account."
            : "Log in with your school email to access your reading journal, shelves, clubs, and notes."}</p>
        </div>
      </section>

      <section className="login-card-beautiful">
        <div className="login-card-header">
          <div className="book-stack-icon" aria-hidden="true"><span /><span /><span /></div>
          <div className="leaf-icon" aria-hidden="true">⌁</div>
          <h2>{isVerify ? "Check your email" : mode === "login" ? "Log in to LitShelf" : "Create your LitShelf account"}</h2>
          <p>{isVerify ? `We sent a verification code to ${email}.` : "Your reading journal, your community."}</p>
        </div>

        {isVerify ? (
          <form className="beautiful-login-form" onSubmit={handleVerify}>
            <label>
              <span>Verification code</span>
              <div className="pretty-input-wrap">
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  aria-describedby="verification-help"
                  placeholder="Enter your code"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  autoFocus
                />
                <em aria-hidden="true">#</em>
              </div>
              <small id="verification-help">Paste or type the code exactly as it appears in the email.</small>
            </label>
            <button className="beautiful-login-button" disabled={loading || !code.trim()}>
              {loading ? "Verifying..." : "Verify"}
            </button>
          </form>
        ) : (
          <form className="beautiful-login-form" onSubmit={handleCredentialsSubmit}>
            <label>
              <span>School email</span>
              <div className="pretty-input-wrap">
                <input type="email" autoComplete="email" placeholder="name@tsinglan.org" value={email} onChange={(event) => setEmail(event.target.value)} required />
                <em aria-hidden="true">✉</em>
              </div>
            </label>
            <label>
              <span>Password</span>
              <div className="pretty-input-wrap">
                <input type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} placeholder="Enter your password" value={password} onChange={(event) => setPassword(event.target.value)} required />
                <em aria-hidden="true">⌕</em>
              </div>
            </label>
            <button className="beautiful-login-button" disabled={loading}>
              {loading ? "Please wait..." : mode === "login" ? "Log in" : "Sign up"}
            </button>
          </form>
        )}

        {message && <p className="login-message beautiful-message" role="status">{message}</p>}

        {isVerify ? (
          <div className="login-verification-actions">
            <button type="button" onClick={handleResend} disabled={resending || resendCoolingDown}>
              {resending ? "Sending..." : resendCoolingDown ? "Code sent" : "Resend code"}
            </button>
            <button type="button" onClick={() => goTo("signup")}>Change email</button>
          </div>
        ) : (
          <p className="login-switch-line">
            {mode === "login" ? "Need an account?" : "Already have an account?"}{" "}
            <button type="button" onClick={() => goTo(mode === "login" ? "signup" : "login")}>
              {mode === "login" ? "Sign up" : "Log in"}
            </button>
          </p>
        )}
      </section>
    </main>
  );
}
