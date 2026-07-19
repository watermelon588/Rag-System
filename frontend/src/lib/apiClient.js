/**
 * Central HTTP client for the platform API.
 *
 * Responsibilities:
 *  - prefix every call with the versioned base URL
 *  - attach the bearer token when present
 *  - transparently refresh an expired access token once, then retry
 *  - normalise the backend's error envelope into ApiError
 */

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';
const API_PREFIX = '/api/v1';

const ACCESS_KEY = 'auth.access_token';
const REFRESH_KEY = 'auth.refresh_token';

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

/* ── token storage ─────────────────────────────────────────────── */

export const tokenStore = {
    get access() { return localStorage.getItem(ACCESS_KEY); },
    get refresh() { return localStorage.getItem(REFRESH_KEY); },
    set({ access_token, refresh_token }) {
        localStorage.setItem(ACCESS_KEY, access_token);
        localStorage.setItem(REFRESH_KEY, refresh_token);
    },
    clear() {
        localStorage.removeItem(ACCESS_KEY);
        localStorage.removeItem(REFRESH_KEY);
    },
};

/* ── internals ─────────────────────────────────────────────────── */

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

async function refreshTokens() {
    // Deduplicate concurrent refresh attempts.
    if (!refreshPromise) {
        refreshPromise = (async () => {
            const refresh = tokenStore.refresh;
            if (!refresh) throw new ApiError('Not authenticated', { status: 401 });
            const response = await fetch(`${BASE_URL}${API_PREFIX}/auth/refresh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refresh_token: refresh }),
            });
            if (!response.ok) {
                tokenStore.clear();
                throw await parseError(response);
            }
            const tokens = await response.json();
            tokenStore.set(tokens);
            return tokens;
        })().finally(() => { refreshPromise = null; });
    }
    return refreshPromise;
}

async function request(path, { method = 'GET', body, formData, signal, auth = true, retried = false } = {}) {
    const headers = {};
    if (auth && tokenStore.access) headers.Authorization = `Bearer ${tokenStore.access}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    const response = await fetch(`${BASE_URL}${API_PREFIX}${path}`, {
        method,
        headers,
        body: formData ?? (body !== undefined ? JSON.stringify(body) : undefined),
        signal,
    });

    if (response.status === 401 && auth && tokenStore.refresh && !retried) {
        await refreshTokens();
        return request(path, { method, body, formData, signal, auth, retried: true });
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
