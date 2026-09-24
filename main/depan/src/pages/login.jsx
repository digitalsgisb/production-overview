import { useEffect, useRef, useState } from "react";
import "./login.css";

const DEFAULT_API_URL = import.meta.env.DEV
  ? `${window.location.protocol}//${window.location.hostname}:3200`
  : window.location.origin;
const API_URL = import.meta.env.DEV
  ? import.meta.env.VITE_API_URL || DEFAULT_API_URL
  : window.location.origin;
const LOGIN_URL = `${API_URL}/login`;
const GUEST_SESSION_URL = `${API_URL}/guest-session`;

function storeSession(token, user, onLoginSuccess) {
  localStorage.setItem("token", token);
  localStorage.setItem("userId", user.id);
  localStorage.setItem("username", user.username || "");
  localStorage.setItem("name", user.name);
  localStorage.setItem("role", user.role);
  localStorage.setItem("status", user.status);
  localStorage.setItem("sites", JSON.stringify(user.sites || []));
  onLoginSuccess(user);
}

function Login({ onLoginSuccess }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [guestLoading, setGuestLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const guestCodeRef = useRef(new URLSearchParams(window.location.hash.slice(1)).get("guest"));

  useEffect(() => {
    const code = guestCodeRef.current;
    if (!code) return undefined;
    window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
    let cancelled = false;
    const openGuestView = async () => {
      setGuestLoading(true);
      try {
        const response = await fetch(GUEST_SESSION_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        });
        const data = await response.json();
        if (cancelled) return;
        if (!response.ok) {
          setError(data.message || "Guest access is unavailable.");
          return;
        }
        storeSession(data.token, data.user, onLoginSuccess);
      } catch {
        if (!cancelled) setError("Connection to server failed");
      } finally {
        if (!cancelled) setGuestLoading(false);
      }
    };
    openGuestView();
    return () => { cancelled = true; };
  }, [onLoginSuccess]);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    if (!username || !password) {
      setError("Please enter your username and password.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(LOGIN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || "Invalid username or password.");
        return;
      }

      storeSession(data.token, data.user, onLoginSuccess);
    } catch {
      setError("Connection to server failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-wrap">
      <section className="login-shell" aria-label="Production overview login">
        <div className="login-brand-panel">
          <img className="brand-logo-login" src="/sugihara-circle-logo.png" alt="Sugihara Grand Industries" />
          <p className="login-eyebrow">Live control room</p>
          <h1>Production Overview</h1>
          <div className="login-site-list" aria-label="Monitored sites">
            <span><i></i>Port Klang</span>
            <span><i></i>Sendayan</span>
            <span><i></i>DTU</span>
          </div>
        </div>

        <section className="login-card" aria-label="Login">
          <div className="login-logo">
            <span className="login-logo__mark"><img src="/sugihara-circle-logo.png" alt="" /></span>
            <div>
              <p className="login-logo__eyebrow">Authorized access</p>
              <div className="login-logo__text">Control Room Sign In</div>
            </div>
          </div>

          <form className="login-form" onSubmit={handleSubmit} noValidate>
            <div className="form-field">
              <label className="form-field__label" htmlFor="username">Username</label>
              <input
                className="form-field__input"
                type="text"
                id="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
              />
            </div>

            <div className="form-field">
              <label className="form-field__label" htmlFor="password">Password</label>
              <div className="form-field__input-wrap">
                <input
                  className="form-field__input"
                  type={showPassword ? "text" : "password"}
                  id="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                />
                <button
                  className="form-field__toggle"
                  type="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword((current) => !current)}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                  </svg>
                </button>
              </div>
            </div>

            {error && <p className="login-form__error">{error}</p>}

            <button className="submit-btn" type="submit" disabled={loading || guestLoading}>
              {loading ? "Logging in..." : "Log In"}
            </button>
            {guestLoading && <p className="guest-access-note" role="status">Opening guest view…</p>}
          </form>
        </section>
      </section>
    </main>
  );
}

export default Login;
