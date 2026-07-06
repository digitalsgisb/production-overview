import { useState } from "react";
import "./theme.css";
import "./LoginPage.css";

/*
 * MOCK AUTH NOTICE:
 * server.js has no /api/auth/login or /api/auth/admin-login routes —
 * the backend only checks a single static x-api-key header on every
 * request, with no concept of user accounts or admin roles.
 * Login below is fully mocked client-side until a real auth endpoint
 * exists. Replace MOCK_USERS + the timeout in handleSubmit with a
 * real fetch() call once that endpoint is built.
 */
const MOCK_USERS = [
  { userId: "supervisor1", password: "floor123", role: "supervisor", name: "J. Tan" },
  { userId: "admin", password: "admin123", role: "admin", name: "S. Lim" },
];

export default function LoginPage({ onLoginSuccess }) {
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [isAdminMode, setIsAdminMode] = useState(false);

  function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!userId.trim() || !password) {
      setError("Enter both User ID and Password.");
      return;
    }

    setLoading(true);

    // Mock network delay — swap for a real fetch() to your auth
    // endpoint once one exists on server.js.
    setTimeout(() => {
      const match = MOCK_USERS.find(
        (u) => u.userId === userId.trim() && u.password === password
      );

      if (!match) {
        setError("Invalid User ID or Password.");
        setLoading(false);
        return;
      }

      if (isAdminMode && match.role !== "admin") {
        setError("This account does not have admin access.");
        setLoading(false);
        return;
      }

      localStorage.setItem("authUser", JSON.stringify(match));
      setLoading(false);
      if (onLoginSuccess) onLoginSuccess(match);
    }, 500);
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-mark">
          <span className="login-mark-dot" />
          LINE&nbsp;CONTROL
        </div>

        {isAdminMode && <div className="admin-mode-banner">ADMIN ACCESS</div>}

        <form className="login-form" onSubmit={handleSubmit}>
          <label className="login-label" htmlFor="userId">User ID</label>
          <input
            id="userId"
            type="text"
            className="login-input"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            placeholder="e.g. supervisor1"
          />

          <label className="login-label" htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            className="login-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            placeholder="Enter your password"
          />

          {error && <div className="login-error">{error}</div>}

          <button type="submit" className="login-button" disabled={loading}>
            {loading ? "Signing in…" : isAdminMode ? "Admin Sign In" : "Sign In"}
          </button>
        </form>

        <div className="login-hint">Demo: supervisor1 / floor123</div>
      </div>

      <button
        type="button"
        className="hidden-admin-toggle"
        aria-label="Toggle admin login"
        onClick={() => setIsAdminMode((prev) => !prev)}
      />
    </div>
  );
}