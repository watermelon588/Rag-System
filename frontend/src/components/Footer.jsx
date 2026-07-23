import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { submitFeedback } from '../services/feedbackApi';
import BrandMark from './BrandMark';

/* Social destinations. */
const SOCIALS = [
    { id: 'github', label: 'GitHub', href: 'https://github.com/watermelon588', icon: 'fa-brands fa-github' },
    { id: 'x', label: 'X (Twitter)', href: 'https://x.com/turquoise_0904', icon: 'fa-brands fa-x-twitter' },
    { id: 'instagram', label: 'Instagram', href: 'https://www.instagram.com/lilm.ocha', icon: 'fa-brands fa-instagram' },
    { id: 'linkedin', label: 'LinkedIn', href: 'https://www.linkedin.com/in/maity-rohit', icon: 'fa-brands fa-linkedin-in' },
    // Discord handles aren't linkable — copy it to the clipboard instead.
    { id: 'discord', label: 'Discord: toiletduck69', handle: 'toiletduck69', icon: 'fa-brands fa-discord' },
    { id: 'email', label: 'Email', href: 'mailto:maityrohit021@gmail.com', icon: 'fa-solid fa-envelope' },
];

const NAV_LINKS = [
    { to: '/search', label: 'Search' },
    { to: '/documents', label: 'Documents' },
    { to: '/chat', label: 'Chat' },
    { to: '/profile', label: 'Profile' },
];

/* Legal links live in the footer only — deliberately kept out of the navbar. */
const LEGAL_LINKS = [
    { to: '/terms', label: 'Terms' },
    { to: '/privacy', label: 'Privacy' },
];

const inputStyle = {
    width: '100%',
    background: 'var(--surface-1)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    padding: '11px 14px',
    color: 'var(--text)',
    fontSize: 'var(--text-sm)',
    fontFamily: 'var(--font-sans)',
    outline: 'none',
    caretColor: '#fff',
    transition: 'border-color var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out)',
};

function focusRing(event) {
    event.currentTarget.style.borderColor = 'var(--accent-border)';
    event.currentTarget.style.boxShadow = '0 0 0 3px var(--accent-soft)';
}

function blurRing(event) {
    event.currentTarget.style.borderColor = 'var(--border)';
    event.currentTarget.style.boxShadow = 'none';
}

/* Shared chrome for every social button/link. */
const socialStyle = {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: '38px', height: '38px', borderRadius: 'var(--radius-pill)',
    background: 'var(--surface-2)', border: '1px solid var(--border)',
    color: 'var(--text-muted)', textDecoration: 'none', cursor: 'pointer',
    padding: 0, fontFamily: 'var(--font-sans)',
    transition: 'all var(--dur-fast) var(--ease-out)',
};

function socialHoverIn(e) {
    e.currentTarget.style.color = 'var(--text)';
    e.currentTarget.style.borderColor = 'var(--border-strong)';
    e.currentTarget.style.transform = 'translateY(-2px)';
}

function socialHoverOut(e) {
    e.currentTarget.style.color = 'var(--text-muted)';
    e.currentTarget.style.borderColor = 'var(--border)';
    e.currentTarget.style.transform = 'translateY(0)';
}

export default function Footer() {
    const [message, setMessage] = useState('');
    const [email, setEmail] = useState('');
    const [status, setStatus] = useState('idle'); // idle | sending | sent | error
    const [error, setError] = useState(null);
    const [copied, setCopied] = useState(null);

    const copyHandle = async (social) => {
        try {
            await navigator.clipboard.writeText(social.handle);
            setCopied(social.id);
            setTimeout(() => setCopied(null), 1600);
        } catch {
            /* clipboard blocked — nothing useful to do */
        }
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (!message.trim() || status === 'sending') return;
        setStatus('sending');
        setError(null);
        try {
            await submitFeedback({ message, email });
            setStatus('sent');
            setMessage('');
            setEmail('');
        } catch (err) {
            setStatus('error');
            setError(err.message || 'Could not send feedback.');
        }
    };

    return (
        <footer
            style={{
                position: 'relative',
                borderTop: '1px solid var(--border)',
                background: 'var(--surface-1)',
                backdropFilter: 'blur(var(--blur-glass))',
                WebkitBackdropFilter: 'blur(var(--blur-glass))',
            }}
        >
            <div style={{ maxWidth: 1024, margin: '0 auto', padding: '64px 24px 28px' }}>
                <motion.div
                    initial={{ opacity: 0, y: 14 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: '-60px' }}
                    transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                        gap: '48px',
                        alignItems: 'start',
                    }}
                >
                    {/* ── Brand + socials ─────────────────────────────── */}
                    <div>
                        <h3 style={{ marginBottom: '14px' }}>
                            <BrandMark beveled size={40} nameSize="var(--text-xl)" gap="12px" />
                        </h3>
                        <p style={{
                            fontSize: 'var(--text-sm)', color: 'var(--text-muted)',
                            lineHeight: 1.6, maxWidth: '34ch', marginBottom: '24px',
                        }}>
                            Search beyond words — text, image, audio and video, fused into one query.
                        </p>

                        <ul style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', listStyle: 'none' }}>
                            {SOCIALS.map(social => (
                                <li key={social.id}>
                                    {social.href ? (
                                        <a
                                            href={social.href}
                                            aria-label={social.label}
                                            title={social.label}
                                            target={social.href.startsWith('http') ? '_blank' : undefined}
                                            rel={social.href.startsWith('http') ? 'noopener noreferrer' : undefined}
                                            style={socialStyle}
                                            onMouseEnter={socialHoverIn}
                                            onMouseLeave={socialHoverOut}
                                        >
                                            <i className={social.icon} style={{ fontSize: '15px' }} />
                                        </a>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => copyHandle(social)}
                                            aria-label={social.label}
                                            title={copied === social.id ? 'Copied!' : `${social.label} — click to copy`}
                                            style={{
                                                ...socialStyle,
                                                color: copied === social.id ? 'var(--success)' : socialStyle.color,
                                                borderColor: copied === social.id ? 'var(--success)' : 'var(--border)',
                                            }}
                                            onMouseEnter={socialHoverIn}
                                            onMouseLeave={socialHoverOut}
                                        >
                                            <i
                                                className={copied === social.id ? 'fa-solid fa-check' : social.icon}
                                                style={{ fontSize: '15px' }}
                                            />
                                        </button>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* ── Feedback form ───────────────────────────────── */}
                    <div>
                        <p style={{
                            fontSize: 'var(--text-xs)', fontWeight: 600, textTransform: 'uppercase',
                            letterSpacing: '0.1em', color: 'var(--text-faint)', marginBottom: '14px',
                        }}>
                            Feedback
                        </p>

                        {status === 'sent' ? (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.98 }}
                                animate={{ opacity: 1, scale: 1 }}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '10px',
                                    padding: '16px 18px', borderRadius: 'var(--radius-md)',
                                    background: 'var(--surface-2)', border: '1px solid var(--border-strong)',
                                    color: 'var(--text-secondary)', fontSize: 'var(--text-sm)',
                                }}
                            >
                                <i className="fa-solid fa-check" />
                                Thanks — feedback received.
                                <button
                                    type="button"
                                    onClick={() => setStatus('idle')}
                                    style={{
                                        marginLeft: 'auto', background: 'transparent', border: 'none',
                                        color: 'var(--text-muted)', cursor: 'pointer',
                                        fontSize: 'var(--text-xs)', fontFamily: 'var(--font-sans)',
                                    }}
                                >
                                    Send another
                                </button>
                            </motion.div>
                        ) : (
                            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                <textarea
                                    value={message}
                                    onChange={e => setMessage(e.target.value)}
                                    onFocus={focusRing}
                                    onBlur={blurRing}
                                    placeholder="What could be better?"
                                    rows={3}
                                    maxLength={4000}
                                    required
                                    style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }}
                                />
                                <input
                                    type="email"
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                    onFocus={focusRing}
                                    onBlur={blurRing}
                                    placeholder="Email (optional)"
                                    style={inputStyle}
                                />
                                {error && (
                                    <p style={{ fontSize: 'var(--text-xs)', color: 'var(--danger)' }}>{error}</p>
                                )}
                                <motion.button
                                    type="submit"
                                    disabled={!message.trim() || status === 'sending'}
                                    whileTap={message.trim() ? { scale: 0.97 } : {}}
                                    style={{
                                        alignSelf: 'flex-start',
                                        padding: '10px 22px',
                                        borderRadius: 'var(--radius-pill)',
                                        background: message.trim() ? 'var(--accent-soft)' : 'var(--surface-2)',
                                        border: `1px solid ${message.trim() ? 'var(--accent-border)' : 'var(--border)'}`,
                                        color: message.trim() ? 'var(--accent-text)' : 'var(--text-faint)',
                                        fontSize: 'var(--text-sm)', fontWeight: 600,
                                        fontFamily: 'var(--font-sans)',
                                        cursor: message.trim() && status !== 'sending' ? 'pointer' : 'not-allowed',
                                        transition: 'all var(--dur-fast) var(--ease-out)',
                                    }}
                                >
                                    {status === 'sending' ? 'Sending…' : 'Send feedback'}
                                </motion.button>
                            </form>
                        )}
                    </div>
                </motion.div>

                {/* ── Bottom bar ──────────────────────────────────────── */}
                <div style={{
                    // 28px (not 16) so the enlarged link hit areas in the two
                    // rows stay clear of each other once this wraps on mobile.
                    display: 'flex', flexWrap: 'wrap', gap: '28px',
                    alignItems: 'center', justifyContent: 'space-between',
                    marginTop: '56px', paddingTop: '22px',
                    borderTop: '1px solid var(--border)',
                }}>
                    <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>
                        © {new Date().getFullYear()} Neuron ·{' '}
                        {LEGAL_LINKS.map((link, i) => (
                            <span key={link.to}>
                                {i > 0 && ' · '}
                                <Link
                                    to={link.to}
                                    className="tap-target"
                                    style={{ color: 'var(--text-muted)', textDecoration: 'none' }}
                                    onMouseEnter={e => { e.currentTarget.style.color = 'var(--text)'; }}
                                    onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; }}
                                >
                                    {link.label}
                                </Link>
                            </span>
                        ))}
                    </p>
                    <nav>
                        <ul style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', listStyle: 'none' }}>
                            {NAV_LINKS.map(link => (
                                <li key={link.to}>
                                    <Link
                                        to={link.to}
                                        className="tap-target"
                                        style={{
                                            fontSize: 'var(--text-xs)', color: 'var(--text-muted)',
                                            textDecoration: 'none',
                                            transition: 'color var(--dur-fast) var(--ease-out)',
                                        }}
                                        onMouseEnter={e => { e.currentTarget.style.color = 'var(--text)'; }}
                                        onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; }}
                                    >
                                        {link.label}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </nav>
                </div>
            </div>
        </footer>
    );
}
