import AppShell from '../components/AppShell';
import Hero from '../components/Hero';
import SearchBar from '../components/SearchBar';

export default function Home() {
    return (
        <AppShell center padded={false}>
            <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', gap: '40px',
                paddingTop: 'calc(var(--nav-height) + 24px)', paddingBottom: '48px',
            }}>
                <Hero />
                <SearchBar />
            </div>
        </AppShell>
    );
}
