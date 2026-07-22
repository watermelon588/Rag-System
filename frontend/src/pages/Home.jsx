import Navbar from '../components/Navbar';
import Hero from '../components/Hero';
import SearchBar from '../components/SearchBar';
import Gallery from '../components/Gallery';
import Footer from '../components/Footer';

/**
 * Landing page. Laid out manually (rather than via AppShell) because it is a
 * multi-section page whose footer is full-bleed — it still sits on the shared
 * AppBackground with the shared Navbar, per design.md §2.
 */
export default function Home() {
    return (
        <div style={{ position: 'relative', zIndex: 1, minHeight: '100vh' }}>
            <Navbar />

            <main style={{ position: 'relative' }}>
                {/* Hero + search — the landing viewport. */}
                <section
                    style={{
                        // Well under a full viewport so the gallery peeks in and
                        // the gap below the search box stays tight.
                        minHeight: 'min(620px, 74svh)',
                        display: 'flex', flexDirection: 'column',
                        alignItems: 'center', justifyContent: 'center',
                        gap: 'clamp(24px, 4vw, 40px)',
                        padding: 'calc(var(--nav-height) + 16px) 20px 8px',
                    }}
                >
                    <Hero />
                    <SearchBar />
                </section>

                <Gallery />
            </main>

            <Footer />
        </div>
    );
}
