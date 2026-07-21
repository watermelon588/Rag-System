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
            {/* Cinematic video */}
            <video
                src="/1.mp4"
                autoPlay
                muted
                loop
                playsInline
                style={{
                    position: 'absolute', inset: 0,
                    width: '100vw', height: '100vh',
                    objectFit: 'cover', opacity: 0.26,
                }}
            />
            {/* Dark wash for legibility */}
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.74)' }} />
            {/* Accent vignette from the top */}
            <div style={{
                position: 'absolute', inset: 0,
                background:
                    'radial-gradient(120% 60% at 50% -10%, rgba(var(--accent-rgb),0.10), transparent 60%)',
            }} />
            {/* Subtle grain/edge darkening at the bottom */}
            <div style={{
                position: 'absolute', inset: 0,
                background: 'linear-gradient(to bottom, transparent 55%, rgba(0,0,0,0.55))',
            }} />
        </div>
    );
}
