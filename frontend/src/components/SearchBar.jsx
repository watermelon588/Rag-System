import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { setPendingFile, clearPendingFile } from '../fileStore';

/* ─── Upload type definitions ───────────────────────────────────── */
const UPLOAD_TYPES = [
    { id: 'all', accept: 'image/*,video/*,audio/*', title: 'Add photos & files', faClass: 'fa-solid fa-paperclip' },
    { id: 'image', accept: 'image/*', title: 'Image', faClass: 'fa-regular fa-image' },
    { id: 'video', accept: 'video/*', title: 'Video', faClass: 'fa-solid fa-film' },
    { id: 'audio', accept: 'audio/*', title: 'Audio', faClass: 'fa-solid fa-microphone-lines' },
];

/* ═══ SEARCHBAR ════════════════════════════════════════════════════ */
export default function SearchBar({ compact = false, initialQuery = '', loading: externalLoading = false }) {
    const [query, setQuery] = useState(initialQuery);
    const [file, setFile] = useState(null);       // File | null
    const [imgPreview, setImgPreview] = useState(null);       // object URL | null
    const [focused, setFocused] = useState(false);
    const [dragging, setDragging] = useState(false);
    const [showMenu, setShowMenu] = useState(false);

    // Voice Modal State
    const [showVoiceModal, setShowVoiceModal] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [mediaRecorder, setMediaRecorder] = useState(null);
    const [audioBlob, setAudioBlob] = useState(null);
    const [audioURL, setAudioURL] = useState(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [audioInstance, setAudioInstance] = useState(null);

    const navigate = useNavigate();
    const fileInputRef = useRef(null);
    const activeTypeId = useRef(null);
    const menuRef = useRef(null);

    /* ── close menu on outside click ────────────────────────────── */
    useEffect(() => {
        function handleClickOutside(event) {
            if (menuRef.current && !menuRef.current.contains(event.target) && !event.target.closest('.plus-button')) {
                setShowMenu(false);
            }
        }
        if (showMenu) document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [showMenu]);

    /* ── revoke object URLs on unmount / change ─────────────────── */
    useEffect(() => {
        return () => { if (imgPreview) URL.revokeObjectURL(imgPreview); };
    }, [imgPreview]);

    useEffect(() => {
        return () => { if (audioURL) URL.revokeObjectURL(audioURL); };
    }, [audioURL]);

    /* ── apply a chosen File ────────────────────────────────────── */
    const applyFile = useCallback((selected) => {
        if (!selected) return;
        setFile(selected);
        setPendingFile(selected);
        if (selected.type.startsWith('image/')) {
            setImgPreview(URL.createObjectURL(selected));
        } else {
            setImgPreview(null);
        }
    }, []);

    /* ── remove file ────────────────────────────────────────────── */
    const removeFile = useCallback(() => {
        setFile(null);
        clearPendingFile();
        if (imgPreview) { URL.revokeObjectURL(imgPreview); setImgPreview(null); }
        if (fileInputRef.current) fileInputRef.current.value = '';
        activeTypeId.current = null;
    }, [imgPreview]);

    /* ── icon button click ──────────────────────────────────────── */
    const handleUploadClick = (type) => {
        activeTypeId.current = type.id;
        if (fileInputRef.current) {
            fileInputRef.current.accept = type.accept;
            fileInputRef.current.click();
        }
    };

    const handleFileChange = (e) => {
        applyFile(e.target.files?.[0]);
        e.target.value = '';
    };

    /* ── mic click handler ──────────────────────────────────────── */
    const handleMicClick = async () => {
        // Stop any playing audio & clear old blobs
        if (audioInstance) {
            audioInstance.pause();
            setAudioInstance(null);
        }
        setIsPlaying(false);
        setAudioBlob(null);
        if (audioURL) { URL.revokeObjectURL(audioURL); setAudioURL(null); }

        setShowVoiceModal(true);

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const recorder = new MediaRecorder(stream);
            const chunks = [];

            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunks.push(e.data);
            };

            recorder.onstop = () => {
                const blob = new Blob(chunks, { type: 'audio/webm' });
                if (blob.size === 0) return;
                const url = URL.createObjectURL(blob);
                setAudioBlob(blob);
                setAudioURL(url);

                const newAudio = new Audio(url);
                newAudio.onended = () => setIsPlaying(false);
                setAudioInstance(newAudio);

                stream.getTracks().forEach(track => track.stop());
            };

            recorder.start();
            setMediaRecorder(recorder);
            setIsRecording(true);
        } catch (err) {
            console.error("Mic error:", err);
            alert("Microphone permission denied or unavailable.");
            setShowVoiceModal(false);
        }
    };

    /* ── stop recording ─────────────────────────────────────────── */
    const stopRecording = () => {
        if (mediaRecorder && isRecording) {
            mediaRecorder.stop();
            setIsRecording(false);
        }
    };

    /* ── drag & drop ────────────────────────────────────────────── */
    const handleDrop = (e) => {
        e.preventDefault();
        setDragging(false);
        applyFile(e.dataTransfer.files?.[0]);
    };

    /* ── submit ─────────────────────────────────────────────────── */
    // The Search page owns the API call; the bar only hands over the
    // query text (route state) and the File object (in-memory fileStore).
    const handleSubmit = (e) => {
        e?.preventDefault();

        const q = (query || "").trim();
        if (!q && !file) return;

        if (file) setPendingFile(file);

        navigate("/search", {
            state: {
                query: q,
                file: file ? { name: file.name, type: file.type } : null,
                at: Date.now(), // makes re-submitting the same query re-fetch
            },
        });
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    };

    const isSubmitting = externalLoading;
    const canSubmit = (!!query.trim() || !!file) && !isSubmitting;

    /* ── border / glow styles ───────────────────────────────────── */
    const borderColor = dragging
        ? 'rgba(61,139,255,0.65)'
        : focused ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.10)';

    const glowShadow = dragging
        ? '0 0 0 2px rgba(61,139,255,0.35), 0 8px 32px rgba(0,0,0,0.45)'
        : focused
            ? '0 0 0 1px rgba(255,255,255,0.12), 0 6px 28px rgba(0,0,0,0.40)'
            : '0 4px 20px rgba(0,0,0,0.30)';

    /* ── file icon for non-image ────────────────────────────────── */
    const fileIconClass = file?.type.startsWith('audio/') ? 'fa-solid fa-microphone' : 'fa-solid fa-video';

    return (
        <>
            <motion.form
                onSubmit={handleSubmit}
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                layout // Framer motion automatic layout transitions
                transition={{ duration: 0.3, ease: 'easeOut', delay: 0.05 }}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                style={{
                    position: 'relative',
                    // Lift the whole search bar (and its downward-opening upload
                    // menu) above the results content, which otherwise paints
                    // over it as a later sibling in the same stacking context.
                    zIndex: showMenu ? 40 : 20,
                    width: '100%',
                    maxWidth: compact ? '640px' : '720px',

                    /* ── Layout Logic ── */
                    minHeight: compact ? '52px' : '58px',
                    height: file ? 'auto' : (compact ? '52px' : '58px'),
                    display: 'flex',
                    flexDirection: file ? 'column' : 'row',
                    alignItems: file ? 'stretch' : 'center',
                    gap: file ? '6px' : '8px',
                    padding: file ? '14px 16px' : '0 8px',

                    borderRadius: file ? '24px' : '999px',
                    border: `1px solid ${borderColor}`,
                    background: 'rgba(255,255,255,0.07)',
                    backdropFilter: 'blur(20px)',
                    WebkitBackdropFilter: 'blur(20px)',
                    boxShadow: glowShadow,
                    transition: 'border-color 0.2s ease, box-shadow 0.2s ease, border-radius 0.3s ease, padding 0.3s ease',
                    overflow: 'visible', // Must be visible for absolute popup menu
                }}
            >
                {/* hidden file input */}
                <input type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileChange} />

                {/* ── TOP ROW: File preview (Only visible when file exists) ──────────────────────── */}
                <AnimatePresence>
                    {file && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.8, height: 0 }}
                            animate={{ opacity: 1, scale: 1, height: 'auto' }}
                            exit={{ opacity: 0, scale: 0.8, height: 0 }}
                            transition={{ duration: 0.2 }}
                            style={{ position: 'relative', flexShrink: 0, alignSelf: 'flex-start', marginBottom: '4px', zIndex: 10 }}
                        >
                            {/* Thumbnail or icon */}
                            <div style={{
                                width: '48px',
                                height: '48px',
                                borderRadius: '10px',
                                overflow: 'hidden',
                                background: imgPreview ? 'transparent' : 'rgba(255,255,255,0.10)',
                                border: '1px solid rgba(255,255,255,0.2)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                            }}>
                                {imgPreview ? (
                                    <img
                                        src={imgPreview}
                                        alt="preview"
                                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                                    />
                                ) : (
                                    <i className={fileIconClass} style={{ fontSize: '20px', color: 'rgba(61,139,255,0.85)' }} />
                                )}
                            </div>

                            {/* Remove (×) badge */}
                            <button
                                type="button"
                                onClick={removeFile}
                                title="Remove file"
                                style={{
                                    position: 'absolute',
                                    top: '-6px',
                                    right: '-6px',
                                    width: '20px',
                                    height: '20px',
                                    borderRadius: '50%',
                                    background: 'rgba(20,20,30,0.95)',
                                    border: '1px solid rgba(255,255,255,0.2)',
                                    color: 'rgba(255,255,255,0.85)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    padding: 0,
                                    lineHeight: 1,
                                    transition: 'background 0.15s ease, color 0.15s ease, transform 0.15s ease',
                                    zIndex: 2,
                                    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                                }}
                                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(220,50,50,0.95)'; e.currentTarget.style.color = '#fff'; e.currentTarget.style.transform = 'scale(1.1)'; }}
                                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(20,20,30,0.95)'; e.currentTarget.style.color = 'rgba(255,255,255,0.85)'; e.currentTarget.style.transform = 'scale(1)'; }}
                            >
                                <i className="fa-solid fa-xmark" style={{ fontSize: '11px', pointerEvents: 'none' }} />
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* ── BOTTOM ROW: Controls + Input ──────────────────────── */}
                <div style={{ display: 'flex', width: '100%', alignItems: 'center', gap: '8px', flex: 1 }}>

                    {/* ── Left: [+] button and Menu ──────────────────────── */}
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                        <button
                            type="button"
                            className="plus-button"
                            onClick={() => setShowMenu(prev => !prev)}
                            style={{
                                width: '36px',
                                height: '36px',
                                borderRadius: '50%',
                                background: showMenu ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.05)',
                                border: '1px solid rgba(255,255,255,0.08)',
                                color: 'rgba(255,255,255,0.8)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                            }}
                            onMouseEnter={e => {
                                if (!showMenu) e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
                            }}
                            onMouseLeave={e => {
                                if (!showMenu) e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                            }}
                        >
                            <i className="fa-solid fa-plus" style={{ fontSize: '15px', pointerEvents: 'none' }} />
                        </button>

                        {/* Popup Menu */}
                        <AnimatePresence>
                            {showMenu && (
                                <motion.div
                                    ref={menuRef}
                                    initial={{ opacity: 0, y: -8, scale: 0.96 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: -8, scale: 0.96 }}
                                    transition={{ duration: 0.15, ease: 'easeOut' }}
                                    style={{
                                        position: 'absolute',
                                        // Open DOWNWARD from the button so it is never
                                        // clipped by (or hidden behind) the fixed navbar
                                        // when the search bar sits near the top of the page.
                                        top: 'calc(100% + 12px)',
                                        left: 0,
                                        background: 'rgba(14,15,18,0.96)',
                                        border: '1px solid var(--border-strong)',
                                        borderRadius: '14px',
                                        padding: '8px',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '2px',
                                        backdropFilter: 'blur(24px)',
                                        WebkitBackdropFilter: 'blur(24px)',
                                        boxShadow: 'var(--shadow-pop)',
                                        zIndex: 1000,
                                        minWidth: '190px'
                                    }}
                                >
                                    {UPLOAD_TYPES.map(type => (
                                        <button
                                            key={type.id}
                                            type="button"
                                            onClick={() => {
                                                handleUploadClick(type);
                                                setShowMenu(false);
                                            }}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '12px',
                                                padding: '10px 14px',
                                                borderRadius: '8px',
                                                background: 'transparent',
                                                border: 'none',
                                                color: 'rgba(209,213,219,1)',
                                                fontSize: '14px',
                                                fontWeight: 500,
                                                fontFamily: 'Inter, system-ui, sans-serif',
                                                cursor: 'pointer',
                                                textAlign: 'left',
                                                transition: 'background 0.15s ease, color 0.15s ease'
                                            }}
                                            onMouseEnter={e => {
                                                e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
                                                e.currentTarget.style.color = '#fff';
                                            }}
                                            onMouseLeave={e => {
                                                e.currentTarget.style.background = 'transparent';
                                                e.currentTarget.style.color = 'rgba(209,213,219,1)';
                                            }}
                                        >
                                            <i className={type.faClass} style={{ width: '16px', textAlign: 'center', fontSize: '15px' }} />
                                            {type.title}
                                        </button>
                                    ))}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* ── Text input ──────────────────────────────────────── */}
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                        onFocus={() => setFocused(true)}
                        onBlur={() => setFocused(false)}
                        placeholder="Ask anything…"
                        style={{
                            flex: 1,
                            minWidth: 0,
                            background: 'transparent',
                            border: 'none',
                            outline: 'none',
                            color: '#fff',
                            paddingLeft: '6px',
                            fontSize: compact ? '14px' : '15px',
                            fontFamily: 'Inter, system-ui, sans-serif',
                            letterSpacing: '-0.01em',
                            caretColor: 'rgba(255,255,255,0.7)',
                        }}
                    />

                    {/* ── Voice recording button (🎤) ─────────────────────── */}
                    <button
                        type="button"
                        onClick={handleMicClick}
                        title="Record voice"
                        style={{
                            width: '34px',
                            height: '34px',
                            borderRadius: '50%',
                            background: 'transparent',
                            border: '1px solid transparent',
                            color: 'rgba(255,255,255,0.4)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                            flexShrink: 0,
                        }}
                        onMouseEnter={e => {
                            e.currentTarget.style.color = 'rgba(255,255,255,0.9)';
                            e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.color = 'rgba(255,255,255,0.4)';
                            e.currentTarget.style.background = 'transparent';
                        }}
                    >
                        <i className="fa-solid fa-microphone" style={{ fontSize: '15px', pointerEvents: 'none' }} />
                    </button>

                    {/* ── Submit button (⬆) ────────────────────────────────── */}
                    <motion.button
                        type="submit"
                        disabled={!canSubmit}
                        whileHover={canSubmit ? { scale: 1.05 } : {}}
                        whileTap={canSubmit ? { scale: 0.95 } : {}}
                        transition={{ type: 'spring', stiffness: 420, damping: 22 }}
                        style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '50%',
                            background: canSubmit ? '#fff' : 'rgba(255,255,255,0.1)',
                            border: 'none',
                            color: canSubmit ? '#000' : 'rgba(255,255,255,0.3)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: canSubmit ? 'pointer' : 'not-allowed',
                            flexShrink: 0,
                            transition: 'background 0.2s ease, color 0.2s ease',
                        }}
                    >
                        {isSubmitting ? (
                            <i className="fa-solid fa-circle-notch fa-spin" style={{ fontSize: '15px' }} />
                        ) : (
                            <i className="fa-solid fa-arrow-up" style={{ fontSize: '16px' }} />
                        )}
                    </motion.button>
                </div>

                {/* ── Drag-over overlay ────────────────────────────────── */}
                {dragging && (
                    <div style={{
                        position: 'absolute',
                        inset: 0,
                        borderRadius: file ? '24px' : '999px',
                        background: 'rgba(61,139,255,0.10)',
                        border: '1.5px dashed rgba(61,139,255,0.55)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        pointerEvents: 'none',
                        zIndex: 10,
                        transition: 'border-radius 0.3s ease',
                    }}>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: 'rgba(145,185,255,0.90)' }}>
                            <i className="fa-solid fa-cloud-arrow-up" style={{ marginRight: '6px' }} />
                            Drop to attach
                        </span>
                    </div>
                )}
            </motion.form>

            {/* ── Voice Recording Modal ──────────────────────────────── */}
            <AnimatePresence>
                {showVoiceModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        style={{
                            position: 'fixed',
                            inset: 0,
                            zIndex: 9999,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: 'rgba(0,0,0,0.6)',
                            backdropFilter: 'blur(4px)',
                            WebkitBackdropFilter: 'blur(4px)',
                        }}
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                            style={{
                                background: 'rgba(255,255,255,0.1)',
                                backdropFilter: 'blur(24px)',
                                WebkitBackdropFilter: 'blur(24px)',
                                border: '1px solid rgba(255,255,255,0.2)',
                                borderRadius: '16px',
                                padding: '32px',
                                width: '320px',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
                            }}
                        >
                            {/* IF RECORDING OR WAITING TO RECORD */}
                            {!audioBlob ? (
                                <>
                                    <div style={{ display: 'flex', gap: '8px', height: '48px', alignItems: 'center', marginBottom: '24px' }}>
                                        {[
                                            { delay: 0.0, h: [0.7, 1.1, 0.7] },
                                            { delay: 0.2, h: [0.4, 0.8, 0.4] },
                                            { delay: 0.4, h: [0.2, 0.5, 0.2] },
                                            { delay: 0.6, h: [0.4, 0.8, 0.4] }
                                        ].map((cfg, i) => (
                                            <motion.div
                                                key={i}
                                                animate={{ scaleY: isRecording ? cfg.h : 0.1 }}
                                                transition={{ repeat: Infinity, duration: 1.0, delay: cfg.delay, ease: 'easeInOut' }}
                                                style={{ width: '12px', height: '100%', background: '#000', borderRadius: '999px', originY: 0.5 }}
                                            />
                                        ))}
                                    </div>
                                    <div style={{ fontSize: '18px', fontWeight: 500, color: '#fff', marginBottom: '32px', textShadow: '0 1px 4px rgba(0,0,0,0.4)' }}>
                                        {isRecording ? 'Listening...' : 'Connecting...'}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={stopRecording}
                                        style={{
                                            width: '56px', height: '56px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)',
                                            border: '1px solid rgba(255,255,255,0.2)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            cursor: isRecording ? 'pointer' : 'not-allowed',
                                            boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
                                            transition: 'background 0.2s ease',
                                            opacity: isRecording ? 1 : 0.5,
                                            position: 'relative'
                                        }}
                                        onMouseEnter={e => { if (isRecording) e.currentTarget.style.background = 'rgba(255,255,255,0.2)' }}
                                        onMouseLeave={e => { if (isRecording) e.currentTarget.style.background = 'rgba(255,255,255,0.1)' }}
                                    >
                                        <motion.div
                                            animate={{ scale: isRecording ? [1, 1.15, 1] : 1 }}
                                            transition={{ repeat: Infinity, duration: 1.5 }}
                                            style={{ width: '16px', height: '16px', background: '#ef4444', borderRadius: '50%', boxShadow: '0 0 12px rgba(239,68,68,0.8)' }}
                                        />
                                    </button>
                                </>
                            ) : (
                                /* IF RECORDING IS COMPLETE (PLAYBACK) */
                                <>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', background: 'rgba(255,255,255,0.1)', padding: '12px 20px', borderRadius: '999px', marginBottom: '24px', width: '100%', border: '1px solid rgba(255,255,255,0.15)' }}>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (audioInstance) {
                                                    if (isPlaying) { audioInstance.pause(); setIsPlaying(false); }
                                                    else { audioInstance.play(); setIsPlaying(true); }
                                                }
                                            }}
                                            style={{
                                                width: '36px', height: '36px', borderRadius: '50%', background: '#fff',
                                                border: 'none', color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                                            }}
                                        >
                                            <i className={`fa-solid ${isPlaying ? 'fa-pause' : 'fa-play'}`} style={{ fontSize: '14px', marginLeft: isPlaying ? '0' : '2px' }} />
                                        </button>
                                        <div style={{ flex: 1, fontSize: '14px', color: '#fff', fontWeight: 500, textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>
                                            {isPlaying ? 'Playing...' : 'Tap to play'}
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setShowVoiceModal(false);
                                                setAudioBlob(null);
                                                if (audioURL) URL.revokeObjectURL(audioURL);
                                                if (audioInstance) { audioInstance.pause(); setAudioInstance(null); }
                                                if (isRecording && mediaRecorder) mediaRecorder.stop();
                                                setIsPlaying(false);
                                            }}
                                            style={{
                                                flex: 1, padding: '10px', borderRadius: '12px', background: 'transparent',
                                                border: '1px solid rgba(255,255,255,0.3)', color: '#fff', cursor: 'pointer', transition: 'background 0.2s', fontWeight: 500, fontFamily: 'Inter, system-ui, sans-serif'
                                            }}
                                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const audioFile = new File([audioBlob], 'recording.webm', { type: 'audio/webm' });
                                                applyFile(audioFile);
                                                setShowVoiceModal(false);
                                                if (audioInstance) { audioInstance.pause(); setAudioInstance(null); }
                                                setIsPlaying(false);
                                            }}
                                            style={{
                                                flex: 1, padding: '10px', borderRadius: '12px', background: '#fff',
                                                border: 'none', color: '#000', fontWeight: 600, cursor: 'pointer', transition: 'opacity 0.2s', fontFamily: 'Inter, system-ui, sans-serif'
                                            }}
                                            onMouseEnter={e => e.currentTarget.style.opacity = '0.9'}
                                            onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                                        >
                                            Use audio
                                        </button>
                                    </div>
                                </>
                            )}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}

