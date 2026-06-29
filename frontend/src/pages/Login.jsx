import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { requireSupabase } from "../lib/supabase";
import loginBackground from "../assets/login-background.png"
export default function Login() {
  const navigate = useNavigate();

  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setMessage("");
    setLoading(true);

    try {
      const supabase = requireSupabase();

      if (!email.endsWith("@tsinglan.org")) {
        setMessage("Please use your Tsinglan school email.");
        return;
      }

      if (password.length < 6) {
        setMessage("Password must be at least 6 characters.");
        return;
      }

      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });

        if (error) {
          setMessage(error.message);
          return;
        }

        setMessage("Account created. Check your school email to confirm it.");
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setMessage("Login failed. Check your email and password.");
        return;
      }

      navigate("/");
    } catch (err) {
      setMessage(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      className="login-showcase-page"
       style={{ backgroundImage: `url(${loginBackground})` }}
    >
      <section className="login-illustration-panel">
        <div className="login-left-copy">
          <h1>Welcome back</h1>
          <span className="login-squiggle" />
          <p>
            Log in with your school email to access your reading journal,
            shelves, clubs, and notes.
          </p>
        </div>

      </section>

      <section className="login-card-beautiful">
        <div className="login-card-header">
          <div className="book-stack-icon" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div className="leaf-icon" aria-hidden="true">⌁</div>
          <h2>{mode === "login" ? "Log in to LitShelf" : "Create your LitShelf account"}</h2>
          <p>Your reading journal, your community.</p>
        </div>

        <form className="beautiful-login-form" onSubmit={handleSubmit}>
          <label>
            <span>School email</span>
            <div className="pretty-input-wrap">
              <input
                type="email"
                placeholder="name@tsinglan.org"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <em>✉</em>
            </div>
          </label>

          <label>
            <span>Password</span>
            <div className="pretty-input-wrap">
              <input
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <em>⌕</em>
            </div>
          </label>

          <button className="beautiful-login-button" disabled={loading}>
            {loading
              ? "Please wait..."
              : mode === "login"
              ? "Log in"
              : "Sign up"}
          </button>
        </form>

        {message && <p className="login-message beautiful-message">{message}</p>}

        <p className="login-switch-line">
          {mode === "login" ? "Need an account?" : "Already have an account?"}{" "}
          <button
            type="button"
            onClick={() => {
              setMessage("");
              setMode(mode === "login" ? "signup" : "login");
            }}
          >
            {mode === "login" ? "Sign up" : "Log in"}
          </button>
        </p>
      </section>
    </main>
  );
}