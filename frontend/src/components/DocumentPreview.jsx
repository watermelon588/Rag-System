import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { getDocumentChunks } from '../services/documentsApi';

/**
 * DocumentPreview — renders a document's indexed chunks in order and, when
 * given a `targetChunkId`, scrolls to and highlights that exact chunk. This
 * is what turns a citation into "take me to the source": the chunk carries
 * its precise location (page / section / line range) which is shown inline.
 *
 * Props:
 *   documentId     — which document to load
 *   documentName   — display name (optional; header falls back to it)
 *   targetChunkId  — chunk to highlight + scroll to (optional)
 *   onClose        — optional close handler (renders a × when provided)
 */
export default function DocumentPreview({ documentId, documentName, targetChunkId, onClose }) {
    const [chunks, setChunks] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);
    const chunkRefs = useRef({});
    const scrollRef = useRef(null);

    useEffect(() => {
        if (!documentId) return undefined;
        let cancelled = false;
        // Reset + fetch whenever the target document changes.
        /* eslint-disable-next-line react-hooks/set-state-in-effect */
        setLoading(true); setError(null); setChunks(null);
        getDocumentChunks(documentId)
            .then(data => { if (!cancelled) setChunks(data.chunks); })
            .catch(err => { if (!cancelled) setError(err.message); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [documentId]);

    // Scroll the target chunk into view once chunks are rendered.
    useEffect(() => {
        if (!chunks || !targetChunkId) return;
        const el = chunkRefs.current[targetChunkId];
        if (el) {
            const id = requestAnimationFrame(() =>
                el.scrollIntoView({ behavior: 'smooth', block: 'center' })
            );
            return () => cancelAnimationFrame(id);
        }
    }, [chunks, targetChunkId]);

    const title = documentName
        || chunks?.[0]?.location?.document_name
        || 'Document';

    const header = (
        <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: '12px', padding: '14px 16px', borderBottom: '1px solid var(--border)',
            flexShrink: 0,
        }}>
            <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>
                    Source document
                </p>
                <p style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {title}
                </p>
            </div>
            {onClose && (
                <button onClick={onClose} title="Close preview"
                    style={{
                        flexShrink: 0, width: '28px', height: '28px', borderRadius: '8px',
                        background: 'transparent', border: '1px solid var(--border)',
                        color: 'var(--text-muted)', cursor: 'pointer', fontSize: '13px',
                    }}>
                    ✕
                </button>
            )}
        </div>
    );

    return (
        <div style={{
            display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0,
            border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
            background: 'var(--surface-1)', overflow: 'hidden',
        }}>
            {header}
            <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '16px', minHeight: 0 }}>
                {!documentId && (
                    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', color: 'var(--text-faint)', fontSize: 'var(--text-sm)', padding: '24px' }}>
                        <div>
                            <div style={{ fontSize: '26px', marginBottom: '10px' }}>📑</div>
                            Click a citation like <span style={{ color: 'var(--accent-text)', fontWeight: 600 }}>[1]</span> in an answer to
                            open its source here — jumped to the exact passage.
                        </div>
                    </div>
                )}
                {loading && <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>Loading document…</p>}
                {error && <p style={{ color: 'var(--danger)', fontSize: 'var(--text-sm)' }}>{error}</p>}
                {chunks && chunks.map(chunk => (
                    <ChunkBlock
                        key={chunk.location.chunk_id}
                        ref={el => { chunkRefs.current[chunk.location.chunk_id] = el; }}
                        chunk={chunk}
                        highlighted={chunk.location.chunk_id === targetChunkId}
                    />
                ))}
                {chunks && chunks.length === 0 && (
                    <p style={{ color: 'var(--text-faint)', fontSize: 'var(--text-sm)' }}>No extractable content.</p>
                )}
            </div>
        </div>
    );
}

function ChunkBlock({ chunk, highlighted, ref }) {
    const loc = chunk.location;
    const locationLabel = useMemo(() => [
        loc.page_number ? `Page ${loc.page_number}` : null,
        loc.section ? `§ ${loc.section}` : null,
        loc.line_start ? `Lines ${loc.line_start}–${loc.line_end ?? loc.line_start}` : null,
        `Chunk ${loc.ordinal + 1}`,
    ].filter(Boolean).join('  ·  '), [loc]);

    return (
        <motion.div
            ref={ref}
            animate={highlighted ? { scale: [1, 1.01, 1] } : {}}
            transition={{ duration: 0.5 }}
            style={{
                marginBottom: '12px', padding: '12px 14px', borderRadius: 'var(--radius-md)',
                border: `1px solid ${highlighted ? 'var(--accent-border)' : 'var(--border)'}`,
                background: highlighted ? 'var(--accent-soft)' : 'var(--surface-1)',
                boxShadow: highlighted ? '0 0 0 1px var(--accent-border), 0 8px 28px rgba(var(--accent-rgb),0.12)' : 'none',
                scrollMarginTop: '16px',
            }}>
            <p style={{
                fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: '0.03em',
                color: highlighted ? 'var(--accent-text)' : 'var(--text-faint)', marginBottom: '8px',
            }}>
                {locationLabel}
            </p>
            <p style={{ fontSize: 'var(--text-sm)', lineHeight: 1.7, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>
                {chunk.text}
            </p>
        </motion.div>
    );
}
