import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as authApi from '../services/authApi';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [initializing, setInitializing] = useState(true);

    useEffect(() => {
        let cancelled = false;
        async function bootstrap() {
            if (!authApi.isAuthenticated()) {
                setInitializing(false);
                return;
            }
            try {
                const profile = await authApi.fetchProfile();
                if (!cancelled) setUser(profile);
            } catch {
                authApi.logout(); // stale/invalid tokens
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

    const logout = useCallback(() => {
        authApi.logout();
        setUser(null);
    }, []);

    const value = useMemo(
        () => ({ user, initializing, login, register, logout }),
        [user, initializing, login, register, logout],
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components -- co-locating the hook with its provider is intentional
export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) throw new Error('useAuth must be used within AuthProvider');
    return context;
}
