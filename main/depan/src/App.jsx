import { useState } from "react";
import Dashboard from "./pages/dashboard.jsx";
import Login from "./pages/login.jsx";

function App() {
  const [authUser, setAuthUser] = useState(() => {
    // const token = localStorage.getItem("token");
    const userId = localStorage.getItem("userId");
    const name = localStorage.getItem("name");
    const email = localStorage.getItem("email");

    return userId ? { id: userId, email, name } : null;
  });

  function handleLoginSuccess(user) {
    setAuthUser(user);
  }

  function handleLogout() {
    localStorage.removeItem("token");
    localStorage.removeItem("userId");
    localStorage.removeItem("email");
    setAuthUser(null);
  }

  if (!authUser) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  return <Dashboard user={authUser} onLogout={handleLogout} />;
}

export default App;
