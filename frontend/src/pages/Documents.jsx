import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import Navbar from '../components/Navbar';
import * as documentsApi from '../services/documentsApi';

const FORMAT_ICONS = {
    pdf: '📕', docx: '📘', txt: '📄', md: '📝', csv: '📊', tsv: '📊',
    xlsx: '📊', xls: '📊', html: '🌐', htm: '🌐', xml: '🧾', json: '🧾', code: '💻',
};

function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function StatusBadge({ status }) {
    const palette = {
        ready: { fg: 'rgba(74,222,128,0.95)', bg: 'rgba(74,222,128,0.10)' },
        processing: { fg: 'rgba(250,204,21,0.95)', bg: 'rgba(250,204,21,0.10)' },
        failed: { fg: 'rgba(248,113,113,0.95)', bg: 'rgba(248,113,113,0.10)' },
    }[status] || { fg: 'rgba(255,255,255,0.5)', bg: 'rgba(255,255,255,0.06)' };
    return (
        <span style={{
            fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em',
            color: palette.fg, background: palette.bg, borderRadius: '999px', padding: '2px 8px',
        }}>
            {status}
        </span>
    );
}

export default function Documents() {
    const navigate = useNavigate();
    const [documents, setDocuments] = useState([]);
    const [selected, setSelected] = useState(new Set());
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState(null);
    const [dragging, setDragging] = useState(false);
    const fileInputRef = useRef(null);

    const refresh = useCallback(async () => {
        try {
            const data = await documentsApi.listDocuments();
            setDocuments(data.documents);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { refresh(); }, [refresh]);

    async function handleUpload(files) {
        if (!files?.length) return;
        setUploading(true);
        setError(null);
        try {
            for (const file of files) {
                await documentsApi.uploadDocument(file);
            }
            await refresh();
        } catch (err) {
            setError(err.message);
            await refresh(); // earlier files in the batch may have succeeded
        } finally {
            setUploading(false);
        }
    }

    async function handleDelete(documentId) {
        setError(null);
        try {
            await documentsApi.deleteDocument(documentId);
            setSelected(prev => { const next = new Set(prev); next.delete(documentId); return next; });
            await refresh();
        } catch (err) {
            setError(err.message);
        }
    }

    function toggleSelect(documentId) {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(documentId)) next.delete(documentId);
            else next.add(documentId);
            return next;
        });
    }

    function startChat() {
        navigate('/chat', { state: { documentIds: [...selected] } });
    }

    const readyCount = documents.filter(d => d.status === 'ready').length;

    return (
        <div style={{ minHeight: '100vh', background: '#000', position: 'relative' }}>
            <div style={{
                position: 'fixed', inset: 0,
                background: 'radial-gradient(ellipse at 50% 0%, rgba(76,29,149,0.18), transparent 55%)',
                pointerEvents: 'none',
            }} />
            <Navbar />

            <div style={{ position: 'relative', zIndex: 10, maxWidth: '860px', margin: '0 auto', padding: '110px 24px 96px' }}>
                <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
                    <h1 style={{ fontSize: '26px', fontWeight: 700, color: '#fff', marginBottom: '6px' }}>
                        Your documents
                    </h1>
                    <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.45)', marginBottom: '28px' }}>
                        Upload PDFs, Word files, spreadsheets, markdown, code and more — then chat with them.
                    </p>
                </motion.div>

                {/* Upload dropzone */}
                <motion.div
                    initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
                    onDragOver={e => { e.preventDefault(); setDragging(true); }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={e => { e.preventDefault(); setDragging(false); handleUpload([...e.dataTransfer.files]); }}
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                        padding: '36px', borderRadius: '16px', textAlign: 'center', cursor: 'pointer',
                        border: `1.5px dashed ${dragging ? 'rgba(167,139,250,0.65)' : 'rgba(255,255,255,0.15)'}`,
                        background: dragging ? 'rgba(139,92,246,0.08)' : 'rgba(255,255,255,0.03)',
                        transition: 'all 0.2s ease', marginBottom: '28px',
                    }}>
                    <input
                        ref={fileInputRef} type="file" multiple style={{ display: 'none' }}
                        accept=".pdf,.docx,.txt,.md,.markdown,.csv,.tsv,.xlsx,.xls,.html,.htm,.xml,.json,.py,.js,.jsx,.ts,.tsx,.java,.c,.cpp,.cs,.go,.rs,.rb,.php,.sql,.sh,.yaml,.yml,.toml"
                        onChange={e => { handleUpload([...e.target.files]); e.target.value = ''; }}
                    />
                    <div style={{ fontSize: '28px', marginBottom: '10px' }}>{uploading ? '⏳' : '📎'}</div>
                    <p style={{ fontSize: '14px', fontWeight: 600, color: 'rgba(255,255,255,0.8)', marginBottom: '4px' }}>
                        {uploading ? 'Uploading & indexing…' : 'Drop files here or click to upload'}
                    </p>
                    <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)' }}>
                        PDF · DOCX · TXT · MD · CSV · Excel · HTML · XML · JSON · source code
                    </p>
                </motion.div>

                {error && (
                    <div style={{
                        padding: '12px 16px', borderRadius: '12px', marginBottom: '20px',
                        border: '1px solid rgba(239,68,68,0.25)', background: 'rgba(239,68,68,0.08)',
                        color: 'rgba(252,165,165,0.9)', fontSize: '13px',
                    }}>
                        {error}
                    </div>
                )}

                {/* Chat CTA */}
                {readyCount > 0 && (
                    <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        marginBottom: '16px', flexWrap: 'wrap', gap: '10px',
                    }}>
                        <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)' }}>
                            {selected.size > 0
                                ? `${selected.size} document(s) selected for chat`
                                : 'Select documents to scope a chat, or chat across everything'}
                        </p>
                        <motion.button
                            whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                            onClick={startChat}
                            style={{
                                padding: '9px 20px', borderRadius: '999px', border: 'none',
                                background: '#fff', color: '#000', fontSize: '13px', fontWeight: 600,
                                cursor: 'pointer',
                            }}>
                            💬 Chat with {selected.size > 0 ? 'selection' : 'all documents'}
                        </motion.button>
                    </div>
                )}

                {/* Document list */}
                {loading ? (
                    <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '14px', textAlign: 'center', padding: '40px 0' }}>
                        Loading…
                    </p>
                ) : documents.length === 0 ? (
                    <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '14px', textAlign: 'center', padding: '40px 0' }}>
                        No documents yet — upload one to get started.
                    </p>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <AnimatePresence>
                            {documents.map(document => (
                                <motion.div
                                    key={document.id} layout
                                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -20 }}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '14px',
                                        padding: '14px 18px', borderRadius: '12px',
                                        border: selected.has(document.id)
                                            ? '1px solid rgba(129,140,248,0.5)'
                                            : '1px solid rgba(255,255,255,0.09)',
                                        background: selected.has(document.id)
                                            ? 'rgba(129,140,248,0.08)'
                                            : 'rgba(255,255,255,0.03)',
                                        cursor: document.status === 'ready' ? 'pointer' : 'default',
                                        transition: 'border-color 0.15s ease, background 0.15s ease',
                                    }}
                                    onClick={() => document.status === 'ready' && toggleSelect(document.id)}
                                >
                                    <span style={{ fontSize: '22px' }}>{FORMAT_ICONS[document.format] || '📄'}</span>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <p style={{
                                            fontSize: '14px', fontWeight: 600, color: 'rgba(255,255,255,0.9)',
                                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                        }}>
                                            {document.filename}
                                        </p>
                                        <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)', marginTop: '2px' }}>
                                            {formatBytes(document.size_bytes)}
                                            {document.page_count ? ` · ${document.page_count} pages` : ''}
                                            {document.chunk_count ? ` · ${document.chunk_count} chunks indexed` : ''}
                                        </p>
                                        {document.error && (
                                            <p style={{ fontSize: '11px', color: 'rgba(248,113,113,0.8)', marginTop: '3px' }}>
                                                {document.error}
                                            </p>
                                        )}
                                    </div>
                                    <StatusBadge status={document.status} />
                                    <button
                                        onClick={e => { e.stopPropagation(); handleDelete(document.id); }}
                                        title="Delete document"
                                        style={{
                                            width: '30px', height: '30px', borderRadius: '8px',
                                            background: 'transparent', border: '1px solid rgba(255,255,255,0.10)',
                                            color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: '13px',
                                        }}
                                        onMouseEnter={e => { e.currentTarget.style.color = 'rgba(248,113,113,0.9)'; e.currentTarget.style.borderColor = 'rgba(248,113,113,0.4)'; }}
                                        onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.4)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)'; }}
                                    >
                                        ✕
                                    </button>
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </div>
                )}
            </div>
        </div>
    );
}
