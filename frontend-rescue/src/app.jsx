import { useState } from "react";
import { AuthProvider, useAuth } from "./AuthContext";
import RescueDashboard from "./pages/Rescuedashboard";
import "./App.css";
import { apiFetch } from "./api";

function RescueApp() {
    const { auth, login, logout } = useAuth();
    const [teamId, setTeamId] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const handleLogin = async () => {
        if (!teamId || !password) { setError("Enter both Team ID and password."); return; }
        setLoading(true); setError("");
        try {
            const data = await apiFetch("/api/auth/login", {
                method: "POST",
                body: { role: "rescue", password, team_id: teamId.trim().toUpperCase() }
            });
            login(data);
        } catch (e) {
            setError("Invalid Team ID or password. Contact your authority coordinator.");
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
                        <div className="logo-icon-wrap" style={{ width: 40, height: 40, background: 'var(--coral)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <div style={{ width: 14, height: 14, border: '2px solid white', borderRadius: 2 }} />
                        </div>
                        <div>
                            <div className="logo-title" style={{ color: "var(--coral)" }}>
                                RESCUE FIELD PORTAL
                            </div>
                            <div className="logo-sub">FIELD OPERATIONS INTERFACE</div>
                        </div>
                    </div>
                </div>
            </header>

            <main className="main">
                <div style={{ maxWidth: 400, margin: "4rem auto" }}>
                    <div className="form-heading">Field Access</div>
                    <p className="form-sub" style={{ marginBottom: "1.5rem" }}>
                        Enter assigned Unit ID and secure operational passcode.
                    </p>
                    <div className="card">
                        <div className="form-group" style={{ marginBottom: "1.25rem" }}>
                            <label>Unit ID</label>
                            <input
                                placeholder="e.g. TEAM0001"
                                value={teamId}
                                onChange={e => setTeamId(e.target.value)}
                                style={{ textTransform: "uppercase", fontFamily: 'var(--fm)' }}
                            />
                        </div>
                        <div className="form-group">
                            <label>Passcode</label>
                            <input
                                type="password"
                                placeholder="Enter operational passcode"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                onKeyDown={e => e.key === "Enter" && handleLogin()}
                            />
                        </div>
                        {error && <div className="error-banner" style={{ marginTop: 10 }}>{error}</div>}
                        <button className="submit-btn" onClick={handleLogin} disabled={loading}
                            style={{ marginTop: "1.5rem", background: "var(--coral)" }}>
                            {loading ? "AUTHENTICATING..." : "ESTABLISH LINK"}
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
                        <div className="logo-icon-wrap" style={{ width: 40, height: 40, background: 'var(--coral)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <div style={{ width: 14, height: 14, border: '2px solid white', borderRadius: 2 }} />
                        </div>
                        <div>
                            <div className="logo-title" style={{ color: "var(--coral)" }}>
                                {auth.team?.name?.toUpperCase()}
                            </div>
                            <div className="logo-sub">DEPLOYMENT STATUS: ACTIVE</div>
                        </div>
                    </div>
                    <button className="nav-btn" onClick={logout}>TERMINATE LINK</button>
                </div>
            </header>
            <main className="main">
                <RescueDashboard team={auth.team} token={auth.token} />
            </main>
            <footer className="footer">
                <span>Rescue Team Portal — Smart Disaster Response System</span>
                <span>Flask · React · Docker · AWS</span>
            </footer>
        </div>
    );
}

export default function App() {
    return <AuthProvider><RescueApp /></AuthProvider>;
}
