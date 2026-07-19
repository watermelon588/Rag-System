import { api, tokenStore } from '../lib/apiClient';

export async function register({ email, displayName, password }) {
    const data = await api.post('/auth/register', {
        email,
        display_name: displayName,
        password,
    }, { auth: false });
    tokenStore.set(data.tokens);
    return data.user;
}

export async function login({ email, password }) {
    const data = await api.post('/auth/login', { email, password }, { auth: false });
    tokenStore.set(data.tokens);
    return data.user;
}

export async function fetchProfile() {
    return api.get('/auth/me');
}

export function logout() {
    tokenStore.clear();
}

export function isAuthenticated() {
    return Boolean(tokenStore.access);
}
