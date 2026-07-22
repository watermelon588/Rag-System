import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';

/** Shared chrome for the Terms and Privacy pages. */
export default function LegalLayout({ title, updated, children }) {
    return (
        <div style={{ position: 'relative', zIndex: 1, minHeight: '100vh' }}>
            <Navbar />

            <main
                className="page-gutter"
                style={{
                    paddingTop: 'calc(var(--nav-height) + 40px)',
                    paddingBottom: '80px',
                }}
            >
                <motion.article
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                    className="no-overflow"
                    style={{ maxWidth: 760, margin: '0 auto' }}
                >
                    <p style={{
                        fontSize: 'var(--text-xs)', fontWeight: 600, textTransform: 'uppercase',
                        letterSpacing: '0.1em', color: 'var(--text-faint)', marginBottom: '12px',
                    }}>
                        Legal
                    </p>
                    <h1 style={{
                        fontSize: 'var(--text-2xl)', fontWeight: 700, color: 'var(--text)',
                        letterSpacing: 'var(--tracking-tight)', lineHeight: 1.25, marginBottom: '10px',
                    }}>
                        {title}
                    </h1>
                    <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginBottom: '36px' }}>
                        Last updated {updated}
                    </p>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
                        {children}
                    </div>

                    <div style={{
                        marginTop: '48px', paddingTop: '22px',
                        borderTop: '1px solid var(--border)',
                        display: 'flex', gap: '20px', flexWrap: 'wrap',
                    }}>
                        <Link to="/terms" style={legalLink}>Terms &amp; Conditions</Link>
                        <Link to="/privacy" style={legalLink}>Privacy Policy</Link>
                        <Link to="/" style={legalLink}>Back to Neuron</Link>
                    </div>
                </motion.article>
            </main>

            <Footer />
        </div>
    );
}

const legalLink = {
    fontSize: 'var(--text-sm)', color: 'var(--accent-text)', textDecoration: 'none',
};

/* ── Reusable section pieces ─────────────────────────────────────────── */

export function Section({ heading, children }) {
    return (
        <section>
            <h2 style={{
                fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--text)',
                marginBottom: '12px', letterSpacing: 'var(--tracking-tight)',
            }}>
                {heading}
            </h2>
            <div style={{
                display: 'flex', flexDirection: 'column', gap: '12px',
                fontSize: 'var(--text-base)', color: 'var(--text-secondary)', lineHeight: 1.7,
            }}>
                {children}
            </div>
        </section>
    );
}

export function Bullets({ items }) {
    return (
        <ul style={{
            display: 'flex', flexDirection: 'column', gap: '9px',
            paddingLeft: '20px', listStyle: 'disc',
            color: 'var(--text-secondary)', lineHeight: 1.7,
        }}>
            {items.map((item, i) => <li key={i}>{item}</li>)}
        </ul>
    );
}
