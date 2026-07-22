import { useCallback, useSyncExternalStore } from 'react';

/**
 * Subscribe to a CSS media query from JS.
 *
 * Most responsive work in this app is done with CSS token overrides in
 * index.css. This hook is for the cases where the *structure* has to change
 * (e.g. the navbar collapsing into a menu), which inline styles can't express.
 *
 * Implemented with useSyncExternalStore — matchMedia is an external store, so
 * this stays correct without an effect that mirrors it into state.
 *
 * @param {string} query e.g. '(max-width: 640px)'
 */
export function useMediaQuery(query) {
    const subscribe = useCallback((onChange) => {
        const list = window.matchMedia(query);
        list.addEventListener('change', onChange);
        return () => list.removeEventListener('change', onChange);
    }, [query]);

    const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query]);

    // Server/prerender has no viewport; assume desktop.
    const getServerSnapshot = useCallback(() => false, []);

    return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Convenience wrapper for the app's phone breakpoint. */
export function useIsMobile() {
    return useMediaQuery('(max-width: 640px)');
}
