/**
 * Central HTTP client for the platform API — cookie + JWT based.
 *
 * Auth is carried by httpOnly cookies the browser sends automatically
 * (`credentials: 'include'`); the client never sees or stores the tokens.
 * On a 401 it transparently hits the refresh endpoint once (which rotates
 * the cookies) and retries. Requests are same-origin in dev via the Vite
 * proxy (see vite.config.js), or point at VITE_API_BASE_URL in production.
 */

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
const API_PREFIX = '/api/v1';

export class ApiError extends Error {
    constructor(message, { status, code, details, requestId } = {}) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.code = code;
        this.details = details;
        this.requestId = requestId;
    }
}

async function parseError(response) {
    let body = null;
    try { body = await response.json(); } catch { /* non-JSON error body */ }
    const err = body?.error;
    return new ApiError(err?.message || `Request failed (${response.status})`, {
        status: response.status,
        code: err?.code,
        details: err?.details,
        requestId: err?.request_id,
    });
}

let refreshPromise = null;

async function refreshSession() {
    // Deduplicate concurrent refreshes; the backend reads the refresh cookie.
    if (!refreshPromise) {
        refreshPromise = fetch(`${BASE_URL}${API_PREFIX}/auth/refresh`, {
            method: 'POST',
            credentials: 'include',
        }).then(res => {
            if (!res.ok) throw new ApiError('Session expired', { status: res.status });
            return true;
        }).finally(() => { refreshPromise = null; });
    }
    return refreshPromise;
}

async function request(path, { method = 'GET', body, formData, signal, auth = true, retried = false } = {}) {
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    const response = await fetch(`${BASE_URL}${API_PREFIX}${path}`, {
        method,
        headers,
        body: formData ?? (body !== undefined ? JSON.stringify(body) : undefined),
        credentials: 'include',
        signal,
    });

    if (response.status === 401 && auth && !retried) {
        try {
            await refreshSession();
            return request(path, { method, body, formData, signal, auth, retried: true });
        } catch {
            throw await parseError(response);
        }
    }
    if (!response.ok) throw await parseError(response);
    if (response.status === 204) return null;
    return response.json();
}

export const api = {
    get: (path, options) => request(path, { ...options, method: 'GET' }),
    post: (path, body, options) => request(path, { ...options, method: 'POST', body }),
    postForm: (path, formData, options) => request(path, { ...options, method: 'POST', formData }),
    delete: (path, options) => request(path, { ...options, method: 'DELETE' }),
};
