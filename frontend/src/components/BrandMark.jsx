// 128px downscale of logo2.png — the 1280px original is 212 KB for a mark
// that never renders above ~40px.
import logoFlat from '../assets/logo/logo2-128.png';
// Footer tile: a 160px downscale of logo3.png (the 2048px original is 2.6 MB —
// far too heavy to ship for a 40px mark).
import logoTile from '../assets/logo/logo3-160.png';

/**
 * BrandMark — the single source of truth for the Neuron lockup.
 *
 * Use this everywhere instead of re-typing the name or re-importing a logo,
 * so the mark and wordmark can never drift between screens.
 *
 *   <BrandMark />                 → logo2 (transparent white mark) + "Neuron"
 *   <BrandMark beveled />         → logo4 (black tile) with a beveled edge
 *
 * `beveled` is for surfaces where a floating transparent mark would read as
 * weightless — the footer, and the transactional email (where clients can't
 * be trusted to composite PNG alpha correctly).
 */
export default function BrandMark({
    size = 26,
    beveled = false,
    showName = true,
    nameSize = '17px',
    gap = '10px',
}) {
    return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap }}>
            <img
                src={beveled ? logoTile : logoFlat}
                alt="Neuron"
                width={size}
                height={size}
                style={{
                    display: 'block',
                    width: size,
                    height: size,
                    objectFit: 'contain',
                    flexShrink: 0,
                    ...(beveled && {
                        // Crisp beveled tile: a rounded edge and a hairline
                        // border only — no drop shadow / blur halo behind it.
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--border-strong)',
                    }),
                }}
            />
            {showName && (
                <span
                    style={{
                        fontFamily: 'var(--font-brand)',
                        fontWeight: 600,
                        fontSize: nameSize,
                        color: '#ffffff',
                        letterSpacing: '0.005em',
                        lineHeight: 1,
                    }}
                >
                    Neuron
                </span>
            )}
        </span>
    );
}
