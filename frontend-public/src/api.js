export const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

export async function apiFetch(path, options = {}, token = null) {
    const headers = { ...options.headers };
    if (token) headers["X-Role-Token"] = token;
    if (options.body && typeof options.body === "object" && !(options.body instanceof FormData)) {
        headers["Content-Type"] = "application/json";
        options.body = JSON.stringify(options.body);
    }
    const res = await fetch(`${API}${path}`, { ...options, headers });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Request failed");
    return data;
}