import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "../api";


const SEV_COLOR = { critical: "var(--accent)", high: "var(--coral)", medium: "var(--warning)", low: "var(--success)" };


const SEV_LABEL_TEXT = { critical: "Critical", high: "High", medium: "Medium", low: "Low" };


export default function RescueDashboard({ team, token }) {
    const [incidents, setIncidents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [actioning, setActioning] = useState("");
    const [lat, setLat] = useState("");
    const [lon, setLon] = useState("");
    const [locMsg, setLocMsg] = useState("");

    const fetchIncidents = useCallback(async () => {
        try {
            const data = await apiFetch(`/api/teams/${team.id}/incidents`, {}, token);
            setIncidents(data); setError("");
        } catch (e) { setError(e.message); }
        finally { setLoading(false); }
    }, [team.id, token]);

    useEffect(() => { fetchIncidents(); }, [fetchIncidents]);
    useEffect(() => { const t = setInterval(fetchIncidents, 15000); return () => clearInterval(t); }, [fetchIncidents]);

    const autoLocation = () => {
        if (!navigator.geolocation) return;
        navigator.geolocation.getCurrentPosition(pos => {
            setLat(pos.coords.latitude.toFixed(6));
            setLon(pos.coords.longitude.toFixed(6));
        });
    };

    const updateLocation = async () => {
        if (!lat || !lon) return;
        try {
            await apiFetch(`/api/teams/${team.id}/location`,
                { method: "PATCH", body: { latitude: lat, longitude: lon } }, token);
            setLocMsg("Location updated.");
            setTimeout(() => setLocMsg(""), 3000);
        } catch (e) { setLocMsg(e.message); }
    };

    const doAction = async (incidentId, action) => {
        setActioning(incidentId + action);
        try {
            await apiFetch(`/api/teams/${team.id}/incidents/${incidentId}/${action}`,
                { method: "POST" }, token);
            fetchIncidents();
        } catch (e) { setError(e.message); }
        finally { setActioning(""); }
    };

    const formatDate = iso => new Date(iso + "Z").toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" });

    const active = incidents.filter(i => i.status === "active");
    const assigned = incidents.filter(i => i.status === "assigned");
    const resolved = incidents.filter(i => i.status === "resolved");

    return (
        <div style={{ maxWidth: 800 }}>

            {/* Team info + location updater */}
            <div className="card" style={{ marginBottom: "1.5rem", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
                <div>
                    <div style={{ fontFamily: "var(--fd)", fontWeight: 700, fontSize: '1.2rem', textTransform: 'uppercase' }}>{team.name}</div>
                    <div style={{ fontSize: "0.85rem", color: "var(--muted)", fontFamily: 'var(--fm)', marginTop: 4 }}>SECTOR: {team.area} &nbsp;·&nbsp; ID: {team.id}</div>
                    <div style={{ fontSize: "0.75rem", marginTop: 8, fontWeight: 700, letterSpacing: '0.05em' }}>
                        <span style={{ color: team.available ? "var(--success)" : "var(--accent)", textTransform: 'uppercase' }}>
                            {team.available ? "Ready for Dispatch" : "On Active Deployment"}
                        </span>
                    </div>
                </div>
                <div>
                    <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Deployment Coordinates</div>
                    <div className="location-update">
                        <input placeholder="LAT" value={lat} onChange={e => setLat(e.target.value)} style={{ fontFamily: 'var(--fm)' }} />
                        <input placeholder="LON" value={lon} onChange={e => setLon(e.target.value)} style={{ fontFamily: 'var(--fm)' }} />
                        <button onClick={autoLocation} style={{ background: "var(--info)", border: "none", color: "white", padding: "6px 14px", borderRadius: 8, cursor: "pointer", fontSize: "0.8rem", fontWeight: 700 }}>
                            GPS
                        </button>
                        <button onClick={updateLocation} style={{ background: 'var(--coral)', border: 'none', color: 'white', padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase' }}>Update</button>
                    </div>
                    {locMsg && <div style={{ fontSize: "0.8rem", marginTop: 8, color: "var(--success)", fontWeight: 600 }}>{locMsg}</div>}
                </div>
            </div>

            {error && <div className="error-banner" style={{ marginBottom: "1rem" }}>⚠️ {error}</div>}

            {loading ? (
                <div className="loading">Initializing unit link...</div>
            ) : incidents.length === 0 ? (
                <div className="empty-state">
                    All sectors clear. No active incidents.
                    <small style={{ color: "var(--muted)" }}>You'll see new assignments here automatically.</small>
                </div>
            ) : (
                <>
                    {/* Active incidents — top priority */}
                    {active.length > 0 && (
                        <div style={{ marginBottom: "2rem" }}>
                            <div className="section-title" style={{ marginBottom: "1rem", color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                Active Assignments ({active.length})
                            </div>
                            <div className="reports-list">
                                {active.map(i => <IncidentCard key={i.id} incident={i} teamId={team.id}
                                    onAction={doAction} actioning={actioning} formatDate={formatDate} />)}
                            </div>
                        </div>
                    )}

                    {/* Assigned — needs acceptance */}
                    {assigned.length > 0 && (
                        <div style={{ marginBottom: "2rem" }}>
                            <div className="section-title" style={{ marginBottom: "1rem", color: 'var(--purple)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                New Dispatch Requests ({assigned.length})
                            </div>
                            <div className="reports-list">
                                {assigned.map(i => <IncidentCard key={i.id} incident={i} teamId={team.id}
                                    onAction={doAction} actioning={actioning} formatDate={formatDate} />)}
                            </div>
                        </div>
                    )}

                    {/* Resolved history */}
                    {resolved.length > 0 && (
                        <div style={{ opacity: 0.7 }}>
                            <div className="section-title" style={{ marginBottom: "1rem", color: 'var(--success)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                Resolved History ({resolved.length})
                            </div>
                            <div className="reports-list">
                                {resolved.map(i => <IncidentCard key={i.id} incident={i} teamId={team.id}
                                    onAction={doAction} actioning={actioning} formatDate={formatDate} />)}
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

function IncidentCard({ incident: i, teamId, onAction, actioning, formatDate }) {
    const SEV_LABEL = { critical: "Critical", high: "High", medium: "Medium", low: "Low" };
    const isResolved = i.status === "resolved";

    const getProxiedUrl = (url) => {
        if (!url) return "";
        // Replace S3 host with CloudFront host if present
        return url.replace("disaster-response-uploads.s3.ap-south-1.amazonaws.com", "d2lbf1bpfshpl4.cloudfront.net");
    };

    return (
        <div className="rescue-incident"
            style={{
                borderLeft: i.status === "active" ? "4px solid var(--accent)" :
                    i.status === "assigned" ? "4px solid var(--purple)" : "4px solid var(--success)"
            }}>
            <div className="rescue-incident-header">
                <div>
                    <div style={{ fontFamily: "var(--fd)", fontWeight: 700, fontSize: "1.1rem", textTransform: 'uppercase' }}>
                        {i.disaster_type?.replace("_", " ")}
                    </div>
                    <div style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: 6, fontFamily: 'var(--fm)' }}>
                        SEC: {i.location} &nbsp;·&nbsp; TIME: {formatDate(i.created_at)}
                    </div>
                </div>
                <span className={`severity-badge ${i.severity}`}>{SEV_LABEL[i.severity] || i.severity}</span>
            </div>

            <div style={{ fontSize: "0.85rem" }}>{i.description}</div>

            {i.reporter_name !== "Anonymous" && (
                <div style={{ fontSize: "0.85rem", color: "var(--muted)", borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 8 }}>
                    REPORTER: {i.reporter_name}
                    {i.reporter_phone && ` · CONTACT: ${i.reporter_phone}`}
                </div>
            )}

            {i.latitude && i.longitude && (
                <a href={`https://maps.google.com/?q=${i.latitude},${i.longitude}`}
                    target="_blank" rel="noreferrer"
                    style={{ fontSize: "0.8rem", color: "var(--info)", textDecoration: 'none', fontWeight: 600, display: 'inline-block', marginTop: 8 }}>
                    OPEN MISSION MAP
                </a>
            )}

            {i.image_url && (
                <a href={getProxiedUrl(i.image_url)} target="_blank" rel="noreferrer"
                    style={{ fontSize: "0.8rem", color: "var(--info)", textDecoration: 'none', fontWeight: 600, display: 'inline-block', marginLeft: 16 }}>
                    VIEW INTEL
                </a>
            )}

            {/* Action buttons */}
            {!isResolved && (
                <div className="rescue-actions">
                    {i.status === "assigned" && (
                        <button className="action-btn accept"
                            disabled={!!actioning}
                            onClick={() => onAction(i.id, "accept")}>
                            {actioning === i.id + "accept" ? "..." : "Accept Deployment"}
                        </button>
                    )}
                    {i.status === "active" && (
                        <button className="action-btn resolve"
                            disabled={!!actioning}
                            onClick={() => onAction(i.id, "resolve")}>
                            {actioning === i.id + "resolve" ? "..." : "Resolve Mission"}
                        </button>
                    )}
                </div>
            )}

            {isResolved && (
                <div style={{ fontSize: "0.8rem", color: "var(--success)", fontWeight: 700, textTransform: 'uppercase', marginTop: 12 }}>Mission Resolved</div>
            )}

            <div className="report-id" style={{ fontFamily: 'var(--fm)', letterSpacing: '0.05em' }}>REPORT #{i.id}</div>
        </div>
    );
}