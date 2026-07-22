import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import Navbar from '../components/Navbar';
import { useAuth } from '../context/AuthContext';

const inputStyle = {
    width: '100%', padding: '12px 16px', borderRadius: '12px',
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
    color: '#fff', fontSize: '14px', outline: 'none',
    fontFamily: 'Inter, system-ui, sans-serif',
};

export function AuthShell({ title, subtitle, children }) {
    return (
        <div style={{ minHeight: '100vh', position: 'relative' }}>
            <Navbar />
            <div style={{
                position: 'relative', zIndex: 10, minHeight: '100vh',
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '96px 24px',
            }}>
                <motion.div
                    initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, ease: 'easeOut' }}
                    style={{
                        width: '100%', maxWidth: '400px', padding: '36px',
                        borderRadius: '20px', border: '1px solid rgba(255,255,255,0.10)',
                        background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(24px)',
                        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
                    }}>
                    <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#fff', marginBottom: '6px' }}>{title}</h1>
                    <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.45)', marginBottom: '28px' }}>{subtitle}</p>
                    {children}
                </motion.div>
            </div>
        </div>
    );
}

export function FormError({ message }) {
    if (!message) return null;
    return (
        <p style={{
            fontSize: '13px', color: 'rgba(252,165,165,0.9)', padding: '10px 14px',
            borderRadius: '10px', background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.25)', marginBottom: '16px',
        }}>
            {message}
        </p>
    );
}

export function SubmitButton({ children, busy }) {
    return (
        <motion.button
            type="submit" disabled={busy}
            whileHover={busy ? {} : { scale: 1.02 }} whileTap={busy ? {} : { scale: 0.98 }}
            style={{
                width: '100%', padding: '12px', borderRadius: '12px', border: 'none',
                background: busy ? 'rgba(255,255,255,0.4)' : '#fff', color: '#000',
                fontSize: '14px', fontWeight: 600, cursor: busy ? 'wait' : 'pointer',
                fontFamily: 'Inter, system-ui, sans-serif',
            }}>
            {busy ? 'Please wait…' : children}
        </motion.button>
    );
}

export default function Login() {
    const { login } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);

    async function handleSubmit(e) {
        e.preventDefault();
        // Read straight from the form so browser autofill (which doesn't fire
        // React onChange) is always captured.
        const fd = new FormData(e.currentTarget);
        const email = (fd.get('email') || '').toString().trim();
        const password = (fd.get('password') || '').toString();
        if (!email || !password) {
            setError('Please enter your email and password');
            return;
        }
        setBusy(true);
        setError(null);
        try {
            await login({ email, password });
            navigate(location.state?.from || '/documents', { replace: true });
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    }

    return (
        <AuthShell title="Welcome back" subtitle="Sign in to access your documents and chats">
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <FormError message={error} />
                <input style={inputStyle} type="email" name="email" placeholder="Email"
                       required autoComplete="email" />
                <input style={inputStyle} type="password" name="password" placeholder="Password"
                       required autoComplete="current-password" />
                <SubmitButton busy={busy}>Sign in</SubmitButton>
            </form>
            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', marginTop: '20px', textAlign: 'center' }}>
                No account?{' '}
                <Link to="/register" style={{ color: 'rgba(61,139,255,0.9)', textDecoration: 'none' }}>
                    Create one
                </Link>
            </p>
        </AuthShell>
    );
}
