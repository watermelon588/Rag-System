import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import Navbar from '../components/Navbar';
import SearchBar from '../components/SearchBar';
import RelevancePanel, { ConfidenceBadge } from '../components/RelevancePanel';
import { search as searchApi } from '../services/searchApi';
import { getPendingFiles, clearPendingFiles } from '../fileStore';
import { saveResult as saveResultApi } from '../services/profileApi';
import ImageDetailPanel from '../components/ImageDetailPanel';
import { useAuth } from '../context/AuthContext';

/* ─── Animation variants ─────────────────────────────────────── */
const containerVariants = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
};

const itemVariant = {
    hidden: { opacity: 0, y: 18, filter: 'blur(4px)' },
    show: {
        opacity: 1, y: 0, filter: 'blur(0px)',
        transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] },
    },
};

/* ─── Skeleton loader ────────────────────────────────────────── */
function SkeletonCard() {
    return (
        <div className="w-full p-5 rounded-xl border border-white/10 animate-pulse"
             style={{ background: 'rgba(255,255,255,0.04)' }}>
            <div className="h-3 w-20 rounded-full mb-3" style={{ background: 'rgba(255,255,255,0.10)' }} />
            <div className="h-5 w-3/4 rounded-full mb-2" style={{ background: 'rgba(255,255,255,0.10)' }} />
            <div className="h-3 w-2/5 rounded-full mb-3" style={{ background: 'rgba(255,255,255,0.08)' }} />
            <div className="space-y-2">
                <div className="h-3 w-full rounded-full" style={{ background: 'rgba(255,255,255,0.07)' }} />
                <div className="h-3 w-5/6 rounded-full" style={{ background: 'rgba(255,255,255,0.07)' }} />
            </div>
        </div>
    );
}

/* ─── Arrow icon ─────────────────────────────────────────────── */
function ArrowIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <path d="M4 14 14 4M7 4h7v7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

/* ─── Save (bookmark) button — visible only when signed in ───── */
function SaveButton({ item, compact = false }) {
    const { user } = useAuth();
    const [saved, setSaved] = useState(false);
    const [busy, setBusy] = useState(false);
    if (!user) return null;

    const handleSave = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (saved || busy) return;
        setBusy(true);
        try {
            await saveResultApi({
                category: item.category,
                title: item.title,
                url: item.url,
                snippet: item.snippet,
                source: item.source,
                thumbnail_url: item.thumbnail_url,
                image_url: item.image_url,
            });
            setSaved(true);
        } catch {
            /* best-effort */
        } finally {
            setBusy(false);
        }
    };

    return (
        <button
            type="button"
            onClick={handleSave}
            title={saved ? 'Saved to your profile' : 'Save result'}
            style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                padding: compact ? '5px 8px' : '5px 12px', borderRadius: '999px',
                background: saved ? 'rgba(16,185,129,0.14)' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${saved ? 'rgba(16,185,129,0.35)' : 'rgba(255,255,255,0.12)'}`,
                color: saved ? 'rgba(52,211,153,0.95)' : 'rgba(255,255,255,0.55)',
                fontSize: '11px', fontWeight: 600, cursor: saved ? 'default' : 'pointer',
                fontFamily: 'Inter, system-ui, sans-serif', transition: 'all 0.15s ease',
            }}
        >
            <i className={`fa-${saved ? 'solid' : 'regular'} fa-bookmark`} style={{ fontSize: '11px' }} />
            {!compact && (saved ? 'Saved' : 'Save')}
        </button>
    );
}

/* ─── Section header ─────────────────────────────────────────── */
function SectionHeader({ icon, title, count }) {
    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            marginBottom: '20px', paddingBottom: '14px',
            borderBottom: '1px solid rgba(255,255,255,0.07)',
        }}>
            <span style={{ color: 'rgba(61,139,255,0.9)', fontSize: '18px' }}>{icon}</span>
            <h2 style={{ fontSize: '15px', fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>{title}</h2>
            {count > 0 && (
                <span style={{
                    fontSize: '11px', fontWeight: 500, color: 'rgba(255,255,255,0.35)',
                    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)',
                    borderRadius: '999px', padding: '2px 8px',
                }}>
                    {count}
                </span>
            )}
        </div>
    );
}

/* ─── Web result card ────────────────────────────────────────── */
function WebCard({ item }) {
    return (
        <motion.div variants={itemVariant} whileHover={{ y: -2 }}
            transition={{ type: 'spring', stiffness: 300, damping: 24 }}
            className="group"
            style={{
                display: 'block', position: 'relative', width: '100%',
                padding: '20px', borderRadius: '12px',
                border: '1px solid rgba(255,255,255,0.09)',
                background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(var(--blur-glass))',
            }}>
            <a href={item.url} target="_blank" rel="noopener noreferrer"
               style={{ textDecoration: 'none', display: 'block' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: '12px', color: 'rgba(61,139,255,0.75)', marginBottom: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>
                            {item.url}
                        </p>
                        <h3 className="group-hover:underline underline-offset-2 decoration-white/30"
                            style={{ fontSize: '16px', fontWeight: 600, color: '#fff', lineHeight: 1.3, marginBottom: '8px' }}>
                            {item.title}
                        </h3>
                        {item.snippet && (
                            <p style={{ fontSize: '14px', color: 'rgba(209,213,219,0.85)', lineHeight: 1.65 }}>
                                {item.snippet}
                            </p>
                        )}
                    </div>
                    <div style={{ flexShrink: 0, marginTop: '4px', color: 'rgba(255,255,255,0.25)' }}>
                        <ArrowIcon />
                    </div>
                </div>
            </a>
            <RelevancePanel analysis={item.analysis} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
                <SaveButton item={item} />
            </div>
        </motion.div>
    );
}

/* ─── Image card ─────────────────────────────────────────────── */
function ImageCard({ item, onOpen }) {
    const [imgError, setImgError] = useState(false);
    return (
        <motion.div variants={itemVariant} whileHover={{ y: -4, scale: 1.02 }}
            transition={{ type: 'spring', stiffness: 280, damping: 22 }}
            role="button"
            tabIndex={0}
            aria-label={`View ${item.title || 'image'} full size`}
            onClick={onOpen}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen?.(); } }}
            style={{
                borderRadius: '12px', overflow: 'hidden', cursor: 'pointer',
                border: '1px solid rgba(255,255,255,0.09)',
                background: 'rgba(255,255,255,0.04)',
            }}>
            <div style={{ position: 'relative', paddingBottom: '66%', background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                {!imgError ? (
                    <img src={item.image_url} alt={item.title} onError={() => setImgError(true)}
                         style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.2)', fontSize: '12px' }}>
                        No preview
                    </div>
                )}
                <div style={{ position: 'absolute', top: '8px', right: '8px' }}>
                    <ConfidenceBadge level={item.analysis?.confidence} />
                </div>
                <div style={{ position: 'absolute', top: '8px', left: '8px' }}>
                    <SaveButton item={item} compact />
                </div>
            </div>
            <div style={{ padding: '10px 12px' }}>
                <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.75)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.title}
                </p>
                {item.source && (
                    <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.30)', marginTop: '3px' }}>{item.source}</p>
                )}
            </div>
        </motion.div>
    );
}

/* ─── Video card ─────────────────────────────────────────────── */
function VideoCard({ item }) {
    const [thumbError, setThumbError] = useState(false);
    return (
        <motion.div variants={itemVariant} whileHover={{ y: -3 }}
            transition={{ type: 'spring', stiffness: 300, damping: 24 }}
            className="group"
            style={{
                padding: '14px', borderRadius: '12px',
                border: '1px solid rgba(255,255,255,0.09)',
                background: 'rgba(255,255,255,0.04)',
            }}>
            <a href={item.url} target="_blank" rel="noopener noreferrer"
               style={{ display: 'flex', gap: '14px', alignItems: 'flex-start', textDecoration: 'none' }}>
                <div style={{
                    flexShrink: 0, width: '140px', height: '88px', borderRadius: '8px',
                    overflow: 'hidden', background: 'rgba(255,255,255,0.08)', position: 'relative',
                }}>
                    {item.thumbnail_url && !thumbError ? (
                        <img src={item.thumbnail_url} alt={item.title} onError={() => setThumbError(true)}
                             style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5">
                                <polygon points="5 3 19 12 5 21 5 3" />
                            </svg>
                        </div>
                    )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <h3 className="group-hover:underline underline-offset-2 decoration-white/30"
                        style={{ fontSize: '14px', fontWeight: 600, color: '#fff', lineHeight: 1.4, marginBottom: '6px' }}>
                        {item.title}
                    </h3>
                    {item.source && (
                        <p style={{ fontSize: '12px', color: 'rgba(61,139,255,0.75)' }}>{item.source}</p>
                    )}
                </div>
            </a>
            <RelevancePanel analysis={item.analysis} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
                <SaveButton item={item} />
            </div>
        </motion.div>
    );
}

/* ─── News card ──────────────────────────────────────────────── */
function NewsCard({ item }) {
    return (
        <motion.div variants={itemVariant} whileHover={{ y: -2 }}
            transition={{ type: 'spring', stiffness: 300, damping: 24 }}
            className="group"
            style={{
                padding: '14px 16px', borderRadius: '12px',
                border: '1px solid rgba(255,255,255,0.09)',
                background: 'rgba(255,255,255,0.04)',
            }}>
            <a href={item.url} target="_blank" rel="noopener noreferrer"
               style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', textDecoration: 'none' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                        {item.source && (
                            <span style={{
                                fontSize: '11px', fontWeight: 600, color: 'rgba(61,139,255,0.85)',
                                background: 'rgba(61,139,255,0.10)', border: '1px solid rgba(61,139,255,0.20)',
                                borderRadius: '999px', padding: '2px 8px',
                            }}>
                                {item.source}
                            </span>
                        )}
                        {item.date && (
                            <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.30)' }}>{item.date}</span>
                        )}
                    </div>
                    <h3 className="group-hover:underline underline-offset-2 decoration-white/30"
                        style={{ fontSize: '14px', fontWeight: 600, color: 'rgba(255,255,255,0.90)', lineHeight: 1.4 }}>
                        {item.title}
                    </h3>
                    {item.snippet && (
                        <p style={{ fontSize: '13px', color: 'rgba(209,213,219,0.70)', lineHeight: 1.55, marginTop: '5px' }}>
                            {item.snippet}
                        </p>
                    )}
                </div>
                <div style={{ flexShrink: 0, marginTop: '2px', color: 'rgba(255,255,255,0.25)' }}>
                    <ArrowIcon />
                </div>
            </a>
            <RelevancePanel analysis={item.analysis} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
                <SaveButton item={item} />
            </div>
        </motion.div>
    );
}

/* ─── Interpretation banner: how the system understood the input ─ */
function InterpretationBanner({ interpretation, summary, confidence, metadata }) {
    if (!interpretation) return null;
    const facts = [];
    const transcripts = interpretation.transcripts?.length
        ? interpretation.transcripts
        : (interpretation.transcript ? [interpretation.transcript] : []);
    const captions = interpretation.captions?.length
        ? interpretation.captions
        : (interpretation.image_caption ? [interpretation.image_caption] : []);
    transcripts.forEach(t => facts.push({ label: 'Heard', value: t }));
    captions.forEach(c => facts.push({ label: 'Saw', value: c }));
    facts.push({ label: 'Searched for', value: interpretation.interpreted_query });

    return (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            style={{
                marginBottom: '24px', padding: '16px 18px', borderRadius: '12px',
                border: '1px solid rgba(61,139,255,0.18)',
                background: 'rgba(61,139,255,0.05)', backdropFilter: 'blur(var(--blur-glass))',
            }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px', flexWrap: 'wrap' }}>
                <span style={{
                    fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
                    color: 'rgba(61,139,255,0.9)', background: 'rgba(61,139,255,0.12)',
                    border: '1px solid rgba(61,139,255,0.25)', borderRadius: '999px', padding: '3px 10px',
                }}>
                    {interpretation.modality} input
                </span>
                {interpretation.visual_search && (
                    <span style={{
                        fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
                        color: 'rgba(52,211,153,0.95)', background: 'rgba(16,185,129,0.12)',
                        border: '1px solid rgba(16,185,129,0.30)', borderRadius: '999px', padding: '3px 10px',
                    }}>
                        ◆ visual match
                    </span>
                )}
                <ConfidenceBadge level={confidence} />
                {metadata?.degraded && (
                    <span style={{ fontSize: '11px', color: 'rgba(250,204,21,0.8)' }}>
                        ⚠ semantic ranking degraded
                    </span>
                )}
                {metadata && (
                    <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', marginLeft: 'auto' }}>
                        {metadata.provider} · {Math.round(metadata.duration_ms)}ms
                    </span>
                )}
            </div>
            {facts.map(({ label, value }) => (
                <p key={label} style={{ fontSize: '13px', color: 'rgba(209,213,219,0.85)', lineHeight: 1.6 }}>
                    <span style={{ color: 'rgba(255,255,255,0.4)', fontWeight: 600, marginRight: '6px' }}>{label}:</span>
                    "{value}"
                </p>
            ))}
            {summary && (
                <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)', marginTop: '8px', lineHeight: 1.55 }}>
                    {summary}
                </p>
            )}
            {interpretation.notes?.length > 0 && (
                <p style={{ fontSize: '11px', color: 'rgba(61,139,255,0.6)', marginTop: '6px' }}>
                    {interpretation.notes.join(' · ')}
                </p>
            )}
        </motion.div>
    );
}

/* ─── Error banner ───────────────────────────────────────────── */
function ErrorBanner({ message }) {
    return (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            style={{
                padding: '16px 20px', borderRadius: '12px',
                border: '1px solid rgba(239,68,68,0.25)',
                background: 'rgba(239,68,68,0.08)', color: 'rgba(252,165,165,0.9)',
                fontSize: '14px', display: 'flex', alignItems: 'center', gap: '10px',
            }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{message}</span>
        </motion.div>
    );
}

function EmptySection({ label }) {
    return (
        <div style={{ padding: '40px 0', textAlign: 'center', color: 'rgba(255,255,255,0.25)', fontSize: '14px' }}>
            No {label} found for this query.
        </div>
    );
}

/* ═══ TABS CONFIG ═════════════════════════════════════════════════ */
const TABS = [
    { id: 'all', label: 'All', icon: '🔍' },
    { id: 'web', label: 'Web', icon: '🌐' },
    { id: 'images', label: 'Images', icon: '🖼️' },
    { id: 'videos', label: 'Videos', icon: '▶️' },
    { id: 'news', label: 'News', icon: '📰' },
];

const LIMIT = 5;

function TabButton({ id, label, icon, active, count, onClick }) {
    return (
        <button id={`tab-${id}`} onClick={() => onClick(id)}
            style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '7px 16px', borderRadius: '999px', fontSize: '13px',
                fontWeight: active ? 600 : 400, cursor: 'pointer',
                border: active ? '1px solid rgba(61,139,255,0.5)' : '1px solid rgba(255,255,255,0.09)',
                background: active ? 'rgba(61,139,255,0.15)' : 'rgba(255,255,255,0.04)',
                color: active ? 'rgba(175,205,255,0.95)' : 'rgba(255,255,255,0.45)',
                transition: 'all 0.2s ease',
            }}>
            <span style={{ fontSize: '14px' }}>{icon}</span>
            {label}
            {count > 0 && (
                <span style={{
                    fontSize: '10px', fontWeight: 500,
                    background: active ? 'rgba(61,139,255,0.25)' : 'rgba(255,255,255,0.08)',
                    borderRadius: '999px', padding: '1px 6px',
                    color: active ? 'rgba(175,205,255,0.8)' : 'rgba(255,255,255,0.30)',
                }}>
                    {count}
                </span>
            )}
        </button>
    );
}

/* ═══ MAIN COMPONENT ══════════════════════════════════════════════ */
export default function Search() {
    const location = useLocation();
    const query = location.state?.query || '';
    const filesMeta = location.state?.files || [];

    const [activeTab, setActiveTab] = useState('all');
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [page, setPage] = useState(1);
    const [error, setError] = useState(null);
    const [data, setData] = useState(null);
    const [openImageIndex, setOpenImageIndex] = useState(null);
    const requestKeyRef = useRef(null);

    const fileLabel = filesMeta.length === 1
        ? `[${filesMeta[0].name}]`
        : filesMeta.length > 1 ? `[${filesMeta.length} files]` : '';
    const displayQuery = fileLabel ? `${query ? `${query} ` : ''}${fileLabel}` : query;
    const hasQuery = Boolean(query || filesMeta.length);

    const searchAt = location.state?.at;
    const fileKey = filesMeta.map(f => f.name).join('|');
    useEffect(() => {
        if (!hasQuery) return;
        // One request per distinct search. The key dedupes React StrictMode's
        // double effect-invoke (and any incidental re-render) so we don't fire
        // — or abort — the request twice. We deliberately do NOT use an
        // AbortController here: aborting on the StrictMode cleanup was killing
        // the only in-flight request, which is why results never loaded.
        const requestKey = JSON.stringify({ query, files: fileKey, at: searchAt });
        if (requestKeyRef.current === requestKey) return;
        requestKeyRef.current = requestKey;

        const files = getPendingFiles();

        // Synchronously clear stale results the moment a new query begins.
        setLoading(true);
        setError(null);
        setData(null);
        setActiveTab('all');
        setPage(1);
        setOpenImageIndex(null);

        searchApi({ query, files, page: 1 })
            .then(response => {
                if (requestKeyRef.current !== requestKey) return; // superseded
                setData(response);
                clearPendingFiles();
            })
            .catch(err => {
                if (requestKeyRef.current === requestKey) setError(err.message);
            })
            .finally(() => {
                if (requestKeyRef.current === requestKey) setLoading(false);
            });
    }, [hasQuery, query, fileKey, searchAt]);

    // Fetch the next page and append its results per-category. We resend the
    // interpreted query as text so file inputs aren't re-processed each page.
    async function loadMore() {
        if (loadingMore || !data?.metadata?.has_more) return;
        const nextPage = page + 1;
        const textQuery = data.interpretation?.interpreted_query || query;
        setLoadingMore(true);
        setError(null);
        try {
            const response = await searchApi({ query: textQuery, page: nextPage });
            setData(prev => ({
                ...prev,
                results: {
                    web: [...(prev.results.web ?? []), ...(response.results.web ?? [])],
                    images: [...(prev.results.images ?? []), ...(response.results.images ?? [])],
                    videos: [...(prev.results.videos ?? []), ...(response.results.videos ?? [])],
                    news: [...(prev.results.news ?? []), ...(response.results.news ?? [])],
                },
                metadata: { ...prev.metadata, has_more: response.metadata.has_more },
            }));
            setPage(nextPage);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoadingMore(false);
        }
    }

    const results = {
        web: data?.results?.web ?? [],
        images: data?.results?.images ?? [],
        videos: data?.results?.videos ?? [],
        news: data?.results?.news ?? [],
    };
    const totalCount = results.web.length + results.images.length + results.videos.length + results.news.length;
    const tabCounts = {
        web: results.web.length, images: results.images.length,
        videos: results.videos.length, news: results.news.length,
    };
    const visibleTabs = TABS.filter(tab => tab.id === 'all' || loading || tabCounts[tab.id] > 0);

    function renderContent() {
        if (loading) {
            return (
                <motion.div key="skeleton" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {[1, 2, 3, 4].map(i => <SkeletonCard key={i} />)}
                </motion.div>
            );
        }
        if (error) return <ErrorBanner key="error" message={error} />;
        if (data && totalCount === 0) {
            return (
                <motion.div key="empty" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '60px', gap: '12px' }}>
                    <p style={{ color: 'rgba(156,163,175,1)', fontSize: '14px' }}>No results found for "{displayQuery}"</p>
                </motion.div>
            );
        }
        if (!data) return null;

        const show = activeTab;
        return (
            <motion.div key={show} initial="hidden" animate="show" exit={{ opacity: 0, transition: { duration: 0.15 } }}
                variants={containerVariants} style={{ display: 'flex', flexDirection: 'column', gap: '40px' }}>

                {(show === 'all' || show === 'web') && results.web.length > 0 && (
                    <section>
                        <SectionHeader icon="🌐" title="Web Results" count={results.web.length} />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            {(show === 'all' ? results.web.slice(0, LIMIT) : results.web).map((item, i) => (
                                <WebCard key={i} item={item} />
                            ))}
                        </div>
                    </section>
                )}
                {show === 'web' && results.web.length === 0 && <EmptySection label="web results" />}

                {(show === 'all' || show === 'images') && results.images.length > 0 && (
                    <section>
                        <SectionHeader icon="🖼️" title="Images" count={results.images.length} />
                        <motion.div variants={containerVariants} style={{
                            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '14px',
                        }}>
                            {(show === 'all' ? results.images.slice(0, LIMIT + 1) : results.images).map((item, i) => (
                                <ImageCard key={i} item={item} onOpen={() => setOpenImageIndex(i)} />
                            ))}
                        </motion.div>
                    </section>
                )}
                {show === 'images' && results.images.length === 0 && <EmptySection label="images" />}

                {(show === 'all' || show === 'videos') && results.videos.length > 0 && (
                    <section>
                        <SectionHeader icon="▶️" title="Videos" count={results.videos.length} />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {(show === 'all' ? results.videos.slice(0, LIMIT) : results.videos).map((item, i) => (
                                <VideoCard key={i} item={item} />
                            ))}
                        </div>
                    </section>
                )}
                {show === 'videos' && results.videos.length === 0 && <EmptySection label="videos" />}

                {(show === 'all' || show === 'news') && results.news.length > 0 && (
                    <section>
                        <SectionHeader icon="📰" title="News" count={results.news.length} />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {(show === 'all' ? results.news.slice(0, LIMIT) : results.news).map((item, i) => (
                                <NewsCard key={i} item={item} />
                            ))}
                        </div>
                    </section>
                )}
                {show === 'news' && results.news.length === 0 && <EmptySection label="news" />}

                {/* Pagination — on the "All" tab results are a per-category
                    preview, so paging happens inside a specific category tab. */}
                {data.metadata?.has_more && (
                    show === 'all' ? (
                        <p style={{ textAlign: 'center', fontSize: '13px', color: 'rgba(255,255,255,0.3)', paddingTop: '8px' }}>
                            Open a category tab above to load more results.
                        </p>
                    ) : (
                        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '8px' }}>
                            <motion.button
                                onClick={loadMore}
                                disabled={loadingMore}
                                whileHover={loadingMore ? {} : { scale: 1.03 }}
                                whileTap={loadingMore ? {} : { scale: 0.97 }}
                                style={{
                                    padding: '11px 28px', borderRadius: '999px',
                                    border: '1px solid rgba(61,139,255,0.35)',
                                    background: loadingMore ? 'rgba(255,255,255,0.05)' : 'rgba(61,139,255,0.12)',
                                    color: loadingMore ? 'rgba(255,255,255,0.4)' : 'rgba(175,205,255,0.95)',
                                    fontSize: '13px', fontWeight: 600,
                                    cursor: loadingMore ? 'wait' : 'pointer',
                                    fontFamily: 'Inter, system-ui, sans-serif',
                                }}>
                                {loadingMore ? 'Loading…' : `Load more (page ${page + 1})`}
                            </motion.button>
                        </div>
                    )
                )}
            </motion.div>
        );
    }

    return (
        <div style={{ minHeight: '100vh', position: 'relative' }}>
            <Navbar />

            <div style={{ position: 'relative', zIndex: 10, paddingTop: 'calc(var(--nav-height) + 32px)', paddingBottom: '96px' }}>
                <div style={{ maxWidth: '1024px', margin: '0 auto', paddingLeft: '24px', paddingRight: '24px' }}>

                    <div style={{ width: '100%', marginBottom: '32px' }}>
                        <SearchBar compact initialQuery={query ?? ''} loading={loading} />
                    </div>

                    {!hasQuery && (
                        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
                            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '96px', gap: '12px' }}>
                            <p style={{ color: 'rgba(156,163,175,1)', fontSize: '14px' }}>
                                Start searching to explore results
                            </p>
                        </motion.div>
                    )}

                    {hasQuery && (
                        <>
                            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                                style={{
                                    display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
                                    marginBottom: '20px', paddingBottom: '18px',
                                    borderBottom: '1px solid rgba(255,255,255,0.08)',
                                }}>
                                <div style={{ minWidth: 0, flex: 1, paddingRight: '16px' }}>
                                    <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.30)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 500, marginBottom: '5px' }}>
                                        Results for
                                    </p>
                                    <h1 style={{
                                        fontSize: 'var(--text-lg)', fontWeight: 400,
                                        color: 'var(--text-secondary)',
                                        letterSpacing: '0',
                                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                    }}>
                                        {displayQuery}
                                    </h1>
                                </div>
                                {!loading && data && (
                                    <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.25)', flexShrink: 0 }}>
                                        {totalCount} result{totalCount !== 1 ? 's' : ''}
                                    </span>
                                )}
                            </motion.div>

                            {!loading && data && (
                                <InterpretationBanner
                                    interpretation={data.interpretation}
                                    summary={data.summary}
                                    confidence={data.overall_confidence}
                                    metadata={data.metadata}
                                />
                            )}

                            {!loading && totalCount > 0 && (
                                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                                    style={{ display: 'flex', gap: '8px', marginBottom: '28px', flexWrap: 'wrap' }}>
                                    {visibleTabs.map(tab => (
                                        <TabButton key={tab.id} {...tab}
                                            active={activeTab === tab.id}
                                            count={tab.id !== 'all' ? tabCounts[tab.id] : 0}
                                            onClick={setActiveTab} />
                                    ))}
                                </motion.div>
                            )}

                            <AnimatePresence mode="wait">
                                {renderContent()}
                            </AnimatePresence>
                        </>
                    )}
                </div>
            </div>

            {/* Full-size image viewer with credits, description and ranking. */}
            <ImageDetailPanel
                item={openImageIndex === null ? null : results.images[openImageIndex] ?? null}
                onClose={() => setOpenImageIndex(null)}
                onPrev={openImageIndex > 0 ? () => setOpenImageIndex(i => i - 1) : undefined}
                onNext={
                    openImageIndex !== null && openImageIndex < results.images.length - 1
                        ? () => setOpenImageIndex(i => i + 1)
                        : undefined
                }
            />
        </div>
    );
}
