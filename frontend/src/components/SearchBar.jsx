import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { setPendingFiles, clearPendingFiles } from '../fileStore';
import { transcribe as transcribeApi } from '../services/searchApi';

/* Recording formats in preference order. We must record in a container the
   browser actually supports AND label the Blob/file with that same type —
   forcing "audio/webm" onto e.g. Safari's MP4 output produces a file the
   server cannot decode, which is why playback and transcription both failed. */
const AUDIO_FORMATS = [
    { mime: 'audio/webm;codecs=opus', ext: 'webm' },
    { mime: 'audio/webm', ext: 'webm' },
    { mime: 'audio/ogg;codecs=opus', ext: 'ogg' },
    { mime: 'audio/mp4', ext: 'm4a' },
    { mime: 'audio/mpeg', ext: 'mp3' },
];

function pickAudioFormat() {
    if (typeof MediaRecorder === 'undefined') return null;
    for (const format of AUDIO_FORMATS) {
        if (MediaRecorder.isTypeSupported?.(format.mime)) return format;
    }
    // Let the browser choose; we still need a sane extension for the upload.
    return { mime: '', ext: 'webm' };
}

/* ─── Upload type definitions ───────────────────────────────────── */
const UPLOAD_TYPES = [
    { id: 'all', accept: 'image/*,video/*,audio/*', title: 'Add photos & files', faClass: 'fa-solid fa-paperclip' },
    { id: 'image', accept: 'image/*', title: 'Image', faClass: 'fa-regular fa-image' },
    { id: 'video', accept: 'video/*', title: 'Video', faClass: 'fa-solid fa-film' },
    { id: 'audio', accept: 'audio/*', title: 'Audio', faClass: 'fa-solid fa-microphone-lines' },
];

/* Stable-ish id for attachment tracking. */
function makeId() {
    return (crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);
}

function fileKind(file) {
    if (file.type.startsWith('image/')) return 'image';
    if (file.type.startsWith('audio/')) return 'audio';
    if (file.type.startsWith('video/')) return 'video';
    return 'file';
}

/* ═══ SEARCHBAR ════════════════════════════════════════════════════ */
export default function SearchBar({ compact = false, initialQuery = '', loading: externalLoading = false }) {
    const [query, setQuery] = useState(initialQuery);
    // Each attachment: { id, file, previewUrl (images only), kind }
    const [attachments, setAttachments] = useState([]);
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
    const [voiceError, setVoiceError] = useState(null);
    const [transcribing, setTranscribing] = useState(false);
    // Live input level (0–1) so the user can *see* whether the mic hears them,
    // plus which device the browser actually picked and how loud the take was.
    const [micLevel, setMicLevel] = useState(0);
    const [micLabel, setMicLabel] = useState('');
    const [micMuted, setMicMuted] = useState(false);
    const [clipInfo, setClipInfo] = useState(null);   // { durationMs, peak }

    const navigate = useNavigate();
    const fileInputRef = useRef(null);
    const menuRef = useRef(null);
    const streamRef = useRef(null);
    const chunksRef = useRef([]);
    const formatRef = useRef(null);
    const audioCtxRef = useRef(null);
    const rafRef = useRef(null);
    const peakRef = useRef(0);
    const startedAtRef = useRef(0);

    const hasFiles = attachments.length > 0;

    /* Release the microphone — the recording indicator stays on until every
       track is stopped, so this must run on every exit path. */
    const stopStream = useCallback(() => {
        streamRef.current?.getTracks().forEach(track => track.stop());
        streamRef.current = null;
    }, []);

    /* Tear down the level meter's AudioContext / rAF loop. Safe to call twice. */
    const stopMeter = useCallback(() => {
        if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
        if (audioCtxRef.current) {
            audioCtxRef.current.close().catch(() => { /* already closed */ });
            audioCtxRef.current = null;
        }
        setMicLevel(0);
    }, []);

    /* Tap the live stream with an AnalyserNode and publish an RMS level each
       frame. This is the only way to tell "mic is muted / wrong device" apart
       from "server didn't understand me" — a silent take looks identical
       otherwise, and Opus compresses silence down to a couple of KB. */
    const startMeter = useCallback((stream) => {
        try {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            if (!Ctx) return;
            const ctx = new Ctx();
            audioCtxRef.current = ctx;
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 1024;
            ctx.createMediaStreamSource(stream).connect(analyser);
            const buf = new Float32Array(analyser.fftSize);

            const tick = () => {
                analyser.getFloatTimeDomainData(buf);
                let sum = 0;
                for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
                const rms = Math.sqrt(sum / buf.length);
                if (rms > peakRef.current) peakRef.current = rms;
                // Real samples are arriving — whatever the track flag said, the
                // mic is live, so retract the mute warning.
                if (rms > 0.005) setMicMuted(false);
                // Scale for display: normal speech sits around 0.05–0.2 RMS.
                setMicLevel(Math.min(1, rms * 8));
                rafRef.current = requestAnimationFrame(tick);
            };
            rafRef.current = requestAnimationFrame(tick);
        } catch (err) {
            console.warn('Level meter unavailable:', err);
        }
    }, []);

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

    /* ── revoke ALL preview object URLs on unmount ──────────────── */
    useEffect(() => {
        return () => {
            attachments.forEach(a => { if (a.previewUrl) URL.revokeObjectURL(a.previewUrl); });
            if (audioURL) URL.revokeObjectURL(audioURL);
            // Never leave the mic hot after the component goes away.
            streamRef.current?.getTracks().forEach(track => track.stop());
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            audioCtxRef.current?.close().catch(() => { /* already closed */ });
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /* ── append chosen Files (multiple) ─────────────────────────── */
    const applyFiles = useCallback((selectedList) => {
        const incoming = Array.from(selectedList || []).filter(Boolean);
        if (!incoming.length) return;
        setAttachments(prev => [
            ...prev,
            ...incoming.map(file => ({
                id: makeId(),
                file,
                kind: fileKind(file),
                previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
            })),
        ]);
    }, []);

    /* ── remove a single attachment ─────────────────────────────── */
    const removeFile = useCallback((id) => {
        setAttachments(prev => {
            const target = prev.find(a => a.id === id);
            if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
            const next = prev.filter(a => a.id !== id);
            if (!next.length) clearPendingFiles();
            return next;
        });
    }, []);

    /* ── icon button click ──────────────────────────────────────── */
    const handleUploadClick = (type) => {
        if (fileInputRef.current) {
            fileInputRef.current.accept = type.accept;
            fileInputRef.current.click();
        }
    };

    const handleFileChange = (e) => {
        applyFiles(e.target.files);
        e.target.value = '';
    };

    /* ── mic click handler ──────────────────────────────────────── */
    const handleMicClick = async () => {
        if (audioInstance) {
            audioInstance.pause();
            setAudioInstance(null);
        }
        setIsPlaying(false);
        setAudioBlob(null);
        setVoiceError(null);
        setTranscribing(false);
        setClipInfo(null);
        setMicLabel('');
        setMicMuted(false);
        peakRef.current = 0;
        if (audioURL) { URL.revokeObjectURL(audioURL); setAudioURL(null); }

        setShowVoiceModal(true);

        // getUserMedia only exists in a secure context. Over plain HTTP on a
        // LAN address `navigator.mediaDevices` is undefined, which previously
        // surfaced as a misleading "permission denied".
        if (!navigator.mediaDevices?.getUserMedia) {
            setVoiceError(
                window.isSecureContext
                    ? 'This browser does not support audio recording.'
                    : 'Recording needs a secure context. Open the app on http://localhost or over HTTPS.'
            );
            return;
        }

        try {
            // Ask for raw-ish audio: aggressive noise suppression on some
            // Windows drivers gates quiet speech down to digital silence.
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: false,
                    autoGainControl: true,
                },
            });
            streamRef.current = stream;

            const track = stream.getAudioTracks()[0];
            setMicLabel(track?.label || 'Default microphone');
            console.info('[voice] input device:', track?.label, track?.getSettings?.());
            // `track.muted` means the OS is delivering no samples (hardware mute
            // switch, or the device muted in Windows sound settings). It can read
            // true for a beat right after acquisition, so treat it as a live
            // warning that clears itself rather than a hard error.
            if (track) {
                setMicMuted(track.muted);
                track.onmute = () => { console.warn('[voice] track muted by OS'); setMicMuted(true); };
                track.onunmute = () => { console.info('[voice] track unmuted'); setMicMuted(false); };
            }
            startMeter(stream);

            const format = pickAudioFormat();
            formatRef.current = format;
            const recorder = format?.mime
                ? new MediaRecorder(stream, { mimeType: format.mime })
                : new MediaRecorder(stream);

            const chunks = [];
            chunksRef.current = chunks;

            recorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) chunks.push(e.data);
            };

            recorder.onerror = (event) => {
                console.error('MediaRecorder error:', event.error);
                setVoiceError('Recording failed. Please try again.');
                setIsRecording(false);
                stopMeter();
                stopStream();
            };

            recorder.onstop = () => {
                // Always release the mic, even when the take was empty.
                const peak = peakRef.current;
                const durationMs = startedAtRef.current ? Date.now() - startedAtRef.current : 0;
                stopMeter();
                stopStream();

                // Use the recorder's actual mimeType so the Blob is labelled
                // with the container that was really produced.
                const type = recorder.mimeType || format?.mime || 'audio/webm';
                const blob = new Blob(chunks, { type });
                setClipInfo({ durationMs, peak });
                console.info('[voice] take:', {
                    mimeType: type, bytes: blob.size, durationMs, peakRms: peak.toFixed(4),
                });

                if (blob.size === 0) {
                    setVoiceError('No audio was captured. Check your microphone and try again.');
                    return;
                }

                // Diagnose locally instead of burning a round-trip on a clip
                // that Whisper can only answer with "no speech detected".
                if (durationMs > 0 && durationMs < 700) {
                    setVoiceError('That take was under a second — hold the record button a little longer.');
                } else if (peak < 0.01) {
                    setVoiceError(
                        `The microphone captured near-silence (peak ${(peak * 100).toFixed(1)}%). ` +
                        `Check that “${track?.label || 'your mic'}” is the right input, is unmuted, ` +
                        'and that its input volume is up in Windows sound settings.'
                    );
                }

                const url = URL.createObjectURL(blob);
                setAudioBlob(blob);
                setAudioURL(url);

                const newAudio = new Audio(url);
                newAudio.onended = () => setIsPlaying(false);
                newAudio.onerror = () => setVoiceError('This clip could not be played back.');
                setAudioInstance(newAudio);
            };

            // A timeslice makes the recorder emit chunks as it goes, so a very
            // short take still yields data instead of an empty blob.
            recorder.start(250);
            startedAtRef.current = Date.now();
            setMediaRecorder(recorder);
            setIsRecording(true);
        } catch (err) {
            console.error('Mic error:', err);
            stopMeter();
            stopStream();
            setVoiceError(
                err?.name === 'NotAllowedError'
                    ? 'Microphone permission was denied. Allow mic access in your browser settings.'
                    : err?.name === 'NotFoundError'
                        ? 'No microphone was found on this device.'
                        : 'Could not start recording. Please try again.'
            );
        }
    };

    /* ── stop recording ─────────────────────────────────────────── */
    const stopRecording = () => {
        if (mediaRecorder && isRecording) {
            // Flush any buffered audio before the final ondataavailable.
            try { mediaRecorder.requestData?.(); } catch { /* not fatal */ }
            mediaRecorder.stop();
            setIsRecording(false);
        }
    };

    /* ── playback (handles the rejected play() promise) ─────────── */
    const togglePlayback = () => {
        if (!audioInstance) return;
        if (isPlaying) {
            audioInstance.pause();
            setIsPlaying(false);
            return;
        }
        audioInstance.play().then(
            () => setIsPlaying(true),
            (err) => {
                console.error('Playback failed:', err);
                setVoiceError('Playback was blocked by the browser.');
                setIsPlaying(false);
            },
        );
    };

    /* ── transcribe the take and drop the text into the query ───── */
    const useAsText = async () => {
        if (!audioBlob || transcribing) return;
        setTranscribing(true);
        setVoiceError(null);
        try {
            const ext = formatRef.current?.ext || 'webm';
            const file = new File([audioBlob], `recording.${ext}`, { type: audioBlob.type });
            const { text } = await transcribeApi(file);
            setQuery(prev => (prev.trim() ? `${prev.trim()} ${text}` : text));
            closeVoiceModal();
        } catch (err) {
            setVoiceError(err.message || 'Could not transcribe that recording.');
        } finally {
            setTranscribing(false);
        }
    };

    /* ── tidy teardown shared by cancel / escape / success ──────── */
    const closeVoiceModal = useCallback(() => {
        setShowVoiceModal(false);
        setIsPlaying(false);
        setVoiceError(null);
        setTranscribing(false);
        if (audioInstance) audioInstance.pause();
        setAudioInstance(null);
        setAudioBlob(null);
        if (audioURL) { URL.revokeObjectURL(audioURL); setAudioURL(null); }
        setMediaRecorder(prev => {
            if (prev && prev.state === 'recording') {
                try { prev.stop(); } catch { /* already stopped */ }
            }
            return null;
        });
        setIsRecording(false);
        setClipInfo(null);
        setMicMuted(false);
        stopMeter();
        stopStream();
    }, [audioInstance, audioURL, stopStream, stopMeter]);

    /* ── drag & drop ────────────────────────────────────────────── */
    const handleDrop = (e) => {
        e.preventDefault();
        setDragging(false);
        applyFiles(e.dataTransfer.files);
    };

    /* ── submit ─────────────────────────────────────────────────── */
    // The Search page owns the API call; the bar hands over the query text
    // (route state) and the File objects (in-memory fileStore).
    const handleSubmit = (e) => {
        e?.preventDefault();

        const q = (query || "").trim();
        if (!q && !hasFiles) return;

        const files = attachments.map(a => a.file);
        if (files.length) setPendingFiles(files);

        navigate("/search", {
            state: {
                query: q,
                files: attachments.map(a => ({ name: a.file.name, type: a.file.type })),
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
    const canSubmit = (!!query.trim() || hasFiles) && !isSubmitting;

    /* ── border / glow styles ───────────────────────────────────── */
    const borderColor = dragging
        ? 'rgba(61,139,255,0.65)'
        : focused ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.10)';

    const glowShadow = dragging
        ? '0 0 0 2px rgba(61,139,255,0.35), 0 8px 32px rgba(0,0,0,0.45)'
        : focused
            ? '0 0 0 1px rgba(255,255,255,0.12), 0 6px 28px rgba(0,0,0,0.40)'
            : '0 4px 20px rgba(0,0,0,0.30)';

    const kindIcon = (kind) =>
        kind === 'audio' ? 'fa-solid fa-microphone'
            : kind === 'video' ? 'fa-solid fa-video'
                : 'fa-solid fa-file';

    return (
        <>
            <motion.form
                onSubmit={handleSubmit}
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                layout
                transition={{ duration: 0.3, ease: 'easeOut', delay: 0.05 }}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                style={{
                    position: 'relative',
                    zIndex: showMenu ? 40 : 20,
                    width: '100%',
                    maxWidth: compact ? '640px' : '720px',

                    minHeight: compact ? '52px' : '58px',
                    height: hasFiles ? 'auto' : (compact ? '52px' : '58px'),
                    display: 'flex',
                    flexDirection: hasFiles ? 'column' : 'row',
                    alignItems: hasFiles ? 'stretch' : 'center',
                    gap: hasFiles ? '6px' : '8px',
                    padding: hasFiles ? '14px 16px' : '0 8px',

                    borderRadius: hasFiles ? '24px' : '999px',
                    border: `1px solid ${borderColor}`,
                    background: 'rgba(255,255,255,0.07)',
                    backdropFilter: 'blur(var(--blur-lg))',
                    WebkitBackdropFilter: 'blur(var(--blur-lg))',
                    boxShadow: glowShadow,
                    transition: 'border-color 0.2s ease, box-shadow 0.2s ease, border-radius 0.3s ease, padding 0.3s ease',
                    overflow: 'visible',
                }}
            >
                {/* hidden file input (multiple) */}
                <input type="file" multiple ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileChange} />

                {/* ── TOP ROW: attachment previews (row of thumbnails) ──────────── */}
                <AnimatePresence>
                    {hasFiles && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.2 }}
                            style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignSelf: 'flex-start', marginBottom: '4px', zIndex: 10 }}
                        >
                            {attachments.map(att => (
                                <div key={att.id} style={{ position: 'relative', flexShrink: 0 }}>
                                    <div style={{
                                        width: '48px',
                                        height: '48px',
                                        borderRadius: '10px',
                                        overflow: 'hidden',
                                        background: att.previewUrl ? 'transparent' : 'rgba(255,255,255,0.10)',
                                        border: '1px solid rgba(255,255,255,0.2)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                                    }}>
                                        {att.previewUrl ? (
                                            <img src={att.previewUrl} alt="preview"
                                                 style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                                        ) : (
                                            <i className={kindIcon(att.kind)} style={{ fontSize: '18px', color: 'rgba(61,139,255,0.85)' }} />
                                        )}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => removeFile(att.id)}
                                        title="Remove file"
                                        style={{
                                            position: 'absolute', top: '-6px', right: '-6px',
                                            width: '20px', height: '20px', borderRadius: '50%',
                                            background: 'rgba(20,20,30,0.95)', border: '1px solid rgba(255,255,255,0.2)',
                                            color: 'rgba(255,255,255,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            cursor: 'pointer', padding: 0, lineHeight: 1, zIndex: 2, boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                                            transition: 'background 0.15s ease, transform 0.15s ease',
                                        }}
                                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(220,50,50,0.95)'; e.currentTarget.style.transform = 'scale(1.1)'; }}
                                        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(20,20,30,0.95)'; e.currentTarget.style.transform = 'scale(1)'; }}
                                    >
                                        <i className="fa-solid fa-xmark" style={{ fontSize: '11px', pointerEvents: 'none' }} />
                                    </button>
                                </div>
                            ))}
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
                                width: '36px', height: '36px', borderRadius: '50%',
                                background: showMenu ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.05)',
                                border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.8)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                                transition: 'all 0.15s ease',
                            }}
                            onMouseEnter={e => { if (!showMenu) e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
                            onMouseLeave={e => { if (!showMenu) e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                        >
                            <i className="fa-solid fa-plus" style={{ fontSize: '15px', pointerEvents: 'none' }} />
                        </button>

                        <AnimatePresence>
                            {showMenu && (
                                <motion.div
                                    ref={menuRef}
                                    initial={{ opacity: 0, y: -8, scale: 0.96 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: -8, scale: 0.96 }}
                                    transition={{ duration: 0.15, ease: 'easeOut' }}
                                    style={{
                                        position: 'absolute', top: 'calc(100% + 12px)', left: 0,
                                        background: 'rgba(14,15,18,0.96)', border: '1px solid var(--border-strong)',
                                        borderRadius: '14px', padding: '8px', display: 'flex', flexDirection: 'column', gap: '2px',
                                        backdropFilter: 'blur(var(--blur-xl))', WebkitBackdropFilter: 'blur(var(--blur-xl))',
                                        boxShadow: 'var(--shadow-pop)', zIndex: 1000, minWidth: '190px',
                                    }}
                                >
                                    {UPLOAD_TYPES.map(type => (
                                        <button
                                            key={type.id}
                                            type="button"
                                            onClick={() => { handleUploadClick(type); setShowMenu(false); }}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px',
                                                borderRadius: '8px', background: 'transparent', border: 'none',
                                                color: 'rgba(209,213,219,1)', fontSize: '14px', fontWeight: 500,
                                                fontFamily: 'Inter, system-ui, sans-serif', cursor: 'pointer', textAlign: 'left',
                                                transition: 'background 0.15s ease, color 0.15s ease',
                                            }}
                                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = '#fff'; }}
                                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(209,213,219,1)'; }}
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
                        placeholder={hasFiles ? "Add words to refine your media…" : "Ask anything…"}
                        style={{
                            // Stretch to the pill's full height so the whole
                            // vertical band is tappable — a 22px-tall input is
                            // a fiddly thumb target on a phone.
                            flex: 1, minWidth: 0, alignSelf: 'stretch',
                            background: 'transparent', border: 'none', outline: 'none',
                            color: '#fff', paddingLeft: '6px', fontSize: compact ? '14px' : '15px',
                            fontFamily: 'Inter, system-ui, sans-serif', letterSpacing: '-0.01em',
                            caretColor: 'rgba(255,255,255,0.7)',
                        }}
                    />

                    {/* ── Voice recording button (🎤) ─────────────────────── */}
                    <button
                        type="button"
                        onClick={handleMicClick}
                        title="Record voice"
                        style={{
                            width: '34px', height: '34px', borderRadius: '50%', background: 'transparent',
                            border: '1px solid transparent', color: 'rgba(255,255,255,0.4)', display: 'flex',
                            alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                            transition: 'all 0.15s ease', flexShrink: 0,
                        }}
                        onMouseEnter={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.9)'; e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
                        onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.4)'; e.currentTarget.style.background = 'transparent'; }}
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
                            width: '36px', height: '36px', borderRadius: '50%',
                            background: canSubmit ? '#fff' : 'rgba(255,255,255,0.1)', border: 'none',
                            color: canSubmit ? '#000' : 'rgba(255,255,255,0.3)', display: 'flex',
                            alignItems: 'center', justifyContent: 'center', cursor: canSubmit ? 'pointer' : 'not-allowed',
                            flexShrink: 0, transition: 'background 0.2s ease, color 0.2s ease',
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
                        position: 'absolute', inset: 0, borderRadius: hasFiles ? '24px' : '999px',
                        background: 'rgba(61,139,255,0.10)', border: '1.5px dashed rgba(61,139,255,0.55)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none',
                        zIndex: 10, transition: 'border-radius 0.3s ease',
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
                            position: 'fixed', inset: 0, zIndex: 9999, display: 'flex',
                            alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)',
                            backdropFilter: 'blur(var(--blur-sm))', WebkitBackdropFilter: 'blur(var(--blur-sm))',
                        }}
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                            style={{
                                background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(var(--blur-xl))', WebkitBackdropFilter: 'blur(var(--blur-xl))',
                                border: '1px solid rgba(255,255,255,0.2)', borderRadius: '16px', padding: '32px', width: '320px',
                                display: 'flex', flexDirection: 'column', alignItems: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
                            }}
                        >
                            {!audioBlob ? (
                                <>
                                    {/* Bars are driven by the real input level, so a dead
                                        mic is visible immediately instead of after a
                                        failed transcription. */}
                                    <div style={{ display: 'flex', gap: '8px', height: '48px', alignItems: 'center', marginBottom: '14px' }}>
                                        {[0.55, 0.85, 1, 0.7].map((weight, i) => (
                                            <div
                                                key={i}
                                                style={{
                                                    width: '12px', height: '100%', background: '#000', borderRadius: '999px',
                                                    transform: `scaleY(${isRecording ? Math.max(0.1, micLevel * weight) : 0.1})`,
                                                    transition: 'transform 80ms linear',
                                                }}
                                            />
                                        ))}
                                    </div>
                                    <div style={{ fontSize: '18px', fontWeight: 500, color: '#fff', marginBottom: isRecording ? '6px' : voiceError ? '14px' : '32px', textShadow: '0 1px 4px rgba(0,0,0,0.4)' }}>
                                        {voiceError ? 'Can’t record' : isRecording ? 'Listening…' : 'Connecting…'}
                                    </div>
                                    {isRecording && (
                                        <div style={{
                                            fontSize: '11px',
                                            color: micMuted
                                                ? 'rgba(252,211,77,0.95)'
                                                : micLevel > 0.06 ? 'rgba(134,239,172,0.9)' : 'rgba(255,255,255,0.5)',
                                            textAlign: 'center', marginBottom: voiceError ? '14px' : '26px', lineHeight: 1.5,
                                            maxWidth: '250px',
                                        }}>
                                            {micMuted
                                                ? 'Windows is sending no audio from this mic — unmute it in Settings → System → Sound → Input (or the mute key/switch on your headset).'
                                                : micLevel > 0.06 ? 'Hearing you' : 'No sound yet — speak up'}
                                            {micLabel && <span style={{ display: 'block', color: 'rgba(255,255,255,0.4)' }}>{micLabel}</span>}
                                        </div>
                                    )}

                                    {voiceError && (
                                        <p style={{
                                            fontSize: '12.5px', color: 'rgba(252,165,165,0.95)', textAlign: 'center',
                                            lineHeight: 1.55, marginBottom: '22px',
                                        }}>
                                            {voiceError}
                                        </p>
                                    )}

                                    {voiceError ? (
                                        <button
                                            type="button"
                                            onClick={closeVoiceModal}
                                            style={{
                                                width: '100%', padding: '10px', borderRadius: '12px', background: '#fff',
                                                border: 'none', color: '#000', fontWeight: 600, cursor: 'pointer',
                                                fontFamily: 'Inter, system-ui, sans-serif',
                                            }}
                                        >
                                            Close
                                        </button>
                                    ) : (
                                        <>
                                            <button
                                                type="button"
                                                onClick={stopRecording}
                                                aria-label="Stop recording"
                                                style={{
                                                    width: '56px', height: '56px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)',
                                                    border: '1px solid rgba(255,255,255,0.2)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    cursor: isRecording ? 'pointer' : 'not-allowed', boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
                                                    transition: 'background 0.2s ease', opacity: isRecording ? 1 : 0.5, position: 'relative'
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
                                            <button
                                                type="button"
                                                onClick={closeVoiceModal}
                                                style={{
                                                    marginTop: '18px', background: 'transparent', border: 'none',
                                                    color: 'rgba(255,255,255,0.6)', fontSize: '12px', cursor: 'pointer',
                                                    fontFamily: 'Inter, system-ui, sans-serif',
                                                }}
                                            >
                                                Cancel
                                            </button>
                                        </>
                                    )}
                                </>
                            ) : (
                                <>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', background: 'rgba(255,255,255,0.1)', padding: '12px 20px', borderRadius: '999px', marginBottom: '18px', width: '100%', border: '1px solid rgba(255,255,255,0.15)' }}>
                                        <button
                                            type="button"
                                            onClick={togglePlayback}
                                            aria-label={isPlaying ? 'Pause' : 'Play recording'}
                                            style={{
                                                width: '36px', height: '36px', borderRadius: '50%', background: '#fff',
                                                border: 'none', color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                                                flexShrink: 0,
                                            }}
                                        >
                                            <i className={`fa-solid ${isPlaying ? 'fa-pause' : 'fa-play'}`} style={{ fontSize: '14px', marginLeft: isPlaying ? '0' : '2px' }} />
                                        </button>
                                        <div style={{ flex: 1, minWidth: 0, fontSize: '14px', color: '#fff', fontWeight: 500 }}>
                                            {isPlaying ? 'Playing…' : 'Tap to play'}
                                            <span style={{ display: 'block', fontSize: '11px', color: 'rgba(255,255,255,0.55)', fontWeight: 400 }}>
                                                {Math.max(1, Math.round(audioBlob.size / 1024))} KB
                                                {clipInfo?.durationMs ? ` · ${(clipInfo.durationMs / 1000).toFixed(1)}s` : ''}
                                                {clipInfo ? ` · peak ${(clipInfo.peak * 100).toFixed(0)}%` : ''}
                                            </span>
                                        </div>
                                    </div>

                                    {voiceError && (
                                        <p style={{
                                            width: '100%', fontSize: '12px', color: 'rgba(252,165,165,0.95)',
                                            marginBottom: '14px', lineHeight: 1.5,
                                        }}>
                                            {voiceError}
                                        </p>
                                    )}

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%' }}>
                                        {/* Primary: transcribe to text and drop it in the query box. */}
                                        <button
                                            type="button"
                                            onClick={useAsText}
                                            disabled={transcribing}
                                            style={{
                                                width: '100%', padding: '11px', borderRadius: '12px', background: '#fff',
                                                border: 'none', color: '#000', fontWeight: 600,
                                                cursor: transcribing ? 'wait' : 'pointer',
                                                fontFamily: 'Inter, system-ui, sans-serif', opacity: transcribing ? 0.75 : 1,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                                            }}
                                        >
                                            {transcribing ? (
                                                <><i className="fa-solid fa-circle-notch fa-spin" style={{ fontSize: '13px' }} /> Transcribing…</>
                                            ) : (
                                                <><i className="fa-solid fa-wand-magic-sparkles" style={{ fontSize: '13px' }} /> Use as text</>
                                            )}
                                        </button>

                                        <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
                                            <button
                                                type="button"
                                                onClick={closeVoiceModal}
                                                style={{
                                                    flex: 1, padding: '10px', borderRadius: '12px', background: 'transparent',
                                                    border: '1px solid rgba(255,255,255,0.3)', color: '#fff', cursor: 'pointer',
                                                    transition: 'background 0.2s', fontWeight: 500, fontFamily: 'Inter, system-ui, sans-serif',
                                                }}
                                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                            >
                                                Cancel
                                            </button>
                                            {/* Secondary: keep the clip as a multimodal attachment. */}
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const ext = formatRef.current?.ext || 'webm';
                                                    const audioFile = new File([audioBlob], `recording.${ext}`, { type: audioBlob.type });
                                                    applyFiles([audioFile]);
                                                    closeVoiceModal();
                                                }}
                                                style={{
                                                    flex: 1, padding: '10px', borderRadius: '12px', background: 'rgba(255,255,255,0.12)',
                                                    border: '1px solid rgba(255,255,255,0.3)', color: '#fff', fontWeight: 500,
                                                    cursor: 'pointer', fontFamily: 'Inter, system-ui, sans-serif',
                                                }}
                                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
                                                onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.12)'}
                                            >
                                                Attach clip
                                            </button>
                                        </div>
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
