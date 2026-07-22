import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import Navbar from '../components/Navbar';
import DocumentPreview from '../components/DocumentPreview';
import * as chatApi from '../services/chatApi';
import { uploadDocument } from '../services/documentsApi';

/* ─── Citation chip — click opens the source in the preview panel ── */
function CitationChip({ citation, onOpen }) {
    const where = citation.location;
    const label = [
        where.document_name,
        where.page_number ? `p${where.page_number}` : null,
        where.section ? `§${where.section}` : null,
    ].filter(Boolean).join(' · ');
    return (
        <button
            onClick={() => onOpen?.(citation)}
            title={`Open source: ${label}\n\n"${citation.quoted_text}"`}
            style={{
                fontSize: '11px', fontWeight: 600, color: 'var(--accent-text)',
                background: 'var(--accent-soft)', border: '1px solid var(--accent-border)',
                borderRadius: '6px', padding: '1px 7px', cursor: 'pointer', margin: '0 2px',
            }}>
            [{citation.marker}]
        </button>
    );
}

/* ─── Render answer text with inline [n] chips ───────────────── */
function AnswerText({ content, citations, onOpenCitation }) {
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
                    return <CitationChip key={index} citation={byMarker[Number(match[1])]} onOpen={onOpenCitation} />;
                }
                return part;
            })}
        </span>
    );
}

/* ─── One message bubble ─────────────────────────────────────── */
function MessageBubble({ message, onOpenCitation }) {
    const isUser = message.role === 'user';
    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
            <div style={{
                maxWidth: '82%', padding: '12px 16px', borderRadius: '16px',
                borderBottomRightRadius: isUser ? '4px' : '16px',
                borderBottomLeftRadius: isUser ? '16px' : '4px',
                background: isUser ? 'var(--accent-soft)' : 'var(--surface-2)',
                border: `1px solid ${isUser ? 'var(--accent-border)' : 'var(--border)'}`,
                fontSize: '14px', color: 'var(--text)', lineHeight: 1.65,
            }}>
                <AnswerText content={message.content} citations={message.citations} onOpenCitation={onOpenCitation} />
                {!isUser && message.citations?.length > 0 && (
                    <p style={{ fontSize: '10px', color: 'var(--text-faint)', marginTop: '8px' }}>
                        Click a citation to open its source →
                    </p>
                )}
                {!isUser && message.confidence != null && message.confidence > 0 && (
                    <p style={{ fontSize: '10px', color: 'var(--text-faint)', marginTop: '4px' }}>
                        grounding confidence {Math.round(message.confidence * 100)}%
                    </p>
                )}
            </div>
        </motion.div>
    );
}

/* ─── Welcome hero shown for an empty conversation ───────────── */
function WelcomeMessage({ scoped }) {
    return (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            style={{ margin: 'auto', maxWidth: '440px', textAlign: 'center', padding: '24px' }}>
            <div style={{ fontSize: '34px', marginBottom: '14px' }}>💬</div>
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text)', marginBottom: '10px' }}>
                Chat with your documents
            </h2>
            <p style={{ fontSize: '14px', color: 'var(--text-muted)', lineHeight: 1.65 }}>
                Ask a question in plain language and I'll answer using {scoped ? 'the selected documents' : 'your uploaded documents'}.
                Every answer is <span style={{ color: 'var(--accent-text)', fontWeight: 600 }}>grounded with citations</span> — click any
                <span style={{ color: 'var(--accent-text)', fontWeight: 600 }}> [1]</span> to open the exact source passage on the right.
            </p>
            <div style={{ marginTop: '18px', display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
                {['Summarize the key points', 'What does it say about …?', 'List the main findings'].map(s => (
                    <span key={s} style={{
                        fontSize: '12px', color: 'var(--text-muted)', padding: '5px 12px',
                        borderRadius: 'var(--radius-pill)', border: '1px solid var(--border)', background: 'var(--surface-1)',
                    }}>{s}</span>
                ))}
            </div>
        </motion.div>
    );
}

/* ═══ MAIN ════════════════════════════════════════════════════════ */
export default function Chat() {
    const location = useLocation();
    const navigate = useNavigate();
    const scopedDocumentIds = location.state?.documentIds || null;
    const startNew = location.state?.startNew || (scopedDocumentIds?.length > 0);

    const [sessions, setSessions] = useState([]);
    const [activeSession, setActiveSession] = useState(null);
    const [question, setQuestion] = useState('');
    const [useWebSearch, setUseWebSearch] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [webResults, setWebResults] = useState(null);
    const [preview, setPreview] = useState(null);   // { documentId, chunkId, documentName }
    const [lastAsked, setLastAsked] = useState('');
    const [showSessions, setShowSessions] = useState(false);
    const [uploadNote, setUploadNote] = useState(null);
    const [uploading, setUploading] = useState(false);
    const bottomRef = useRef(null);
    const uploadRef = useRef(null);
    const bootstrappedRef = useRef(false);

    const refreshSessions = useCallback(async () => {
        const data = await chatApi.listSessions();
        setSessions(data.sessions);
        return data.sessions;
    }, []);

    useEffect(() => {
        if (bootstrappedRef.current) return;
        bootstrappedRef.current = true;
        (async () => {
            try {
                const existing = await refreshSessions();
                if (startNew) {
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
        setPreview(null);
        setWebResults(null);
        setShowSessions(false);
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

    function openCitation(citation) {
        const loc = citation.location;
        setPreview({ documentId: loc.document_id, chunkId: loc.chunk_id, documentName: loc.document_name });
    }

    async function handleUpload(files) {
        if (!files?.length) return;
        setUploading(true);
        setUploadNote(null);
        setError(null);
        try {
            const names = [];
            for (const file of files) {
                const doc = await uploadDocument(file);
                names.push(doc.filename);
            }
            const scoped = activeSession?.document_ids?.length > 0;
            setUploadNote(
                `Uploaded ${names.join(', ')}. ${scoped
                    ? 'This chat is scoped to specific documents — start a new conversation to include it.'
                    : 'It’s ready to ask about now.'}`
            );
        } catch (err) {
            setError(err.message);
        } finally {
            setUploading(false);
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
        setLastAsked(q);
        setActiveSession(prev => ({
            ...prev,
            messages: [...prev.messages, { id: `tmp-${Date.now()}`, role: 'user', content: q }],
        }));

        try {
            const response = await chatApi.ask(activeSession.id, { question: q, useWebSearch });
            setActiveSession(prev => ({ ...prev, messages: [...prev.messages, response.message] }));
            setWebResults(response.web_results);
            refreshSessions();
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    }

    const previewOpen = Boolean(preview);

    return (
        <div style={{ minHeight: '100vh', position: 'relative' }}>
            <Navbar />

            <div style={{
                position: 'relative', zIndex: 10, maxWidth: '1320px', margin: '0 auto',
                padding: 'calc(var(--nav-height) + 20px) 24px 20px',
                height: '100vh', boxSizing: 'border-box',
                display: 'flex', flexDirection: 'column', gap: '14px',
            }}>
                {/* ── Toolbar ─────────────────────────────────────── */}
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                    <button onClick={() => setShowSessions(s => !s)} style={toolbarBtn}>
                        ☰ Conversations {sessions.length > 0 && `(${sessions.length})`}
                    </button>
                    <button onClick={newSession} style={toolbarBtn}>＋ New chat</button>
                    <button onClick={() => uploadRef.current?.click()} style={{ ...toolbarBtn, color: 'var(--accent-text)', borderColor: 'var(--accent-border)', background: 'var(--accent-soft)' }}>
                        {uploading ? '⏳ Uploading…' : '⬆ Upload document'}
                    </button>
                    <input ref={uploadRef} type="file" multiple style={{ display: 'none' }}
                        accept=".pdf,.docx,.txt,.md,.markdown,.csv,.tsv,.xlsx,.xls,.html,.htm,.xml,.json,.py,.js,.jsx,.ts,.tsx,.java,.c,.cpp,.cs,.go,.rs,.rb,.php,.sql,.sh,.yaml,.yml,.toml"
                        onChange={e => { handleUpload([...e.target.files]); e.target.value = ''; }} />
                    <div style={{ flex: 1 }} />
                    <span style={{ fontSize: '13px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '40%' }}>
                        {activeSession?.title}
                    </span>

                    {/* Sessions dropdown */}
                    <AnimatePresence>
                        {showSessions && (
                            <motion.div
                                initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                                style={{
                                    position: 'absolute', top: 'calc(100% + 8px)', left: 0, zIndex: 1000,
                                    width: '320px', maxHeight: '60vh', overflowY: 'auto', padding: '8px',
                                    borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-strong)',
                                    background: 'rgba(6,7,10,0.97)', boxShadow: 'var(--shadow-pop)', backdropFilter: 'blur(var(--blur-lg))',
                                }}>
                                {sessions.length === 0 && (
                                    <p style={{ padding: '12px', fontSize: '13px', color: 'var(--text-faint)' }}>No conversations yet.</p>
                                )}
                                {sessions.map(session => (
                                    <div key={session.id} onClick={() => openSession(session.id)}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px',
                                            borderRadius: '10px', cursor: 'pointer', marginBottom: '2px',
                                            background: activeSession?.id === session.id ? 'var(--accent-soft)' : 'transparent',
                                            border: `1px solid ${activeSession?.id === session.id ? 'var(--accent-border)' : 'transparent'}`,
                                        }}>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {session.title}
                                            </p>
                                            {session.document_ids?.length > 0 && (
                                                <p style={{ fontSize: '10px', color: 'var(--accent-text)', marginTop: '2px' }}>
                                                    scoped to {session.document_ids.length} doc(s)
                                                </p>
                                            )}
                                        </div>
                                        <button onClick={e => removeSession(session.id, e)}
                                            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', fontSize: '12px' }}>✕</button>
                                    </div>
                                ))}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {uploadNote && (
                    <div style={{ flexShrink: 0, padding: '10px 14px', borderRadius: '10px', fontSize: '13px', border: '1px solid var(--accent-border)', background: 'var(--accent-soft)', color: 'var(--accent-text)', display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
                        <span>{uploadNote}</span>
                        <button onClick={() => setUploadNote(null)} style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer' }}>✕</button>
                    </div>
                )}

                {/* ── Two columns: chat | document preview ────────── */}
                <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: previewOpen ? '1fr 460px' : '1fr', gap: '16px' }}>

                    {/* Chat column */}
                    <div style={{
                        display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0,
                        border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
                        background: 'var(--surface-1)', overflow: 'hidden',
                    }}>
                        <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '14px', minHeight: 0 }}>
                            {!activeSession ? (
                                <WelcomeMessage scoped={false} />
                            ) : activeSession.messages.length === 0 ? (
                                <WelcomeMessage scoped={activeSession.document_ids?.length > 0} />
                            ) : (
                                activeSession.messages.map(message => (
                                    <MessageBubble key={message.id} message={message} onOpenCitation={openCitation} />
                                ))
                            )}

                            {busy && (
                                <div style={{ display: 'flex', gap: '6px', padding: '8px 4px' }}>
                                    {[0, 1, 2].map(i => (
                                        <motion.span key={i}
                                            animate={{ opacity: [0.2, 1, 0.2] }}
                                            transition={{ repeat: Infinity, duration: 1.2, delay: i * 0.2 }}
                                            style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent)' }} />
                                    ))}
                                </div>
                            )}

                            {webResults?.length > 0 && (
                                <div style={{ padding: '16px', borderRadius: '14px', border: '1px solid var(--accent-border)', background: 'var(--accent-soft)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '12px', flexWrap: 'wrap' }}>
                                        <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent-text)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                            🌐 Recommended web resources
                                        </p>
                                        <button
                                            onClick={() => navigate('/search', { state: { query: lastAsked, at: Date.now() } })}
                                            style={{
                                                fontSize: '12px', fontWeight: 600, color: 'var(--accent-text)',
                                                background: 'transparent', border: '1px solid var(--accent-border)',
                                                borderRadius: 'var(--radius-pill)', padding: '5px 12px', cursor: 'pointer',
                                            }}>
                                            🔎 Open full web search →
                                        </button>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                        {webResults.map((result, index) => (
                                            <a key={index} href={result.url} target="_blank" rel="noopener noreferrer"
                                               style={{ display: 'flex', gap: '10px', textDecoration: 'none', alignItems: 'flex-start' }}>
                                                <span style={{
                                                    flexShrink: 0, width: '20px', height: '20px', borderRadius: '6px',
                                                    background: 'var(--accent)', color: '#001', fontSize: '11px', fontWeight: 700,
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '2px',
                                                }}>
                                                    {result.rank ?? index + 1}
                                                </span>
                                                <div style={{ minWidth: 0 }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                                        <p style={{ fontSize: '13px', color: 'var(--accent-text)', fontWeight: 600 }}>{result.title}</p>
                                                        {typeof result.relevance === 'number' && (
                                                            <span style={{ fontSize: '10px', color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: 'var(--radius-pill)', padding: '1px 7px' }}>
                                                                {Math.round(result.relevance * 100)}% match
                                                            </span>
                                                        )}
                                                    </div>
                                                    {result.source && (
                                                        <p style={{ fontSize: '11px', color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', marginTop: '1px' }}>{result.source}</p>
                                                    )}
                                                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5, marginTop: '2px' }}>{result.snippet}</p>
                                                </div>
                                            </a>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {error && (
                                <div style={{ padding: '10px 14px', borderRadius: '10px', fontSize: '13px', border: '1px solid rgba(248,113,113,0.25)', background: 'rgba(248,113,113,0.08)', color: 'var(--danger)' }}>
                                    {error}
                                </div>
                            )}
                            <div ref={bottomRef} />
                        </div>

                        {/* Composer */}
                        <form onSubmit={handleAsk} style={{ padding: '14px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '8px', flexShrink: 0 }}>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <input
                                    value={question}
                                    onChange={e => setQuestion(e.target.value)}
                                    placeholder={activeSession ? 'Ask about your documents…' : 'Create a conversation to begin'}
                                    disabled={!activeSession || busy}
                                    style={{
                                        flex: 1, padding: '12px 16px', borderRadius: '12px',
                                        background: 'var(--surface-2)', border: '1px solid var(--border)',
                                        color: 'var(--text)', fontSize: '14px', outline: 'none', fontFamily: 'var(--font-sans)',
                                    }} />
                                <button type="submit" disabled={!question.trim() || busy || !activeSession}
                                    style={{
                                        padding: '0 22px', borderRadius: '12px', border: '1px solid var(--accent-border)',
                                        background: question.trim() && !busy && activeSession ? 'var(--accent)' : 'var(--surface-2)',
                                        color: question.trim() && !busy && activeSession ? '#001' : 'var(--text-faint)',
                                        fontSize: '14px', fontWeight: 700,
                                        cursor: question.trim() && !busy && activeSession ? 'pointer' : 'not-allowed',
                                    }}>
                                    Send
                                </button>
                            </div>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-muted)', cursor: 'pointer', userSelect: 'none' }}>
                                <input type="checkbox" checked={useWebSearch} onChange={e => setUseWebSearch(e.target.checked)} />
                                Augment with live web search when document context is weak
                            </label>
                        </form>
                    </div>

                    {/* Document preview column */}
                    {previewOpen && (
                        <DocumentPreview
                            documentId={preview.documentId}
                            documentName={preview.documentName}
                            targetChunkId={preview.chunkId}
                            onClose={() => setPreview(null)}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}

const toolbarBtn = {
    padding: '8px 14px', borderRadius: 'var(--radius-pill)', border: '1px solid var(--border)',
    background: 'var(--surface-2)', color: 'var(--text-secondary)', fontSize: '13px',
    fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
};
