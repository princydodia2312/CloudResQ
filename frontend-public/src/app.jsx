import { useState } from "react";
import UserPage from "./pages/Userpage";
import "./App.css";

export default function App() {
    const [view, setView] = useState("report");
    const [resetKey, setResetKey] = useState(0);

    const handleReportNav = () => {
        setView("report");
        if (view === "report") setResetKey(k => k + 1);
    };

    return (
        <div className="app">
            <header className="header">
                <div className="header-inner">
                    <div className="logo">
                        <div className="logo-icon-wrap" style={{ width: 40, height: 40, background: 'linear-gradient(135deg, var(--accent), var(--coral))', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <div style={{ width: 12, height: 12, background: 'white', borderRadius: '50%', boxShadow: '0 0 10px white' }} />
                        </div>
                        <div>
                            <div className="logo-title">ResQNet</div>
                            <div className="logo-sub">EMERGENCY OPERATIONS</div>
                        </div>
                    </div>
                    <nav className="nav">
                        <button className={`nav-btn ${view === "report" ? "active" : ""}`}
                            onClick={handleReportNav}>Report Emergency</button>
                        <button className={`nav-btn ${view === "track" ? "active" : ""}`}
                            onClick={() => setView("track")}>Track Report</button>
                    </nav>
                </div>
            </header>

            <main className="main">
                <UserPage view={view} resetKey={resetKey} />
            </main>

            <footer className="footer">
                <span>Smart Disaster Response System</span>
                <span>For emergencies, use this portal. Staff access is separate.</span>
            </footer>
        </div>
    );
}
