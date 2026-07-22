import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ConfidenceBadge, ScoreBar } from './RelevancePanel';
import { SIGNAL_LABELS } from '../lib/signals';

/**
 * ImageDetailPanel — full-size viewer that slides in from the right.
 *
 * Shows the image at full size alongside its credits (source + origin link),
 * description, and the full ranking breakdown (position, relevance score,
 * confidence and every contributing signal).
 */
export default function ImageDetailPanel({ item, onClose, onPrev, onNext }) {
    // Escape closes; arrows step through the result set.
    useEffect(() => {
        if (!item) return;
        const onKey = (event) => {
            if (event.key === 'Escape') onClose();
            if (event.key === 'ArrowRight') onNext?.();
            if (event.key === 'ArrowLeft') onPrev?.();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [item, onClose, onNext, onPrev]);

    // Lock body scroll while open.
    useEffect(() => {
        if (!item) return;
        const previous = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = previous; };
    }, [item]);

    const analysis = item?.analysis;

    return (
        <AnimatePresence>
            {item && (
                <>
                    {/* Scrim */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        style={{
                            position: 'fixed', inset: 0, zIndex: 1400,
                            background: 'rgba(0,0,0,0.72)',
                            backdropFilter: 'blur(var(--blur-sm))',
                            WebkitBackdropFilter: 'blur(var(--blur-sm))',
                        }}
                    />

                    <motion.aside
                        role="dialog"
                        aria-modal="true"
                        aria-label="Image details"
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ type: 'spring', stiffness: 260, damping: 30 }}
                        style={{
                            position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 1401,
                            width: 'min(560px, 100vw)',
                            display: 'flex', flexDirection: 'column',
                            background: 'rgba(6,7,10,0.97)',
                            borderLeft: '1px solid var(--border-strong)',
                            boxShadow: 'var(--shadow-pop)',
                        }}
                    >
                        {/* Header */}
                        <header style={{
                            display: 'flex', alignItems: 'center', gap: '12px',
                            padding: '16px 18px', borderBottom: '1px solid var(--border)',
                            flexShrink: 0,
                        }}>
                            <span style={{
                                fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase',
                                letterSpacing: '0.1em', color: 'var(--text-faint)',
                            }}>
                                Rank #{(item.rank ?? 0) + 1}
                            </span>
                            {analysis && <ConfidenceBadge level={analysis.confidence} />}

                            <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
                                {onPrev && <NavButton icon="fa-chevron-left" label="Previous image" onClick={onPrev} />}
                                {onNext && <NavButton icon="fa-chevron-right" label="Next image" onClick={onNext} />}
                                <NavButton icon="fa-xmark" label="Close" onClick={onClose} />
                            </div>
                        </header>

                        {/* Scrollable body */}
                        <div style={{ overflowY: 'auto', padding: '18px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

                            {/* Full-size image */}
                            <div style={{
                                borderRadius: 'var(--radius-md)', overflow: 'hidden',
                                border: '1px solid var(--border)', background: 'var(--surface-1)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                minHeight: '200px',
                            }}>
                                {/* Keyed by src so switching images remounts it and
                                    the error state resets on its own. */}
                                <FullImage
                                    key={item.image_url || item.thumbnail_url}
                                    src={item.image_url || item.thumbnail_url}
                                    alt={item.title || 'Result image'}
                                />
                            </div>

                            {/* Description */}
                            {item.title && (
                                <div>
                                    <SectionLabel>Description</SectionLabel>
                                    <p style={{ fontSize: 'var(--text-base)', color: 'var(--text)', lineHeight: 1.55 }}>
                                        {item.title}
                                    </p>
                                    {item.snippet && (
                                        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', lineHeight: 1.6, marginTop: '8px' }}>
                                            {item.snippet}
                                        </p>
                                    )}
                                </div>
                            )}

                            {/* Credits */}
                            <div>
                                <SectionLabel>Credits</SectionLabel>
                                <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 14px', alignItems: 'baseline' }}>
                                    {item.source && (
                                        <>
                                            <dt style={metaKey}>Source</dt>
                                            <dd style={metaValue}>{item.source}</dd>
                                        </>
                                    )}
                                    {item.date && (
                                        <>
                                            <dt style={metaKey}>Date</dt>
                                            <dd style={metaValue}>{item.date}</dd>
                                        </>
                                    )}
                                    {item.url && (
                                        <>
                                            <dt style={metaKey}>Origin</dt>
                                            <dd style={{ ...metaValue, minWidth: 0 }}>
                                                <a
                                                    href={item.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    style={{
                                                        color: 'var(--accent-text)', textDecoration: 'none',
                                                        fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)',
                                                        wordBreak: 'break-all',
                                                    }}
                                                >
                                                    {item.url} ↗
                                                </a>
                                            </dd>
                                        </>
                                    )}
                                </dl>
                            </div>

                            {/* Ranking */}
                            {analysis && (
                                <div>
                                    <SectionLabel>Ranking</SectionLabel>
                                    <div style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                        gap: '14px', marginBottom: '14px',
                                    }}>
                                        <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                                            Overall relevance
                                        </span>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <ScoreBar score={analysis.relevance_score} />
                                            <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text)', minWidth: '40px', textAlign: 'right' }}>
                                                {Math.round(analysis.relevance_score * 100)}%
                                            </span>
                                        </div>
                                    </div>

                                    {analysis.explanation && (
                                        <p style={{
                                            fontSize: 'var(--text-sm)', color: 'var(--text-muted)', lineHeight: 1.6,
                                            marginBottom: '16px',
                                        }}>
                                            {analysis.explanation}
                                        </p>
                                    )}

                                    {/* Signal breakdown */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                        {analysis.signals?.map(signal => (
                                            <div key={signal.name}>
                                                <div style={{
                                                    display: 'flex', justifyContent: 'space-between',
                                                    alignItems: 'baseline', marginBottom: '5px', gap: '10px',
                                                }}>
                                                    <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-secondary)' }}>
                                                        {SIGNAL_LABELS[signal.name] || signal.name}
                                                    </span>
                                                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)', flexShrink: 0 }}>
                                                        {Math.round(signal.score * 100)}% · weight {Math.round(signal.weight * 100)}%
                                                    </span>
                                                </div>
                                                <ScoreBar score={signal.score} />
                                                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: '5px', lineHeight: 1.5 }}>
                                                    {signal.explanation}
                                                </p>
                                            </div>
                                        ))}
                                    </div>

                                    {analysis.matched_terms?.length > 0 && (
                                        <div style={{ marginTop: '16px' }}>
                                            <SectionLabel>Matched terms</SectionLabel>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                                {analysis.matched_terms.map(term => (
                                                    <span key={term} style={{
                                                        fontSize: 'var(--text-xs)', color: 'var(--accent-text)',
                                                        background: 'var(--accent-soft)', border: '1px solid var(--accent-border)',
                                                        borderRadius: 'var(--radius-pill)', padding: '3px 10px',
                                                    }}>
                                                        {term}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </motion.aside>
                </>
            )}
        </AnimatePresence>
    );
}

/* ── small internals ─────────────────────────────────────────────── */

const metaKey = {
    fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.08em',
    color: 'var(--text-faint)', fontWeight: 600, whiteSpace: 'nowrap',
};

const metaValue = { fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' };

function FullImage({ src, alt }) {
    const [failed, setFailed] = useState(false);
    if (failed || !src) {
        return (
            <span style={{ color: 'var(--text-faint)', fontSize: 'var(--text-sm)', padding: '48px' }}>
                Image could not be loaded
            </span>
        );
    }
    return (
        <img
            src={src}
            alt={alt}
            onError={() => setFailed(true)}
            style={{ width: '100%', height: 'auto', display: 'block', maxHeight: '58vh', objectFit: 'contain' }}
        />
    );
}

function SectionLabel({ children }) {
    return (
        <p style={{
            fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.1em', color: 'var(--text-faint)', marginBottom: '10px',
        }}>
            {children}
        </p>
    );
}

function NavButton({ icon, label, onClick }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={label}
            title={label}
            style={{
                width: '32px', height: '32px', borderRadius: 'var(--radius-pill)',
                background: 'var(--surface-2)', border: '1px solid var(--border)',
                color: 'var(--text-secondary)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all var(--dur-fast) var(--ease-out)',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-3)'; e.currentTarget.style.color = 'var(--text)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface-2)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
        >
            <i className={`fa-solid ${icon}`} style={{ fontSize: '13px' }} />
        </button>
    );
}
