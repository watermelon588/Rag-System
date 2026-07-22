/**
 * Module-level store for pending file uploads.
 * File objects can't live in URLs or sessionStorage, so we keep a simple
 * in-memory reference (an array — genuine multimodal search accepts several
 * files at once) that survives React-Router navigation.
 */
let _pendingFiles = [];

export function setPendingFiles(files) {
    _pendingFiles = Array.isArray(files) ? files.filter(Boolean) : [];
}

export function getPendingFiles() {
    return _pendingFiles;
}

export function clearPendingFiles() {
    _pendingFiles = [];
}
