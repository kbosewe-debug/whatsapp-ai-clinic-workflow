const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:3000").replace(/\/$/, "");

const SESSION_KEY = "clinicflow_admin_api_key";
const CLINIC_KEY = "clinicflow_clinic_id";

export function getApiKey() {
  return sessionStorage.getItem(SESSION_KEY) || "";
}

export function setApiKey(value) {
  sessionStorage.setItem(SESSION_KEY, value);
}

export function clearApiKey() {
  sessionStorage.removeItem(SESSION_KEY);
}

export function getClinicId() {
  return localStorage.getItem(CLINIC_KEY) || "";
}

export function setClinicId(value) {
  localStorage.setItem(CLINIC_KEY, value);
}

export async function apiFetch(path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set("Content-Type", "application/json");

  const apiKey = getApiKey();
  if (apiKey) headers.set("x-admin-api-key", apiKey);

  const clinicId = getClinicId();
  const url = new URL(`${API_URL}${path}`);
  if (clinicId) url.searchParams.set("clinicId", clinicId);

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    throw new Error("UNAUTHORIZED");
  }

  if (response.status === 204) return null;

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const message = typeof payload === "string"
      ? payload
      : payload?.details || payload?.error || "Request failed.";
    throw new Error(message);
  }

  return payload;
}

export { API_URL };
