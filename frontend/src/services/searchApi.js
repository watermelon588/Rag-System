import { api } from '../lib/apiClient';

/**
 * Multimodal search: text, file (image/audio), or both.
 * Returns the full transparency payload: interpretation, per-result
 * relevance analysis, overall confidence and pipeline metadata.
 *
 * @param {{ query?: string, file?: File, categories?: string[], limit?: number, signal?: AbortSignal }} options
 */
export async function search({ query, file, categories, limit, signal } = {}) {
    const formData = new FormData();
    if (query) formData.append('query', query);
    if (file) formData.append('file', file);
    if (categories?.length) formData.append('categories', categories.join(','));
    if (limit) formData.append('limit', String(limit));
    return api.postForm('/search', formData, { signal, auth: false });
}
