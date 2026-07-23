import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { AuthShell, FormError, SubmitButton } from './Login';

const inputStyle = {
    width: '100%', padding: '12px 16px', borderRadius: '12px',
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
    color: '#fff', fontSize: '14px', outline: 'none',
    fontFamily: 'Inter, system-ui, sans-serif',
};

export default function Register() {
    const { register } = useAuth();
    const navigate = useNavigate();
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);

    async function handleSubmit(e) {
        e.preventDefault();
        // Read from the form directly so browser autofill is captured.
        const fd = new FormData(e.currentTarget);
        const displayName = (fd.get('displayName') || '').toString().trim();
        const email = (fd.get('email') || '').toString().trim();
        const password = (fd.get('password') || '').toString();

        if (!displayName || !email) {
            setError('Please fill in your name and email');
            return;
        }
        if (password.length < 8) {
            setError('Password must be at least 8 characters');
            return;
        }
        setBusy(true);
        setError(null);
        try {
            await register({ email, displayName, password });
            navigate('/documents', { replace: true });
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    }

    return (
        <AuthShell title="Create your account" subtitle="Upload documents and chat with them in minutes">
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <FormError message={error} />
                <input style={inputStyle} type="text" name="displayName" placeholder="Name"
                       required maxLength={120} autoComplete="name" />
                <input style={inputStyle} type="email" name="email" placeholder="Email"
                       required autoComplete="email" />
                <input style={inputStyle} type="password" name="password" placeholder="Password (min. 8 characters)"
                       required minLength={8} autoComplete="new-password" />
                <SubmitButton busy={busy}>Create account</SubmitButton>
            </form>
            <p style={{
                fontSize: 'var(--text-xs)', color: 'var(--text-muted)',
                marginTop: '16px', textAlign: 'center', lineHeight: 1.6,
            }}>
                By creating an account you agree to our{' '}
                <Link to="/terms" style={{ color: 'var(--accent-text)', textDecoration: 'none' }}>
                    Terms &amp; Conditions
                </Link>{' '}
                and{' '}
                <Link to="/privacy" style={{ color: 'var(--accent-text)', textDecoration: 'none' }}>
                    Privacy Policy
                </Link>.
            </p>
            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', marginTop: '20px', textAlign: 'center' }}>
                Already registered?{' '}
                <Link to="/login" className="tap-target" style={{ color: 'rgba(61,139,255,0.9)', textDecoration: 'none' }}>
                    Sign in
                </Link>
            </p>
        </AuthShell>
    );
}
