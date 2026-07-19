import { api } from '../lib/apiClient';

export function createSession({ title, documentIds } = {}) {
    return api.post('/chat/sessions', {
        title: title || null,
        document_ids: documentIds?.length ? documentIds : null,
    });
}

export function listSessions() {
    return api.get('/chat/sessions');
}

export function getSession(sessionId) {
    return api.get(`/chat/sessions/${sessionId}`);
}

export function ask(sessionId, { question, useWebSearch = false }) {
    return api.post(`/chat/sessions/${sessionId}/ask`, {
        question,
        use_web_search: useWebSearch,
    });
}

export function deleteSession(sessionId) {
    return api.delete(`/chat/sessions/${sessionId}`);
}
