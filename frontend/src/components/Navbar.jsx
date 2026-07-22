import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { useIsMobile } from '../hooks/useMediaQuery';
import BrandMark from './BrandMark';

const NAV_LINKS = [
    { label: 'Home', to: '/' },
    { label: 'Explore', to: '/search' },
    { label: 'Documents', to: '/documents', protected: true },
    { label: 'Chat', to: '/chat', protected: true },
];

export default function Navbar() {
    const location = useLocation();
    const navigate = useNavigate();
    const { user, logout } = useAuth();
    const isMobile = useIsMobile();
    const [menuOpen, setMenuOpen] = useState(false);

    // Reset the menu when we grow back to desktop, using React's documented
    // "adjust state during render" pattern rather than an effect — so the menu
    // can't reappear stale if the viewport shrinks again.
    const [wasMobile, setWasMobile] = useState(isMobile);
    if (wasMobile !== isMobile) {
        setWasMobile(isMobile);
        setMenuOpen(false);
    }

    const visibleLinks = NAV_LINKS.filter(l => !l.protected || user);
    const closeMenu = () => setMenuOpen(false);

    return (
        <motion.header
            initial={{ y: -24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.55, ease: 'easeOut' }}
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                zIndex: 50,
                height: 'var(--nav-height)',
                display: 'flex',
                alignItems: 'center',
                background: 'rgba(6, 7, 10, 0.38)',
                backdropFilter: 'blur(var(--blur-glass))',
                WebkitBackdropFilter: 'blur(var(--blur-glass))',
                borderBottom: '1px solid var(--border)',
            }}
        >
            <div style={{
                maxWidth: '1152px',
                margin: '0 auto',
                padding: '0 24px',
                width: '100%',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
            }}>

                {/* Logo */}
                <Link
                    to="/"
                    aria-label="Neuron — home"
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        textDecoration: 'none',
                        transition: 'opacity 0.2s ease',
                    }}
                    onMouseEnter={e => e.currentTarget.style.opacity = '0.8'}
                    onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                >
                    <BrandMark size={26} nameSize="17px" />
                </Link>

                {/* Nav links — replaced by the menu button on phones */}
                <nav style={{ display: isMobile ? 'none' : 'flex', alignItems: 'center', gap: '32px' }}>
                    {NAV_LINKS.map(({ label, to, protected: needsAuth }) => {
                        if (needsAuth && !user) return null;
                        const active = location.pathname === to;
                        return (
                            <Link
                                key={label}
                                to={to}
                                style={{
                                    fontSize: '13.5px',
                                    fontWeight: active ? 600 : 400,
                                    color: active ? '#ffffff' : 'rgba(255,255,255,0.5)',
                                    textDecoration: 'none',
                                    letterSpacing: '0.01em',
                                    transition: 'color 0.2s ease, font-weight 0.2s ease',
                                    position: 'relative',
                                }}
                                onMouseEnter={e => { if (!active) e.currentTarget.style.color = 'rgba(255,255,255,0.9)'; }}
                                onMouseLeave={e => { if (!active) e.currentTarget.style.color = 'rgba(255,255,255,0.5)'; }}
                            >
                                {label}
                                {active && (
                                    <span style={{
                                        position: 'absolute',
                                        bottom: '-4px',
                                        left: '0',
                                        right: '0',
                                        height: '2px',
                                        borderRadius: '999px',
                                        background: 'var(--accent)',
                                        boxShadow: '0 0 8px var(--accent-glow)',
                                    }} />
                                )}
                            </Link>
                        );
                    })}
                </nav>

                {/* Menu button — phones only */}
                {isMobile && (
                    <button
                        type="button"
                        onClick={() => setMenuOpen(open => !open)}
                        aria-label={menuOpen ? 'Close menu' : 'Open menu'}
                        aria-expanded={menuOpen}
                        style={{
                            width: '38px', height: '38px', borderRadius: 'var(--radius-pill)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: menuOpen ? 'var(--surface-3)' : 'var(--surface-2)',
                            border: '1px solid var(--border)', color: 'var(--text)',
                            cursor: 'pointer', flexShrink: 0,
                        }}
                    >
                        <i className={`fa-solid ${menuOpen ? 'fa-xmark' : 'fa-bars'}`} style={{ fontSize: '15px' }} />
                    </button>
                )}

                {/* Auth area */}
                {isMobile ? null : user ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <Link
                            to="/profile"
                            title="Your profile"
                            style={{
                                display: 'flex', alignItems: 'center', gap: '9px',
                                textDecoration: 'none', color: 'rgba(255,255,255,0.75)',
                                transition: 'color 0.2s ease',
                            }}
                            onMouseEnter={e => e.currentTarget.style.color = '#fff'}
                            onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.75)'}
                        >
                            <span style={{
                                width: '28px', height: '28px', borderRadius: '50%',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                background: user.avatar_url ? 'transparent' : 'var(--accent-soft)',
                                border: '1px solid var(--accent-border)', overflow: 'hidden',
                                fontSize: '12px', fontWeight: 700, color: 'var(--accent-text)',
                            }}>
                                {user.avatar_url
                                    ? <img src={user.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    : (user.display_name?.[0] || '?').toUpperCase()}
                            </span>
                            <span style={{ fontSize: '13px' }}>{user.display_name}</span>
                        </Link>
                        <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.97 }}
                            onClick={() => { logout(); navigate('/'); }}
                            style={{
                                fontSize: '13px',
                                fontWeight: 600,
                                padding: '7px 18px',
                                borderRadius: '999px',
                                border: '1px solid rgba(255,255,255,0.18)',
                                cursor: 'pointer',
                                background: 'rgba(255,255,255,0.06)',
                                color: 'rgba(255,255,255,0.85)',
                            }}
                        >
                            Sign out
                        </motion.button>
                    </div>
                ) : (
                    <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.97 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                        onClick={() => navigate('/login')}
                        style={{
                            fontSize: '13px',
                            fontWeight: 600,
                            padding: '7px 18px',
                            borderRadius: 'var(--radius-pill)',
                            border: '1px solid var(--accent-border)',
                            cursor: 'pointer',
                            letterSpacing: '0.01em',
                            background: 'var(--accent-soft)',
                            color: 'var(--accent-text)',
                            boxShadow: '0 0 0 1px rgba(var(--accent-rgb),0.05), 0 4px 16px rgba(var(--accent-rgb),0.10)',
                        }}
                    >
                        Sign in
                    </motion.button>
                )}

            </div>

            {/* ── Mobile menu panel ─────────────────────────────────────── */}
            <AnimatePresence>
                {isMobile && menuOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                        style={{
                            position: 'absolute', top: 'var(--nav-height)', left: 0, right: 0,
                            background: 'rgba(6,7,10,0.98)',
                            borderBottom: '1px solid var(--border-strong)',
                            boxShadow: 'var(--shadow-pop)',
                            padding: '12px 16px 18px',
                            display: 'flex', flexDirection: 'column', gap: '4px',
                        }}
                    >
                        {visibleLinks.map(({ label, to }) => {
                            const active = location.pathname === to;
                            return (
                                <Link
                                    key={label}
                                    to={to}
                                    onClick={closeMenu}
                                    style={{
                                        padding: '13px 14px', borderRadius: 'var(--radius-sm)',
                                        textDecoration: 'none', fontSize: 'var(--text-base)',
                                        fontWeight: active ? 600 : 500,
                                        color: active ? 'var(--accent-text)' : 'var(--text-secondary)',
                                        background: active ? 'var(--accent-soft)' : 'transparent',
                                    }}
                                >
                                    {label}
                                </Link>
                            );
                        })}

                        <div style={{ height: '1px', background: 'var(--border)', margin: '10px 0' }} />

                        {user ? (
                            <>
                                <Link
                                    to="/profile"
                                    onClick={closeMenu}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '10px',
                                        padding: '11px 14px', borderRadius: 'var(--radius-sm)',
                                        textDecoration: 'none', color: 'var(--text)',
                                        fontSize: 'var(--text-base)', fontWeight: 500,
                                    }}
                                >
                                    <span style={{
                                        width: '30px', height: '30px', borderRadius: '50%',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        background: user.avatar_url ? 'transparent' : 'var(--accent-soft)',
                                        border: '1px solid var(--accent-border)', overflow: 'hidden',
                                        fontSize: '12px', fontWeight: 700, color: 'var(--accent-text)',
                                        flexShrink: 0,
                                    }}>
                                        {user.avatar_url
                                            ? <img src={user.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                            : (user.display_name?.[0] || '?').toUpperCase()}
                                    </span>
                                    {user.display_name}
                                </Link>
                                <button
                                    type="button"
                                    onClick={() => { setMenuOpen(false); logout(); navigate('/'); }}
                                    style={{
                                        marginTop: '4px', padding: '12px', borderRadius: 'var(--radius-pill)',
                                        border: '1px solid var(--border-strong)', background: 'var(--surface-2)',
                                        color: 'var(--text)', fontSize: 'var(--text-sm)', fontWeight: 600,
                                        cursor: 'pointer', fontFamily: 'var(--font-sans)',
                                    }}
                                >
                                    Sign out
                                </button>
                            </>
                        ) : (
                            <button
                                type="button"
                                onClick={() => { setMenuOpen(false); navigate('/login'); }}
                                style={{
                                    padding: '12px', borderRadius: 'var(--radius-pill)',
                                    border: '1px solid var(--accent-border)', background: 'var(--accent-soft)',
                                    color: 'var(--accent-text)', fontSize: 'var(--text-sm)', fontWeight: 600,
                                    cursor: 'pointer', fontFamily: 'var(--font-sans)',
                                }}
                            >
                                Sign in
                            </button>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.header>
    );
}
