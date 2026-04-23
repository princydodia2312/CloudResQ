import { useState } from "react";
import { API, apiFetch } from "./api";

const DISASTER_EMOJI = {
    flood: "🌊", fire: "🔥", earthquake: "🏚️", cyclone: "🌪️",
    landslide: "⛰️", building_collapse: "🏗️", chemical: "☣️", other: "🚨"
};

const SEV_COLOR = { critical: "var(--accent)", high: "var(--coral)", medium: "var(--warning)", low: "var(--success)" };

export default function UserPage({ view }) {
    return view === "track" ? <TrackReport /> : <ReportForm />;
}

function ReportForm() {
    const [form, setForm] = useState({
        disaster_type: "", location: "", latitude: "", longitude: "",
        severity: "", description: "", reporter_name: "", reporter_phone: ""
    });
    const [image, setImage] = useState(null);
    const [submitting, setSub] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState("");
    const [locLoading, setLocLoading] = useState(false);

    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

    const getLocation = () => {
        if (!navigator.geolocation) { setError("Geolocation not supported"); return; }
        setLocLoading(true);
        navigator.geolocation.getCurrentPosition(
            pos => {
                set("latitude", pos.coords.latitude.toFixed(6));
                set("longitude", pos.coords.longitude.toFixed(6));
                setLocLoading(false);
            },
            () => { setError("Could not get location"); setLocLoading(false); }
        );
    };

    const handleSubmit = async () => {
        if (!form.disaster_type || !form.location || !form.severity || !form.description) {
            setError("Please fill all required fields."); return;
        }
        setSub(true); setError("");
        const fd = new FormData();
        Object.entries(form).forEach(([k, v]) => v && fd.append(k, v));
        if (image) fd.append("image", image);
        try {
            const res = await fetch(`${API}/api/reports`, { method: "POST", body: fd });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Submission failed");
            setResult(data);
        } catch (e) {
            setError(e.message);
        } finally {
            setSub(false);
        }
    };

    if (result) return (
        <div className="form-page">
            <div className="success-banner">
                <div style={{ marginBottom: 8 }}>✅ Report submitted successfully!</div>
                <div>Your Report ID: <strong style={{ fontFamily: "monospace", fontSize: "1.1rem" }}>#{result.report_id}</strong></div>
                <div style={{ marginTop: 6, fontSize: "0.85rem" }}>
                    {result.assigned_team
                        ? `🚑 Team "${result.assigned_team}" has been auto-dispatched to your location!`
                        : "⏳ Your report is pending — rescue teams will be assigned shortly."}
                </div>
                <div style={{ marginTop: 8, fontSize: "0.82rem", color: "var(--muted)" }}>
                    Save your Report ID to track status later using the Track Report tab.
                </div>
            </div>
        </div>
    );

    return (
        <div className="form-page">
            <div className="form-heading">🚨 Report an Emergency</div>
            <p className="form-sub">Fill this form to alert rescue teams. All required fields are marked *</p>
            <div className="card">
                <div className="form-grid">

                    <div className="form-group">
                        <label>Disaster Type *</label>
                        <select value={form.disaster_type} onChange={e => set("disaster_type", e.target.value)}>
                            <option value="">Select type...</option>
                            <option value="flood">🌊 Flood</option>
                            <option value="fire">🔥 Fire</option>
                            <option value="earthquake">🏚️ Earthquake</option>
                            <option value="cyclone">🌪️ Cyclone</option>
                            <option value="landslide">⛰️ Landslide</option>
                            <option value="building_collapse">🏗️ Building Collapse</option>
                            <option value="chemical">☣️ Chemical Hazard</option>
                            <option value="other">🚨 Other</option>
                        </select>
                    </div>

                    <div className="form-group">
                        <label>Severity *</label>
                        <select value={form.severity} onChange={e => set("severity", e.target.value)}
                            style={{ borderColor: form.severity ? SEV_COLOR[form.severity] : "" }}>
                            <option value="">Select severity...</option>
                            <option value="low">🟢 Low — Minor incident</option>
                            <option value="medium">🟡 Medium — Needs attention</option>
                            <option value="high">🟠 High — Urgent response needed</option>
                            <option value="critical">🔴 Critical — Life threatening</option>
                        </select>
                    </div>

                    <div className="form-group full">
                        <label>Location / Address *</label>
                        <input placeholder="e.g. Sector 12, Gandhi Nagar, Ahmedabad"
                            value={form.location} onChange={e => set("location", e.target.value)} />
                    </div>

                    <div className="form-group">
                        <label>Latitude</label>
                        <input type="number" placeholder="Auto-fill →"
                            value={form.latitude} onChange={e => set("latitude", e.target.value)} />
                    </div>

                    <div className="form-group">
                        <label>Longitude</label>
                        <div style={{ display: "flex", gap: 6 }}>
                            <input type="number" placeholder="Auto-fill →"
                                value={form.longitude} onChange={e => set("longitude", e.target.value)} />
                            <button type="button" onClick={getLocation} disabled={locLoading}
                                style={{ background: "var(--info)", border: "none", color: "white", padding: "0 12px", borderRadius: 8, cursor: "pointer", whiteSpace: "nowrap", fontSize: "0.8rem" }}>
                                {locLoading ? "..." : "📍 GPS"}
                            </button>
                        </div>
                    </div>

                    <div className="form-group full">
                        <label>Description *</label>
                        <textarea placeholder="Describe the situation — number of people, hazards, access routes..."
                            value={form.description} onChange={e => set("description", e.target.value)} />
                    </div>

                    <div className="form-group">
                        <label>Your Name</label>
                        <input placeholder="Reporter name"
                            value={form.reporter_name} onChange={e => set("reporter_name", e.target.value)} />
                    </div>

                    <div className="form-group">
                        <label>Phone Number</label>
                        <input placeholder="+91 XXXXXXXXXX"
                            value={form.reporter_phone} onChange={e => set("reporter_phone", e.target.value)} />
                    </div>

                    <div className="form-group full">
                        <label>Upload Image / Video (optional)</label>
                        <input type="file" accept="image/*,video/*"
                            onChange={e => setImage(e.target.files[0])} />
                    </div>
                </div>

                {form.severity === "critical" && (
                    <div className="info-banner" style={{ marginTop: "1rem" }}>
                        🔴 Critical severity — if GPS coordinates are provided, the nearest rescue team will be <strong>automatically dispatched</strong>.
                    </div>
                )}

                {error && <div className="error-banner">⚠️ {error}</div>}
                <button className="submit-btn" onClick={handleSubmit} disabled={submitting}>
                    {submitting ? "⏳ Submitting..." : "🚨 Submit Emergency Report"}
                </button>
            </div>
        </div>
    );
}

function TrackReport() {
    const [reportId, setReportId] = useState("");
    const [report, setReport] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const track = async () => {
        if (!reportId.trim()) return;
        setLoading(true); setError(""); setReport(null);
        try {
            const data = await apiFetch(`/api/reports/${reportId.trim().toUpperCase()}`);
            setReport(data);
        } catch (e) {
            setError("Report not found. Check your Report ID and try again.");
        } finally {
            setLoading(false);
        }
    };

    const formatDate = iso => new Date(iso + "Z").toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
    const SEV = { critical: "🔴", high: "🟠", medium: "🟡", low: "🟢" };
    const STA = { pending: "⏳ Pending", assigned: "🚑 Team Assigned", active: "🔄 Response Active", resolved: "✅ Resolved" };

    return (
        <div className="form-page">
            <div className="form-heading">🔍 Track Your Report</div>
            <p className="form-sub">Enter your Report ID to check the current status.</p>

            <div className="track-box">
                <input placeholder="Enter Report ID (e.g. A1B2C3D4)"
                    value={reportId} onChange={e => setReportId(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && track()} />
                <button onClick={track} disabled={loading}>
                    {loading ? "..." : "Track"}
                </button>
            </div>

            {error && <div className="error-banner">⚠️ {error}</div>}

            {report && (
                <div className="track-result">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                        <div style={{ fontFamily: "var(--fd)", fontSize: "1.1rem", fontWeight: 700 }}>
                            {DISASTER_EMOJI[report.disaster_type] || "🚨"} {report.disaster_type?.replace("_", " ").replace(/\b\w/g, c => c.toUpperCase())}
                        </div>
                        <span className={`status-badge ${report.status}`}>{STA[report.status] || report.status}</span>
                    </div>
                    {[
                        ["Report ID", `#${report.id}`],
                        ["Severity", `${SEV[report.severity] || ""} ${report.severity}`],
                        ["Location", report.location],
                        ["Description", report.description],
                        ["Reported by", report.reporter_name],
                        ["Submitted at", formatDate(report.created_at)],
                        ...(report.assigned_team_name ? [["Assigned team", `🚑 ${report.assigned_team_name}`]] : []),
                        ...(report.assigned_at ? [["Assigned at", formatDate(report.assigned_at)]] : []),
                    ].map(([k, v]) => (
                        <div key={k} className="track-field">
                            <strong>{k}</strong><span>{v}</span>
                        </div>
                    ))}
                    {report.image_url && (
                        <div style={{ marginTop: 12 }}>
                            <img src={report.image_url} alt="Disaster"
                                style={{ width: "100%", borderRadius: 8, maxHeight: 300, objectFit: "cover" }} />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}