/**
 * AppBackground — the single fixed, app-wide backdrop.
 *
 * Rendered once at the layout level and pinned to the viewport so every
 * route shares the exact same cinematic video background, dark wash, and
 * accent vignette. Pages render their content above it via AppShell.
 */
export default function AppBackground() {
    return (
        <div aria-hidden="true" style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
            {/* Cinematic video — brighter so the motion reads clearly */}
            <video
                src="/1.mp4"
                autoPlay
                muted
                loop
                playsInline
                style={{
                    position: 'absolute', inset: 0,
                    width: '100vw', height: '100vh',
                    objectFit: 'cover', opacity: 0.55,
                }}
            />
            {/* Light dark wash — just enough for text legibility */}
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.42)' }} />
            {/* Accent vignette from the top */}
            <div style={{
                position: 'absolute', inset: 0,
                background:
                    'radial-gradient(120% 60% at 50% -10%, rgba(var(--accent-rgb),0.08), transparent 60%)',
            }} />
            {/* Subtle edge darkening at the bottom for card legibility */}
            <div style={{
                position: 'absolute', inset: 0,
                background: 'linear-gradient(to bottom, transparent 60%, rgba(0,0,0,0.40))',
            }} />
        </div>
    );
}
