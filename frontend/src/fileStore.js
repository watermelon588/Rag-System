/**
 * Module-level store for the pending file upload.
 * File objects can't live in URLs or sessionStorage, so we keep
 * a simple in-memory reference that survives React-Router navigation.
 */
let _pendingFile = null;

export function setPendingFile(file) {
    _pendingFile = file;
}

export function getPendingFile() {
    return _pendingFile;
}

export function clearPendingFile() {
    _pendingFile = null;
}
