import { useState } from "react";
import Dashboard from "./pages/dashboard.jsx";
import Login from "./pages/login.jsx";
import Wallboard from "./pages/wallboard.jsx";

function getStoredSites() {
  try {
    const sites = JSON.parse(localStorage.getItem("sites") || "[]");
    return Array.isArray(sites) ? sites : [];
  } catch {
    return [];
  }
}

function App() {
  const [authUser, setAuthUser] = useState(() => {
    const token = localStorage.getItem("token");
    const userId = localStorage.getItem("userId");
    const name = localStorage.getItem("name");
    const username = localStorage.getItem("username");
    const role = localStorage.getItem("role");
    const status = localStorage.getItem("status");
    const sites = getStoredSites();

    return userId && token ? { id: userId, username, name, role, status, sites } : null;
  });

  function handleLoginSuccess(user) {
    setAuthUser(user);
  }

  function handleLogout() {
    localStorage.removeItem("token");
    localStorage.removeItem("userId");
    localStorage.removeItem("username");
    localStorage.removeItem("email");
    localStorage.removeItem("name");
    localStorage.removeItem("role");
    localStorage.removeItem("status");
    localStorage.removeItem("sites");
    setAuthUser(null);
  }

  if (!authUser) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  if (window.location.pathname.replace(/\/+$/, "") === "/wallboard") {
    return <Wallboard user={authUser} onLogout={handleLogout} />;
  }

  return <Dashboard user={authUser} onLogout={handleLogout} />;
}

export default App;
