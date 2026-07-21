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
    const [displayName, setDisplayName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);

    async function handleSubmit(e) {
        e.preventDefault();
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
                <input style={inputStyle} type="text" placeholder="Name" value={displayName}
                       onChange={e => setDisplayName(e.target.value)} required maxLength={120} />
                <input style={inputStyle} type="email" placeholder="Email" value={email}
                       onChange={e => setEmail(e.target.value)} required autoComplete="email" />
                <input style={inputStyle} type="password" placeholder="Password (min. 8 characters)" value={password}
                       onChange={e => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" />
                <SubmitButton busy={busy}>Create account</SubmitButton>
            </form>
            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', marginTop: '20px', textAlign: 'center' }}>
                Already registered?{' '}
                <Link to="/login" style={{ color: 'rgba(61,139,255,0.9)', textDecoration: 'none' }}>
                    Sign in
                </Link>
            </p>
        </AuthShell>
    );
}
