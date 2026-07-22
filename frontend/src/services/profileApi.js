import { api } from '../lib/apiClient';

/**
 * Profile: edit account, change password, view stats, and manage the
 * per-user search history and saved results. All endpoints require an
 * authenticated (cookie) session.
 */

export async function updateProfile({ displayName, bio, avatarUrl } = {}) {
    const body = {};
    if (displayName !== undefined) body.display_name = displayName;
    if (bio !== undefined) body.bio = bio;
    if (avatarUrl !== undefined) body.avatar_url = avatarUrl;
    return api.patch('/auth/me', body);
}

export async function changePassword({ currentPassword, newPassword }) {
    return api.post('/auth/change-password', {
        current_password: currentPassword,
        new_password: newPassword,
    });
}

export async function fetchStats() {
    return api.get('/auth/me/stats');
}

export async function fetchHistory() {
    return api.get('/profile/history');
}

export async function deleteHistoryEntry(id) {
    return api.delete(`/profile/history/${id}`);
}

export async function clearHistory() {
    return api.delete('/profile/history');
}

export async function fetchSaved() {
    return api.get('/profile/saved');
}

export async function saveResult(result) {
    return api.post('/profile/saved', result);
}

export async function deleteSaved(id) {
    return api.delete(`/profile/saved/${id}`);
}
