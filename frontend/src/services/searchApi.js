import { api } from '../lib/apiClient';

/**
 * Multimodal search: text and/or any combination of files (images, audio,
 * video). All inputs are fused server-side into one CLIP cross-modal query
 * vector plus a keyword query. Returns the full transparency payload:
 * interpretation, per-result relevance analysis, overall confidence and
 * pipeline metadata.
 *
 * @param {{ query?: string, files?: File[], categories?: string[], limit?: number, page?: number, signal?: AbortSignal }} options
 */
export async function search({ query, files, categories, limit, page, signal } = {}) {
    const formData = new FormData();
    if (query) formData.append('query', query);
    for (const file of files ?? []) {
        if (file) formData.append('files', file);
    }
    if (categories?.length) formData.append('categories', categories.join(','));
    if (limit) formData.append('limit', String(limit));
    if (page) formData.append('page', String(page));
    return api.postForm('/search', formData, { signal, auth: false });
}
