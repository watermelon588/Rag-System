import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import Navbar from '../components/Navbar';
import { useAuth } from '../context/AuthContext';
import * as profileApi from '../services/profileApi';

const inputStyle = {
    width: '100%', padding: '11px 14px', borderRadius: '12px',
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
    color: '#fff', fontSize: '14px', outline: 'none',
    fontFamily: 'Inter, system-ui, sans-serif',
};

const labelStyle = {
    fontSize: '11px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.4)', marginBottom: '6px', display: 'block',
};

function Panel({ title, subtitle, children, style }) {
    return (
        <motion.section
            initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            style={{
                padding: '24px', borderRadius: '18px', border: '1px solid rgba(255,255,255,0.09)',
                background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(20px)', ...style,
            }}>
            {title && <h2 style={{ fontSize: '15px', fontWeight: 600, color: 'rgba(255,255,255,0.9)' }}>{title}</h2>}
            {subtitle && <p style={{ fontSize: '12.5px', color: 'rgba(255,255,255,0.4)', marginTop: '4px', marginBottom: '18px' }}>{subtitle}</p>}
            {children}
        </motion.section>
    );
}

function Toast({ toast }) {
    if (!toast) return null;
    const isError = toast.type === 'error';
    return (
        <p style={{
            fontSize: '13px', padding: '9px 13px', borderRadius: '10px', marginTop: '4px',
            color: isError ? 'rgba(252,165,165,0.95)' : 'rgba(52,211,153,0.95)',
            background: isError ? 'rgba(239,68,68,0.08)' : 'rgba(16,185,129,0.08)',
            border: `1px solid ${isError ? 'rgba(239,68,68,0.25)' : 'rgba(16,185,129,0.25)'}`,
        }}>
            {toast.message}
        </p>
    );
}

function StatTile({ label, value }) {
    return (
        <div style={{
            flex: 1, minWidth: '90px', padding: '14px 16px', borderRadius: '14px',
            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
        }}>
            <div style={{ fontSize: '24px', fontWeight: 700, color: '#fff' }}>{value ?? '—'}</div>
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginTop: '2px' }}>{label}</div>
        </div>
    );
}

const PrimaryBtn = ({ children, busy, ...props }) => (
    <button type="submit" disabled={busy} {...props}
        style={{
            padding: '10px 20px', borderRadius: '11px', border: 'none',
            background: busy ? 'rgba(255,255,255,0.4)' : '#fff', color: '#000',
            fontSize: '13.5px', fontWeight: 600, cursor: busy ? 'wait' : 'pointer',
            fontFamily: 'Inter, system-ui, sans-serif', ...props.style,
        }}>
        {busy ? 'Saving…' : children}
    </button>
);

export default function Profile() {
    const { user, updateUser } = useAuth();
    const navigate = useNavigate();

    const [stats, setStats] = useState(null);
    const [history, setHistory] = useState([]);
    const [saved, setSaved] = useState([]);

    const [displayName, setDisplayName] = useState(user?.display_name || '');
    const [bio, setBio] = useState(user?.bio || '');
    const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url || '');
    const [profileBusy, setProfileBusy] = useState(false);
    const [profileToast, setProfileToast] = useState(null);

    const [pwBusy, setPwBusy] = useState(false);
    const [pwToast, setPwToast] = useState(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const [s, h, sv] = await Promise.all([
                    profileApi.fetchStats().catch(() => null),
                    profileApi.fetchHistory().catch(() => []),
                    profileApi.fetchSaved().catch(() => []),
                ]);
                if (cancelled) return;
                setStats(s);
                setHistory(h || []);
                setSaved(sv || []);
            } catch { /* ignore */ }
        })();
        return () => { cancelled = true; };
    }, []);

    async function handleProfileSave(e) {
        e.preventDefault();
        setProfileBusy(true);
        setProfileToast(null);
        try {
            const updated = await profileApi.updateProfile({ displayName, bio, avatarUrl });
            updateUser(updated);
            setProfileToast({ type: 'success', message: 'Profile updated.' });
        } catch (err) {
            setProfileToast({ type: 'error', message: err.message });
        } finally {
            setProfileBusy(false);
        }
    }

    async function handlePasswordChange(e) {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const currentPassword = (fd.get('current') || '').toString();
        const newPassword = (fd.get('next') || '').toString();
        const confirm = (fd.get('confirm') || '').toString();
        if (newPassword !== confirm) {
            setPwToast({ type: 'error', message: 'New passwords do not match.' });
            return;
        }
        if (newPassword.length < 8) {
            setPwToast({ type: 'error', message: 'New password must be at least 8 characters.' });
            return;
        }
        setPwBusy(true);
        setPwToast(null);
        try {
            await profileApi.changePassword({ currentPassword, newPassword });
            setPwToast({ type: 'success', message: 'Password changed.' });
            e.currentTarget.reset();
        } catch (err) {
            setPwToast({ type: 'error', message: err.message });
        } finally {
            setPwBusy(false);
        }
    }

    async function removeHistory(id) {
        setHistory(prev => prev.filter(h => h.id !== id));
        try { await profileApi.deleteHistoryEntry(id); } catch { /* ignore */ }
    }

    async function clearAllHistory() {
        setHistory([]);
        try { await profileApi.clearHistory(); } catch { /* ignore */ }
    }

    async function removeSaved(id) {
        setSaved(prev => prev.filter(s => s.id !== id));
        try { await profileApi.deleteSaved(id); } catch { /* ignore */ }
    }

    function rerun(queryText) {
        navigate('/search', { state: { query: queryText, files: [], at: Date.now() } });
    }

    const joined = user?.created_at ? new Date(user.created_at).toLocaleDateString(undefined, {
        year: 'numeric', month: 'long', day: 'numeric',
    }) : '';
    const initial = (user?.display_name?.[0] || '?').toUpperCase();

    return (
        <div style={{ minHeight: '100vh', position: 'relative' }}>
            <Navbar />
            <div style={{ position: 'relative', zIndex: 10, paddingTop: 'calc(var(--nav-height) + 32px)', paddingBottom: '96px' }}>
                <div style={{ maxWidth: '860px', margin: '0 auto', padding: '0 24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

                    {/* ── Header / account summary ─────────────────────── */}
                    <Panel style={{ padding: '28px' }}>
                        <div style={{ display: 'flex', gap: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
                            <div style={{
                                width: '72px', height: '72px', borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                background: avatarUrl ? 'transparent' : 'var(--accent-soft)',
                                border: '1px solid var(--accent-border)',
                                fontSize: '28px', fontWeight: 700, color: 'var(--accent-text)',
                            }}>
                                {avatarUrl
                                    ? <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.currentTarget.style.display = 'none'; }} />
                                    : initial}
                            </div>
                            <div style={{ minWidth: 0 }}>
                                <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#fff' }}>{user?.display_name}</h1>
                                <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', marginTop: '3px' }}>{user?.email}</p>
                                {joined && <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)', marginTop: '4px' }}>Member since {joined}</p>}
                                {user?.bio && <p style={{ fontSize: '13px', color: 'rgba(209,213,219,0.85)', marginTop: '10px', lineHeight: 1.5 }}>{user.bio}</p>}
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '10px', marginTop: '22px', flexWrap: 'wrap' }}>
                            <StatTile label="Documents" value={stats?.documents} />
                            <StatTile label="Chats" value={stats?.chat_sessions} />
                            <StatTile label="Searches" value={stats?.searches} />
                            <StatTile label="Saved" value={stats?.saved_results} />
                        </div>
                    </Panel>

                    {/* ── Edit + password (two columns on wide) ────────── */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
                        <Panel title="Edit profile" subtitle="Update how you appear across the app">
                            <form onSubmit={handleProfileSave} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                <div>
                                    <label style={labelStyle}>Display name</label>
                                    <input style={inputStyle} value={displayName} onChange={e => setDisplayName(e.target.value)} maxLength={120} required />
                                </div>
                                <div>
                                    <label style={labelStyle}>Bio</label>
                                    <textarea style={{ ...inputStyle, minHeight: '72px', resize: 'vertical' }} value={bio}
                                              onChange={e => setBio(e.target.value)} maxLength={500} placeholder="A short bio (optional)" />
                                </div>
                                <div>
                                    <label style={labelStyle}>Avatar image URL</label>
                                    <input style={inputStyle} value={avatarUrl} onChange={e => setAvatarUrl(e.target.value)}
                                           maxLength={2000} placeholder="https://…" />
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <PrimaryBtn busy={profileBusy}>Save changes</PrimaryBtn>
                                </div>
                                <Toast toast={profileToast} />
                            </form>
                        </Panel>

                        <Panel title="Change password" subtitle="Use a strong, unique password">
                            <form onSubmit={handlePasswordChange} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                <div>
                                    <label style={labelStyle}>Current password</label>
                                    <input style={inputStyle} type="password" name="current" autoComplete="current-password" required />
                                </div>
                                <div>
                                    <label style={labelStyle}>New password</label>
                                    <input style={inputStyle} type="password" name="next" autoComplete="new-password" required minLength={8} />
                                </div>
                                <div>
                                    <label style={labelStyle}>Confirm new password</label>
                                    <input style={inputStyle} type="password" name="confirm" autoComplete="new-password" required minLength={8} />
                                </div>
                                <PrimaryBtn busy={pwBusy}>Update password</PrimaryBtn>
                                <Toast toast={pwToast} />
                            </form>
                        </Panel>
                    </div>

                    {/* ── Search history ───────────────────────────────── */}
                    <Panel
                        title="Search history"
                        subtitle={history.length ? `Your ${history.length} most recent searches` : 'Your searches will appear here'}>
                        {history.length > 0 && (
                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '-44px', marginBottom: '18px' }}>
                                <button type="button" onClick={clearAllHistory}
                                    style={{ fontSize: '12px', color: 'rgba(252,165,165,0.85)', background: 'transparent', border: 'none', cursor: 'pointer' }}>
                                    Clear all
                                </button>
                            </div>
                        )}
                        {history.length === 0 ? (
                            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.3)' }}>No search history yet.</p>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {history.map(h => (
                                    <div key={h.id} style={{
                                        display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px',
                                        borderRadius: '11px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
                                    }}>
                                        <span style={{
                                            fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
                                            color: 'rgba(61,139,255,0.9)', background: 'rgba(61,139,255,0.1)',
                                            border: '1px solid rgba(61,139,255,0.2)', borderRadius: '999px', padding: '2px 8px', flexShrink: 0,
                                        }}>{h.modality}</span>
                                        <button type="button" onClick={() => rerun(h.query_text)} title="Run this search again"
                                            style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer',
                                                color: 'rgba(255,255,255,0.85)', fontSize: '13.5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                fontFamily: 'Inter, system-ui, sans-serif' }}>
                                            {h.query_text}
                                        </button>
                                        <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', flexShrink: 0 }}>{h.result_count} results</span>
                                        <button type="button" onClick={() => removeHistory(h.id)} title="Remove"
                                            style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', flexShrink: 0 }}
                                            onMouseEnter={e => e.currentTarget.style.color = 'rgba(252,165,165,0.9)'}
                                            onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.3)'}>
                                            <i className="fa-solid fa-xmark" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Panel>

                    {/* ── Saved results ────────────────────────────────── */}
                    <Panel title="Saved results" subtitle={saved.length ? `${saved.length} saved` : 'Bookmark results from any search to revisit them here'}>
                        {saved.length === 0 ? (
                            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.3)' }}>Nothing saved yet.</p>
                        ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '12px' }}>
                                {saved.map(s => (
                                    <div key={s.id} style={{
                                        position: 'relative', padding: '14px', borderRadius: '12px',
                                        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
                                        display: 'flex', gap: '12px',
                                    }}>
                                        {(s.image_url || s.thumbnail_url) && (
                                            <img src={s.image_url || s.thumbnail_url} alt="" onError={e => { e.currentTarget.style.display = 'none'; }}
                                                 style={{ width: '52px', height: '52px', borderRadius: '8px', objectFit: 'cover', flexShrink: 0 }} />
                                        )}
                                        <div style={{ minWidth: 0, flex: 1 }}>
                                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '4px' }}>
                                                <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.category}</span>
                                            </div>
                                            <a href={s.url} target="_blank" rel="noopener noreferrer"
                                               style={{ fontSize: '13px', fontWeight: 600, color: '#fff', textDecoration: 'none', display: 'block',
                                                   overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {s.title || s.url}
                                            </a>
                                            {s.source && <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', marginTop: '3px' }}>{s.source}</p>}
                                        </div>
                                        <button type="button" onClick={() => removeSaved(s.id)} title="Remove"
                                            style={{ position: 'absolute', top: '8px', right: '8px', background: 'transparent', border: 'none',
                                                color: 'rgba(255,255,255,0.3)', cursor: 'pointer' }}
                                            onMouseEnter={e => e.currentTarget.style.color = 'rgba(252,165,165,0.9)'}
                                            onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.3)'}>
                                            <i className="fa-solid fa-xmark" style={{ fontSize: '12px' }} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Panel>

                </div>
            </div>
        </div>
    );
}
