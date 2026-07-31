import { useState } from "react";
import Dashboard from "./pages/dashboard.jsx";
import Login from "./pages/login.jsx";

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
    // const token = localStorage.getItem("token");
    const userId = localStorage.getItem("userId");
    const name = localStorage.getItem("name");
    const email = localStorage.getItem("email");
    const role = localStorage.getItem("role");
    const status = localStorage.getItem("status");
    const sites = getStoredSites();

    return userId ? { id: userId, email, name, role, status, sites } : null;
  });

  function handleLoginSuccess(user) {
    setAuthUser(user);
  }

  function handleLogout() {
    localStorage.removeItem("token");
    localStorage.removeItem("userId");
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

  return <Dashboard user={authUser} onLogout={handleLogout} />;
}

export default App;
