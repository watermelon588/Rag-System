import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as authApi from '../services/authApi';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [initializing, setInitializing] = useState(true);

    useEffect(() => {
        let cancelled = false;
        async function bootstrap() {
            // Auth lives in httpOnly cookies the client can't read, so we ask
            // the server who we are. A 401 simply means "not signed in".
            try {
                const profile = await authApi.fetchProfile();
                if (!cancelled) setUser(profile);
            } catch {
                if (!cancelled) setUser(null);
            } finally {
                if (!cancelled) setInitializing(false);
            }
        }
        bootstrap();
        return () => { cancelled = true; };
    }, []);

    const login = useCallback(async (credentials) => {
        const profile = await authApi.login(credentials);
        setUser(profile);
        return profile;
    }, []);

    const register = useCallback(async (details) => {
        const profile = await authApi.register(details);
        setUser(profile);
        return profile;
    }, []);

    const logout = useCallback(async () => {
        await authApi.logout();
        setUser(null);
    }, []);

    // Replace the cached user (e.g. after a profile edit) so the whole app
    // reflects the new display name / avatar without a full reload.
    const updateUser = useCallback((profile) => {
        setUser(prev => (profile ? { ...prev, ...profile } : prev));
    }, []);

    const refreshProfile = useCallback(async () => {
        const profile = await authApi.fetchProfile();
        setUser(profile);
        return profile;
    }, []);

    const value = useMemo(
        () => ({ user, initializing, login, register, logout, updateUser, refreshProfile }),
        [user, initializing, login, register, logout, updateUser, refreshProfile],
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components -- co-locating the hook with its provider is intentional
export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) throw new Error('useAuth must be used within AuthProvider');
    return context;
}
