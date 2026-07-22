/**
 * AppBackground — the single fixed, app-wide backdrop.
 *
 * Rendered once at the layout level and pinned to the viewport so every
 * route shares the exact same cinematic video background, dark wash, and
 * accent vignette. Pages render their content above it via AppShell.
 *
 * ⚙️  Background darkness is NOT hard-coded here — every value below reads a
 * token from the ATMOSPHERE block at the top of `index.css` (`--bg-dim`,
 * `--bg-video-opacity`, `--bg-dim-bottom`, `--bg-vignette`). Tune it there.
 */
export default function AppBackground() {
    return (
        <div aria-hidden="true" style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
            {/* Cinematic video — brightness via --bg-video-opacity */}
            <video
                src="/1.mp4"
                autoPlay
                muted
                loop
                playsInline
                style={{
                    position: 'absolute', inset: 0,
                    width: '100vw', height: '100vh',
                    objectFit: 'cover', opacity: 'var(--bg-video-opacity)',
                }}
            />
            {/* Dark wash — the main darkness control (--bg-dim) */}
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0, 0, 0, var(--bg-dim))' }} />
            {/* Accent vignette from the top (--bg-vignette) */}
            <div style={{
                position: 'absolute', inset: 0,
                background:
                    'radial-gradient(120% 60% at 50% -10%, rgba(var(--accent-rgb), var(--bg-vignette)), transparent 60%)',
            }} />
            {/* Subtle edge darkening at the bottom (--bg-dim-bottom) */}
            <div style={{
                position: 'absolute', inset: 0,
                background: 'linear-gradient(to bottom, transparent 60%, rgba(0, 0, 0, var(--bg-dim-bottom)))',
            }} />
        </div>
    );
}
