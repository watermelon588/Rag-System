import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import Navbar from '../components/Navbar';
import * as chatApi from '../services/chatApi';

/* ─── Citation chip + source popover ─────────────────────────── */
function CitationChip({ citation }) {
    const [open, setOpen] = useState(false);
    const where = citation.location;

    const locationLabel = [
        where.document_name,
        where.page_number ? `page ${where.page_number}` : null,
        where.section ? `§ ${where.section}` : null,
        where.line_start ? `lines ${where.line_start}–${where.line_end ?? where.line_start}` : null,
    ].filter(Boolean).join(' · ');

    return (
        <span style={{ position: 'relative', display: 'inline-block' }}>
            <button
                onClick={() => setOpen(v => !v)}
                style={{
                    fontSize: '11px', fontWeight: 600, color: 'rgba(129,140,248,0.95)',
                    background: 'rgba(129,140,248,0.12)', border: '1px solid rgba(129,140,248,0.3)',
                    borderRadius: '6px', padding: '1px 7px', cursor: 'pointer', margin: '0 2px',
                }}>
                [{citation.marker}]
            </button>
            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}
                        style={{
                            position: 'absolute', bottom: 'calc(100% + 8px)', left: 0, zIndex: 40,
                            width: '320px', padding: '14px', borderRadius: '12px',
                            background: 'rgba(18,18,26,0.98)', border: '1px solid rgba(255,255,255,0.14)',
                            boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
                        }}>
                        <p style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(129,140,248,0.9)', marginBottom: '6px' }}>
                            {locationLabel}
                        </p>
                        <p style={{ fontSize: '12px', color: 'rgba(209,213,219,0.85)', lineHeight: 1.6, fontStyle: 'italic' }}>
                            "{citation.quoted_text}"
                        </p>
                        <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', marginTop: '8px' }}>
                            match strength {Math.round(citation.similarity * 100)}%
                        </p>
                    </motion.div>
                )}
            </AnimatePresence>
        </span>
    );
}

/* ─── Render answer text with inline [n] chips ───────────────── */
function AnswerText({ content, citations }) {
    if (!citations?.length) {
        return <span style={{ whiteSpace: 'pre-wrap' }}>{content}</span>;
    }
    const byMarker = Object.fromEntries(citations.map(c => [c.marker, c]));
    const parts = content.split(/(\[\d{1,2}\])/g);
    return (
        <span style={{ whiteSpace: 'pre-wrap' }}>
            {parts.map((part, index) => {
                const match = part.match(/^\[(\d{1,2})\]$/);
                if (match && byMarker[Number(match[1])]) {
                    return <CitationChip key={index} citation={byMarker[Number(match[1])]} />;
                }
                return part;
            })}
        </span>
    );
}

/* ─── One message bubble ─────────────────────────────────────── */
function MessageBubble({ message }) {
    const isUser = message.role === 'user';
    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
            <div style={{
                maxWidth: '78%', padding: '12px 16px', borderRadius: '16px',
                borderBottomRightRadius: isUser ? '4px' : '16px',
                borderBottomLeftRadius: isUser ? '16px' : '4px',
                background: isUser ? 'rgba(129,140,248,0.16)' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${isUser ? 'rgba(129,140,248,0.3)' : 'rgba(255,255,255,0.09)'}`,
                fontSize: '14px', color: 'rgba(240,240,245,0.92)', lineHeight: 1.65,
            }}>
                <AnswerText content={message.content} citations={message.citations} />
                {!isUser && message.confidence != null && message.confidence > 0 && (
                    <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', marginTop: '8px' }}>
                        grounding confidence {Math.round(message.confidence * 100)}%
                    </p>
                )}
            </div>
        </motion.div>
    );
}

/* ═══ MAIN ════════════════════════════════════════════════════════ */
export default function Chat() {
    const location = useLocation();
    const scopedDocumentIds = location.state?.documentIds || null;

    const [sessions, setSessions] = useState([]);
    const [activeSession, setActiveSession] = useState(null); // detail incl. messages
    const [question, setQuestion] = useState('');
    const [useWebSearch, setUseWebSearch] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [webResults, setWebResults] = useState(null);
    const bottomRef = useRef(null);
    const bootstrappedRef = useRef(false);

    const refreshSessions = useCallback(async () => {
        const data = await chatApi.listSessions();
        setSessions(data.sessions);
        return data.sessions;
    }, []);

    /* Bootstrap: load sessions; auto-create one when arriving from Documents. */
    useEffect(() => {
        if (bootstrappedRef.current) return;
        bootstrappedRef.current = true;
        (async () => {
            try {
                const existing = await refreshSessions();
                if (scopedDocumentIds?.length) {
                    const created = await chatApi.createSession({ documentIds: scopedDocumentIds });
                    await refreshSessions();
                    await openSession(created.id);
                } else if (existing.length > 0) {
                    await openSession(existing[0].id);
                }
            } catch (err) {
                setError(err.message);
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [activeSession?.messages?.length, busy]);

    async function openSession(sessionId) {
        setError(null);
        setWebResults(null);
        const detail = await chatApi.getSession(sessionId);
        setActiveSession(detail);
    }

    async function newSession() {
        setError(null);
        try {
            const created = await chatApi.createSession({});
            await refreshSessions();
            await openSession(created.id);
        } catch (err) {
            setError(err.message);
        }
    }

    async function removeSession(sessionId, event) {
        event.stopPropagation();
        try {
            await chatApi.deleteSession(sessionId);
            const remaining = await refreshSessions();
            if (activeSession?.id === sessionId) {
                setActiveSession(null);
                if (remaining.length) await openSession(remaining[0].id);
            }
        } catch (err) {
            setError(err.message);
        }
    }

    async function handleAsk(e) {
        e.preventDefault();
        const q = question.trim();
        if (!q || busy || !activeSession) return;

        setBusy(true);
        setError(null);
        setWebResults(null);
        setQuestion('');

        // Optimistic user bubble.
        setActiveSession(prev => ({
            ...prev,
            messages: [...prev.messages, { id: `tmp-${Date.now()}`, role: 'user', content: q }],
        }));

        try {
            const response = await chatApi.ask(activeSession.id, { question: q, useWebSearch });
            setActiveSession(prev => ({
                ...prev,
                messages: [...prev.messages, response.message],
            }));
            setWebResults(response.web_results);
            refreshSessions(); // title may have been auto-set
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    }

    return (
        <div style={{ minHeight: '100vh', background: '#000', position: 'relative' }}>
            <div style={{
                position: 'fixed', inset: 0,
                background: 'radial-gradient(ellipse at 50% 0%, rgba(76,29,149,0.16), transparent 55%)',
                pointerEvents: 'none',
            }} />
            <Navbar />

            <div style={{
                position: 'relative', zIndex: 10, maxWidth: '1100px', margin: '0 auto',
                padding: '96px 24px 24px', display: 'flex', gap: '20px',
                height: '100vh', boxSizing: 'border-box',
            }}>

                {/* ── Sidebar: sessions ─────────────────────────── */}
                <div style={{
                    width: '250px', flexShrink: 0, display: 'flex', flexDirection: 'column',
                    gap: '10px', overflowY: 'auto', paddingBottom: '16px',
                }}>
                    <button
                        onClick={newSession}
                        style={{
                            padding: '10px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.14)',
                            background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: '13px',
                            fontWeight: 600, cursor: 'pointer',
                        }}>
                        + New conversation
                    </button>
                    {sessions.map(session => (
                        <div
                            key={session.id}
                            onClick={() => openSession(session.id)}
                            style={{
                                padding: '10px 12px', borderRadius: '10px', cursor: 'pointer',
                                border: activeSession?.id === session.id
                                    ? '1px solid rgba(129,140,248,0.45)'
                                    : '1px solid rgba(255,255,255,0.07)',
                                background: activeSession?.id === session.id
                                    ? 'rgba(129,140,248,0.10)'
                                    : 'rgba(255,255,255,0.03)',
                                display: 'flex', alignItems: 'center', gap: '8px',
                            }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{
                                    fontSize: '12.5px', color: 'rgba(255,255,255,0.8)',
                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                }}>
                                    {session.title}
                                </p>
                                {session.document_ids?.length > 0 && (
                                    <p style={{ fontSize: '10px', color: 'rgba(129,140,248,0.6)', marginTop: '2px' }}>
                                        scoped to {session.document_ids.length} doc(s)
                                    </p>
                                )}
                            </div>
                            <button
                                onClick={e => removeSession(session.id, e)}
                                style={{
                                    background: 'transparent', border: 'none', cursor: 'pointer',
                                    color: 'rgba(255,255,255,0.25)', fontSize: '12px', padding: '2px',
                                }}>
                                ✕
                            </button>
                        </div>
                    ))}
                </div>

                {/* ── Main: thread ──────────────────────────────── */}
                <div style={{
                    flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0,
                    border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px',
                    background: 'rgba(255,255,255,0.02)', overflow: 'hidden',
                }}>
                    <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        {!activeSession ? (
                            <div style={{ margin: 'auto', textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '14px' }}>
                                <p style={{ fontSize: '30px', marginBottom: '12px' }}>💬</p>
                                Start a conversation with your documents
                            </div>
                        ) : activeSession.messages.length === 0 ? (
                            <div style={{ margin: 'auto', textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '14px' }}>
                                Ask anything about your uploaded documents.<br />
                                Answers cite their exact source locations.
                            </div>
                        ) : (
                            activeSession.messages.map(message => (
                                <MessageBubble key={message.id} message={message} />
                            ))
                        )}

                        {busy && (
                            <div style={{ display: 'flex', gap: '6px', padding: '8px 4px' }}>
                                {[0, 1, 2].map(i => (
                                    <motion.span key={i}
                                        animate={{ opacity: [0.2, 1, 0.2] }}
                                        transition={{ repeat: Infinity, duration: 1.2, delay: i * 0.2 }}
                                        style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'rgba(129,140,248,0.8)' }} />
                                ))}
                            </div>
                        )}

                        {/* Web augmentation results */}
                        {webResults?.length > 0 && (
                            <div style={{
                                padding: '14px', borderRadius: '12px',
                                border: '1px solid rgba(129,140,248,0.2)', background: 'rgba(129,140,248,0.05)',
                            }}>
                                <p style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(129,140,248,0.85)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                    Live web context
                                </p>
                                {webResults.map((result, index) => (
                                    <a key={index} href={result.url} target="_blank" rel="noopener noreferrer"
                                       style={{ display: 'block', textDecoration: 'none', marginBottom: '8px' }}>
                                        <p style={{ fontSize: '13px', color: 'rgba(199,210,254,0.95)', fontWeight: 600 }}>{result.title}</p>
                                        <p style={{ fontSize: '12px', color: 'rgba(209,213,219,0.6)', lineHeight: 1.5 }}>{result.snippet}</p>
                                    </a>
                                ))}
                            </div>
                        )}

                        {error && (
                            <div style={{
                                padding: '10px 14px', borderRadius: '10px', fontSize: '13px',
                                border: '1px solid rgba(239,68,68,0.25)', background: 'rgba(239,68,68,0.08)',
                                color: 'rgba(252,165,165,0.9)',
                            }}>
                                {error}
                            </div>
                        )}
                        <div ref={bottomRef} />
                    </div>

                    {/* ── Composer ─────────────────────────────── */}
                    <form onSubmit={handleAsk} style={{
                        padding: '14px', borderTop: '1px solid rgba(255,255,255,0.08)',
                        display: 'flex', flexDirection: 'column', gap: '8px',
                    }}>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <input
                                value={question}
                                onChange={e => setQuestion(e.target.value)}
                                placeholder={activeSession ? 'Ask about your documents…' : 'Create a conversation first'}
                                disabled={!activeSession || busy}
                                style={{
                                    flex: 1, padding: '12px 16px', borderRadius: '12px',
                                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
                                    color: '#fff', fontSize: '14px', outline: 'none',
                                    fontFamily: 'Inter, system-ui, sans-serif',
                                }} />
                            <button
                                type="submit"
                                disabled={!question.trim() || busy || !activeSession}
                                style={{
                                    padding: '0 22px', borderRadius: '12px', border: 'none',
                                    background: question.trim() && !busy && activeSession ? '#fff' : 'rgba(255,255,255,0.1)',
                                    color: question.trim() && !busy && activeSession ? '#000' : 'rgba(255,255,255,0.3)',
                                    fontSize: '14px', fontWeight: 600,
                                    cursor: question.trim() && !busy && activeSession ? 'pointer' : 'not-allowed',
                                }}>
                                Send
                            </button>
                        </div>
                        <label style={{
                            display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px',
                            color: 'rgba(255,255,255,0.4)', cursor: 'pointer', userSelect: 'none',
                        }}>
                            <input type="checkbox" checked={useWebSearch}
                                   onChange={e => setUseWebSearch(e.target.checked)} />
                            Augment with live web search when document context is weak
                        </label>
                    </form>
                </div>
            </div>
        </div>
    );
}
