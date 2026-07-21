import { api } from '../lib/apiClient';

/**
 * Auth is cookie-based: these endpoints set/clear httpOnly cookies that the
 * browser sends automatically. We never handle raw tokens on the client.
 */

export async function register({ email, displayName, password }) {
    const data = await api.post('/auth/register', {
        email,
        display_name: displayName,
        password,
    }, { auth: false });
    return data.user;
}

export async function login({ email, password }) {
    const data = await api.post('/auth/login', { email, password }, { auth: false });
    return data.user;
}

export async function fetchProfile() {
    return api.get('/auth/me');
}

export async function logout() {
    try {
        await api.post('/auth/logout', undefined, { auth: false });
    } catch {
        /* clearing the session is best-effort */
    }
}
