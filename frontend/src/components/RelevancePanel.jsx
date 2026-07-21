import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const CONFIDENCE_COLORS = {
    high: { fg: 'rgba(74,222,128,0.95)', bg: 'rgba(74,222,128,0.10)', border: 'rgba(74,222,128,0.30)' },
    medium: { fg: 'rgba(250,204,21,0.95)', bg: 'rgba(250,204,21,0.10)', border: 'rgba(250,204,21,0.30)' },
    low: { fg: 'rgba(248,113,113,0.95)', bg: 'rgba(248,113,113,0.10)', border: 'rgba(248,113,113,0.30)' },
};

const SIGNAL_LABELS = {
    semantic_similarity: 'Semantic match',
    bm25_keyword: 'Keyword (BM25)',
    provider_position: 'Source ranking',
};

export function ConfidenceBadge({ level }) {
    const colors = CONFIDENCE_COLORS[level] || CONFIDENCE_COLORS.low;
    return (
        <span style={{
            fontSize: '10px', fontWeight: 600, textTransform: 'uppercase',
            letterSpacing: '0.06em', color: colors.fg, background: colors.bg,
            border: `1px solid ${colors.border}`, borderRadius: '999px', padding: '2px 8px',
        }}>
            {level}
        </span>
    );
}

export function ScoreBar({ score }) {
    const percent = Math.round(score * 100);
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '110px' }}>
            <div style={{
                flex: 1, height: '4px', borderRadius: '999px',
                background: 'rgba(255,255,255,0.08)', overflow: 'hidden',
            }}>
                <div style={{
                    width: `${percent}%`, height: '100%', borderRadius: '999px',
                    background: percent >= 62
                        ? 'linear-gradient(90deg, rgba(74,222,128,0.7), rgba(74,222,128,0.95))'
                        : percent >= 38
                            ? 'linear-gradient(90deg, rgba(250,204,21,0.6), rgba(250,204,21,0.9))'
                            : 'linear-gradient(90deg, rgba(248,113,113,0.6), rgba(248,113,113,0.9))',
                }} />
            </div>
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.55)', width: '32px' }}>
                {percent}%
            </span>
        </div>
    );
}

/**
 * Expandable "Why this result?" panel showing the relevance analysis
 * the backend attaches to every search result.
 */
export default function RelevancePanel({ analysis }) {
    const [open, setOpen] = useState(false);
    if (!analysis) return null;

    return (
        <div style={{ marginTop: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <ScoreBar score={analysis.relevance_score} />
                <ConfidenceBadge level={analysis.confidence} />
                <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(v => !v); }}
                    style={{
                        fontSize: '11px', color: 'rgba(61,139,255,0.85)', background: 'transparent',
                        border: 'none', cursor: 'pointer', padding: 0, fontWeight: 500,
                    }}
                >
                    {open ? 'Hide analysis ▴' : 'Why this result? ▾'}
                </button>
            </div>

            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        style={{ overflow: 'hidden' }}
                    >
                        <div style={{
                            marginTop: '10px', padding: '12px 14px', borderRadius: '10px',
                            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
                        }}>
                            <p style={{ fontSize: '12px', color: 'rgba(209,213,219,0.85)', lineHeight: 1.6, marginBottom: '10px' }}>
                                {analysis.explanation}
                            </p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                                {analysis.signals?.map(signal => (
                                    <div key={signal.name} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <span style={{
                                            fontSize: '11px', color: 'rgba(255,255,255,0.45)',
                                            width: '110px', flexShrink: 0,
                                        }}>
                                            {SIGNAL_LABELS[signal.name] || signal.name}
                                        </span>
                                        <div style={{
                                            flex: 1, height: '3px', borderRadius: '999px',
                                            background: 'rgba(255,255,255,0.07)', overflow: 'hidden',
                                        }}>
                                            <div style={{
                                                width: `${Math.round(signal.score * 100)}%`, height: '100%',
                                                background: 'rgba(61,139,255,0.75)', borderRadius: '999px',
                                            }} />
                                        </div>
                                        <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.35)', width: '58px', textAlign: 'right' }}>
                                            {Math.round(signal.score * 100)}% · w {signal.weight}
                                        </span>
                                    </div>
                                ))}
                            </div>
                            {analysis.matched_terms?.length > 0 && (
                                <div style={{ marginTop: '10px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                    {analysis.matched_terms.slice(0, 8).map(term => (
                                        <span key={term} style={{
                                            fontSize: '10px', color: 'rgba(61,139,255,0.85)',
                                            background: 'rgba(61,139,255,0.10)', border: '1px solid rgba(61,139,255,0.22)',
                                            borderRadius: '999px', padding: '2px 8px',
                                        }}>
                                            {term}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
