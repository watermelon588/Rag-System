import Navbar from './Navbar';

/**
 * AppShell — consistent page frame used by every route.
 *
 * Guarantees the same fixed video background (via the app-level
 * AppBackground) sits behind every page and the same Navbar sits on top,
 * so structure, spacing and z-layering never drift between pages.
 *
 * Props:
 *   maxWidth  — content column width (default 1024px)
 *   center    — vertically center the content (landing / auth screens)
 *   padded    — apply the standard nav-offset top padding (default true)
 */
export default function AppShell({ children, maxWidth = 1024, center = false, padded = true }) {
    return (
        <div style={{ position: 'relative', zIndex: 1, minHeight: '100vh' }}>
            <Navbar />
            <main
                style={{
                    position: 'relative',
                    minHeight: center ? '100vh' : undefined,
                    display: center ? 'flex' : 'block',
                    alignItems: center ? 'center' : undefined,
                    justifyContent: center ? 'center' : undefined,
                    paddingTop: padded ? 'calc(var(--nav-height) + 32px)' : 0,
                    paddingBottom: padded ? '96px' : 0,
                }}
            >
                <div style={{ width: '100%', maxWidth, margin: '0 auto', padding: '0 24px' }}>
                    {children}
                </div>
            </main>
        </div>
    );
}
