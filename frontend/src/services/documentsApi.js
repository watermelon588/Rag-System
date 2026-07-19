import { api } from '../lib/apiClient';

export function uploadDocument(file) {
    const formData = new FormData();
    formData.append('file', file);
    return api.postForm('/documents', formData);
}

export function listDocuments() {
    return api.get('/documents');
}

export function getDocumentChunks(documentId) {
    return api.get(`/documents/${documentId}/chunks`);
}

export function queryDocuments({ query, documentIds, topK = 6 }) {
    return api.post('/documents/query', {
        query,
        document_ids: documentIds?.length ? documentIds : null,
        top_k: topK,
    });
}

export function deleteDocument(documentId) {
    return api.delete(`/documents/${documentId}`);
}
