import { useState } from "react";
import { AuthProvider, useAuth } from "./AuthContext";
import AuthorityDashboard from "./pages/AuthorityDashboard";
import "./App.css";
import { apiFetch } from "./api";

function AuthorityApp() {
    const { auth, login, logout } = useAuth();
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const handleLogin = async () => {
        if (!password) return;
        setLoading(true); setError("");
        try {
            const data = await apiFetch("/api/auth/login", {
                method: "POST",
                body: { role: "authority", password }
            });
            login(data);
        } catch (e) {
            setError("Invalid password. Access denied.");
        } finally {
            setLoading(false);
        }
    };

    // ── Login wall ──────────────────────────────────────────────────────────
    if (!auth) return (
        <div className="app">
            <header className="header">
                <div className="header-inner">
                    <div className="logo">
                        <div className="logo-icon-wrap" style={{ width: 40, height: 40, background: 'var(--purple)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <div style={{ width: 14, height: 14, background: 'white', borderRadius: 2, boxShadow: '0 0 10px rgba(124, 58, 237, 0.5)' }} />
                        </div>
                        <div>
                            <div className="logo-title" style={{ color: "var(--purple)" }}>
                                AUTHORITY COMMAND CENTRE
                            </div>
                            <div className="logo-sub">CLOUDRESQ OPERATIONAL PORTAL</div>
                        </div>
                    </div>
                </div>
            </header>

            <main className="main">
                <div style={{ maxWidth: 400, margin: "4rem auto" }}>
                    <div className="form-heading">Authority Login</div>
                    <p className="form-sub" style={{ marginBottom: "1.5rem" }}>
                        Restricted access for authorised command personnel only.
                    </p>
                    <div className="card">
                        <div className="form-group">
                            <label>Passcode</label>
                            <input
                                type="password"
                                placeholder="Enter authority passcode"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                onKeyDown={e => e.key === "Enter" && handleLogin()}
                                autoFocus
                            />
                        </div>
                        {error && <div className="error-banner" style={{ marginTop: 10 }}>{error}</div>}
                        <button className="submit-btn purple" onClick={handleLogin} disabled={loading}
                            style={{ marginTop: "1rem" }}>
                            {loading ? "VERIFYING..." : "ACCESS COMMAND"}
                        </button>
                    </div>

                </div>
            </main>
        </div>
    );

    // ── Authenticated dashboard ─────────────────────────────────────────────
    return (
        <div className="app">
            <header className="header">
                <div className="header-inner">
                    <div className="logo">
                        <div className="logo-icon-wrap" style={{ width: 40, height: 40, background: 'var(--purple)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <div style={{ width: 14, height: 14, background: 'white', borderRadius: 2, boxShadow: '0 0 10px rgba(124, 58, 237, 0.5)' }} />
                        </div>
                        <div>
                            <div className="logo-title" style={{ color: "var(--purple)" }}>
                                AUTHORITY COMMAND CENTRE
                            </div>
                            <div className="logo-sub">SYSTEM OPERATIONAL STATUS: NOMINAL</div>
                        </div>
                    </div>
                    <button className="nav-btn" onClick={logout}>END SESSION</button>
                </div>
            </header>
            <main className="main">
                <AuthorityDashboard />
            </main>
            <footer className="footer">
                <span>Authority Portal — Smart Disaster Response System</span>
                <span>Flask · React · Docker · AWS</span>
            </footer>
        </div>
    );
}

export default function App() {
    return <AuthProvider><AuthorityApp /></AuthProvider>;
}