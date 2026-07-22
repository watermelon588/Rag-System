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

/* ── Avatar upload (browser → Cloudinary, signed by our API) ───────────── */

const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

/**
 * Upload an avatar image straight to Cloudinary using a short-lived
 * signature from our API, then persist the resulting URL on the profile.
 *
 * The image bytes never pass through our server, and the Cloudinary API
 * secret never reaches the browser.
 *
 * @param {File} file
 * @returns {Promise<string>} the secure Cloudinary URL
 */
export async function uploadAvatar(file) {
    if (!file) throw new Error('No image selected.');
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
        throw new Error('Please choose a PNG, JPG, WEBP or GIF image.');
    }

    const sig = await api.post('/profile/avatar-signature');

    if (file.size > sig.max_bytes) {
        throw new Error(`Image is too large (max ${Math.round(sig.max_bytes / 1024 / 1024)} MB).`);
    }

    const form = new FormData();
    form.append('file', file);
    form.append('api_key', sig.api_key);
    form.append('timestamp', String(sig.timestamp));
    form.append('folder', sig.folder);
    form.append('signature', sig.signature);

    // Direct to Cloudinary — deliberately NOT through our apiClient, which
    // would prefix our API base URL and attach our session cookies.
    const response = await fetch(sig.upload_url, { method: 'POST', body: form });
    if (!response.ok) {
        let detail = '';
        try {
            detail = (await response.json())?.error?.message || '';
        } catch { /* non-JSON error */ }

        // Cloudinary rejects the key itself rather than the request — no amount
        // of retrying helps, so say what actually needs changing.
        if (response.status === 401 || response.status === 403 || /missing permissions/i.test(detail)) {
            throw new Error(
                'Cloudinary rejected the upload: this API key lacks asset-create permission. ' +
                'In the Cloudinary console open Settings → API Keys and enable write/upload access ' +
                'for the key (or use the account\'s master key).'
            );
        }
        throw new Error(detail || `Upload failed (${response.status}).`);
    }

    const { secure_url: secureUrl } = await response.json();
    if (!secureUrl) throw new Error('Upload succeeded but no image URL was returned.');

    await updateProfile({ avatarUrl: secureUrl });
    return secureUrl;
}
