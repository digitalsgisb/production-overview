import { useState } from "react";
import "./login.css";

const DEFAULT_API_URL = `${window.location.protocol}//${window.location.hostname}:3200`;
const API_URL = import.meta.env.VITE_API_URL || DEFAULT_API_URL;
const LOGIN_URL = `${API_URL}/login`;

function Login({ onLoginSuccess }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    if (!email || !password) {
      setError("Please enter your email and password.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(LOGIN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || "Invalid email or password.");
        return;
      }

    //   localStorage.setItem("token", data.token);
      localStorage.setItem("userId", data.user.id);
      localStorage.setItem("email", data.user.email);
      localStorage.setItem("name", data.user.name);

      onLoginSuccess({
        // token: data.token,
        id: data.user.id,
        email: data.user.email,
        name: data.user.name,
      });
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
          <img className="brand-logo-login" src="https://github.com/wblsugihara/image/blob/main/sugi_white.png?raw=true" alt="Sugihara Grand Industries" />
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
            <span className="login-logo__mark">SG</span>
            <div>
              <p className="login-logo__eyebrow">Authorized access</p>
              <div className="login-logo__text">Control Room Sign In</div>
            </div>
          </div>

          <form className="login-form" onSubmit={handleSubmit} noValidate>
            <div className="form-field">
              <label className="form-field__label" htmlFor="email">Email</label>
              <input
                className="form-field__input"
                type="email"
                id="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
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

            <button className="submit-btn" type="submit" disabled={loading}>
              {loading ? "Logging in..." : "Log In"}
            </button>
          </form>
        </section>
      </section>
    </main>
  );
}

export default Login;
