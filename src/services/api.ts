const API_BASE_URL = (import.meta.env.VITE_API_URL || 'https://crm-evr-api.onrender.com').replace(/\/+$/, '');

export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${API_BASE_URL}${path}`, init);
}