import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "../api";
import { useAuth } from "../AuthContext";


const SEV_COLOR = { critical: "var(--accent)", high: "var(--coral)", medium: "var(--warning)", low: "var(--success)" };


export default function AuthorityDashboard() {
    const { auth } = useAuth();
    const token = auth?.token;

    const [reports, setReports] = useState([]);
    const [stats, setStats] = useState(null);
    const [filter, setFilter] = useState("all");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [expanded, setExpanded] = useState(null); // report id with assign panel open
    const [nearbyTeams, setNearby] = useState({});  // { reportId: [teams] }
    const [assigning, setAssigning] = useState("");
    const [messages, setMessages] = useState([]);

    const fetchData = useCallback(async () => {
        try {
            const [r, s] = await Promise.all([
                apiFetch(`/api/reports${filter !== "all" ? `?status=${filter}` : ""}`, {}, token),
                apiFetch("/api/stats", {}, token)
            ]);
            setReports(r); setStats(s); setError("");
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, [filter, token]);

    useEffect(() => { fetchData(); }, [fetchData]);
    useEffect(() => { const t = setInterval(fetchData, 15000); return () => clearInterval(t); }, [fetchData]);

    useEffect(() => {
        const socket = new WebSocket("wss://669d61ztb9.execute-api.ap-south-1.amazonaws.com/dev/");

        socket.onopen = () => {
            console.log("Feed Connected");
        };

        socket.onmessage = (event) => {
            try {
                const parsed = JSON.parse(event.data);
                console.log("Realtime:", parsed);
                
                // Extract inner payload from { data: ... } wrapping
                const payload = parsed.data || parsed.msg || parsed;
                let msgText = "";

                if (payload && payload.type === "DISASTER_ALERT") {
                    msgText = `[${payload.severity}] ${payload.message} at ${payload.location}`;
                } else {
                    msgText = typeof payload === 'string' ? payload : JSON.stringify(payload);
                }

                setMessages(prev => [...prev, msgText]);
            } catch (e) {
                setMessages(prev => [...prev, event.data]);
            }
        };

        socket.onerror = (err) => {
            console.error("Error:", err);
        };

        socket.onclose = () => {
            console.log("Feed Disconnected");
        };

        return () => socket.close();
    }, []);

    const toggleAssign = async (report) => {
        if (expanded === report.id) { setExpanded(null); return; }
        setExpanded(report.id);
        if (!nearbyTeams[report.id]) {
            try {
                const teams = await apiFetch(`/api/reports/${report.id}/nearby-teams`, {}, token);
                setNearby(prev => ({ ...prev, [report.id]: teams }));
            } catch {
                setNearby(prev => ({ ...prev, [report.id]: [] }));
            }
        }
    };

    const assignTeam = async (reportId, teamId) => {
        setAssigning(teamId);
        try {
            await apiFetch(`/api/reports/${reportId}/assign`,
                { method: "POST", body: { team_id: teamId } }, token);
            await fetchData();
            setExpanded(null);
        } catch (e) { setError(e.message); }
        finally { setAssigning(""); }
    };

    const updateStatus = async (id, status) => {
        try {
            await apiFetch(`/api/reports/${id}/status`,
                { method: "PATCH", body: { status } }, token);
            fetchData();
        } catch (e) { setError(e.message); }
    };

    const formatDate = iso => new Date(iso + "Z").toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" });

    return (
        <div>
            {/* Live Alerts */}
            {messages.length > 0 && (
                <div style={{ marginBottom: "2rem", padding: "1.25rem", background: "rgba(230, 57, 70, 0.05)", borderRadius: "12px", border: "1px solid var(--accent)" }}>
                    <h3 style={{ margin: "0 0 12px 0", color: "var(--accent)", fontFamily: 'var(--fd)', fontSize: '1rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Live Alerts Feed</h3>
                    {messages.map((msg, i) => (
                        <p key={i} style={{ margin: "6px 0", fontSize: "0.85rem", opacity: 0.9, fontFamily: 'var(--fm)' }}>{msg}</p>
                    ))}
                </div>
            )}

            {/* Stats */}
            <div className="stats-grid">
                {[
                    { label: "Total", value: stats?.total ?? "—", cls: "total" },
                    { label: "Pending", value: stats?.pending ?? "—", cls: "pending" },
                    { label: "Assigned", value: stats?.assigned ?? "—", cls: "assigned" },
                    { label: "Active", value: stats?.active ?? "—", cls: "active" },
                    { label: "Resolved", value: stats?.resolved ?? "—", cls: "resolved" },
                ].map(s => (
                    <div key={s.cls} className={`stat-card ${s.cls}`}>
                        <div className="stat-label">{s.label}</div>
                        <div className="stat-value">{s.value}</div>
                    </div>
                ))}
            </div>

            {error && <div className="error-banner" style={{ marginBottom: "1.5rem" }}>{error}</div>}

            <div className="card">
                <div className="section-header">
                    <div className="section-title">Operational Reports</div>
                    <div className="filter-tabs">
                        {["all", "pending", "assigned", "active", "resolved"].map(f => (
                            <button key={f} className={`filter-tab ${filter === f ? "active" : ""}`}
                                onClick={() => setFilter(f)}>
                                {f.charAt(0).toUpperCase() + f.slice(1)}
                            </button>
                        ))}
                    </div>
                </div>

                {loading ? (
                    <div className="loading">Initializing system feeds...</div>
                ) : reports.length === 0 ? (
                    <div className="empty-state">
                        No reports found in current sector.
                    </div>
                ) : (
                    <div className="reports-list">
                        {reports.map(r => (
                            <div key={r.id} className="report-card">
                                <div className={`severity-dot ${r.severity}`} />

                                <div className="report-info">
                                    <div className="report-type">
                                        {r.disaster_type?.replace("_", " ")}
                                        <span className={`severity-badge ${r.severity}`}>{r.severity}</span>
                                    </div>
                                    <div className="report-meta">
                                        LOCATION: {r.location} &nbsp;·&nbsp; REPORTER: {r.reporter_name} &nbsp;·&nbsp; TIME: {formatDate(r.created_at)}
                                    </div>
                                    <div className="report-desc">{r.description}</div>
                                    {r.assigned_team_name && (
                                        <div className="report-assigned">
                                            Assigned Unit: <strong>{r.assigned_team_name}</strong>
                                            {r.assigned_at && ` · Dispatched at ${formatDate(r.assigned_at)}`}
                                        </div>
                                    )}
                                    {r.image_url && (
                                        <a href={r.image_url.replace("disaster-response-uploads.s3.ap-south-1.amazonaws.com", "d2lbf1bpfshpl4.cloudfront.net")} target="_blank" rel="noreferrer"
                                            style={{ fontSize: "0.78rem", color: "var(--info)", marginTop: 4, display: "block" }}>
                                            📸 View uploaded image
                                        </a>
                                    )}

                                    {/* Assign team panel */}
                                    {expanded === r.id && (
                                        <div className="assign-panel">
                                            <div className="assign-panel-title" style={{ fontFamily: 'var(--fb)', fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                {nearbyTeams[r.id]?.length
                                                    ? `Sector Units (Distance Optimized):`
                                                    : "Scanning nearest units..."}
                                            </div>
                                                {nearbyTeams[r.id]?.map(team => (
                                                    <div key={team.id} className="team-option">
                                                        <div>
                                                            <div className="team-name">{team.name}</div>
                                                            <div className="team-dist">
                                                                AREA: {team.area}
                                                                {team.distance_km < 9999
                                                                    ? ` · ${team.distance_km} KM`
                                                                    : " · Distance Unknown"}
                                                            </div>
                                                        </div>

                                                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                                            <span className={`team-avail ${team.available ? "yes" : "no"}`}>
                                                                {team.available ? "Available" : "Busy"}
                                                            </span>
                                                            <button className="assign-btn"
                                                                disabled={!team.available || assigning === team.id}
                                                                onClick={() => assignTeam(r.id, team.id)}>
                                                                {assigning === team.id ? "..." : "Assign"}
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                            {nearbyTeams[r.id]?.length === 0 && (
                                                <div style={{ fontSize: "0.82rem", color: "var(--muted)" }}>
                                                    No available teams found with location data.
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                <div className="report-right">
                                    <span className={`status-badge ${r.status}`}>{r.status}</span>
                                    <span className="report-id" style={{ fontFamily: 'var(--fm)', letterSpacing: '0.05em' }}>#{r.id}</span>

                                    {/* Only show assign button if not yet assigned */}
                                    {r.status === "pending" && (
                                        <button onClick={() => toggleAssign(r)}
                                            style={{ background: "var(--purple)", border: "none", color: "white", padding: "6px 14px", borderRadius: 8, cursor: "pointer", fontSize: "0.8rem", fontWeight: 700, textTransform: 'uppercase' }}>
                                            {expanded === r.id ? "Close" : "Assign Unit"}
                                        </button>
                                    )}

                                    {/* Status controls for assigned/active */}
                                    {["assigned", "active"].includes(r.status) && (
                                        <select
                                            value={r.status}
                                            onChange={e => updateStatus(r.id, e.target.value)}
                                            style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)", borderRadius: 6, padding: "4px 8px", fontSize: "0.78rem", cursor: "pointer" }}>
                                            <option value="assigned">Assigned</option>
                                            <option value="active">Active</option>
                                            <option value="resolved">Resolved</option>
                                        </select>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}