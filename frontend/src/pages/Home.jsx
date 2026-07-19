import Navbar from '../components/Navbar';
import Hero from '../components/Hero';
import SearchBar from '../components/SearchBar';

export default function Home() {
    return (
        <div className="relative min-h-screen overflow-hidden bg-white/70">

            {/* Background video – autoplay, muted, loop */}
            <video
                src="/1.mp4"
                autoPlay
                muted
                loop
                playsInline
                className="absolute inset-0 w-full h-full object-cover"
                style={{ zIndex: 0, transform: 'translateY(4%)' }}
            />

            {/* Overlay: dark tint so text stays readable */}
            <div
                className="absolute inset-0 bg-black/65"
                style={{ zIndex: 1 }}
            />

            {/* All content above overlays */}
            <div className="relative" style={{ zIndex: 2 }}>
                <Navbar />

                <main className="min-h-screen flex items-center justify-center pt-24">
                    <div className="max-w-6xl mx-auto px-6 w-full flex flex-col items-center justify-center gap-10">
                        <Hero />
                        <SearchBar />
                    </div>
                </main>
            </div>

        </div>
    );
}
