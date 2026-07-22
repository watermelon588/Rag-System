import { api } from '../lib/apiClient';

/**
 * Submit product feedback. Public — an email is optional, and when the
 * visitor is signed in the server attaches their account instead.
 *
 * @param {{ message: string, email?: string }} payload
 */
export async function submitFeedback({ message, email }) {
    return api.post('/feedback', {
        message,
        email: email?.trim() ? email.trim() : null,
    }, { auth: false });
}
