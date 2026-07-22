import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import BounceCards from './BounceCards';
// All gallery sizing knobs live in one file — see src/config/gallery.js
import { GALLERY } from '../config/gallery';

/* ── Images ──────────────────────────────────────────────────────────────
   Every image in `src/assets/gallery/` is picked up automatically —
   .svg, .png, .jpg, .jpeg and .webp all work. Drop a file in (or delete
   one) and the gallery updates; no code change needed.

   Ordering follows the filename, so prefix with 01-, 02-, … The label
   under each card is derived from the filename:
       "02-visual-match.png"  →  "Visual match"
   ──────────────────────────────────────────────────────────────────────── */
const imageModules = import.meta.glob(
    '../assets/gallery/*.{svg,png,jpg,jpeg,webp,SVG,PNG,JPG,JPEG,WEBP}',
    { eager: true, query: '?url', import: 'default' },
);

function labelFromPath(path) {
    const file = path.split('/').pop().replace(/\.[^.]+$/, '');
    const words = file.replace(/^\d+[-_]?/, '').replace(/[-_]+/g, ' ').trim();
    return words.charAt(0).toUpperCase() + words.slice(1);
}

const SHOTS = Object.keys(imageModules)
    .sort()
    .map(path => ({ src: imageModules[path], label: labelFromPath(path) }));

/* Fan the cards out symmetrically around the centre, whatever the count. */
function buildTransforms(count, { spread, maxTilt }) {
    if (count === 0) return [];
    const middle = (count - 1) / 2;
    return Array.from({ length: count }, (_, i) => {
        const offset = i - middle;
        const x = Math.round(offset * spread);
        // Alternate the tilt so neighbours lean opposite ways.
        const tilt = middle === 0 ? 0 : ((offset / middle) * maxTilt * (i % 2 ? -1 : 1)).toFixed(2);
        return x === 0 ? `rotate(${tilt}deg)` : `rotate(${tilt}deg) translate(${x}px)`;
    });
}

const TRANSFORMS = buildTransforms(SHOTS.length, GALLERY);

/* Intrinsic width of the whole spread, used to scale down on small screens. */
const NATURAL_WIDTH =
    GALLERY.cardSize + GALLERY.spread * Math.max(0, SHOTS.length - 1) + 60;

export default function Gallery() {
    const wrapperRef = useRef(null);
    const [scale, setScale] = useState(1);

    useEffect(() => {
        const element = wrapperRef.current;
        if (!element) return;

        const fit = () => {
            const available = element.clientWidth;
            // Ignore zero/unmeasured widths: the element may not be laid out
            // yet, and ResizeObserver never fires while the page is hidden.
            // Scaling to 0 there would leave the gallery permanently invisible.
            if (!available) return;
            setScale(Math.min(1, available / NATURAL_WIDTH));
        };

        fit();
        const observer = new ResizeObserver(fit);
        observer.observe(element);
        window.addEventListener('resize', fit);
        return () => {
            observer.disconnect();
            window.removeEventListener('resize', fit);
        };
    }, []);

    if (!SHOTS.length) return null;

    return (
        <section
            aria-label="Product gallery"
            style={{
                position: 'relative',
                // Sibling cards slide outward on hover; clip horizontally so the
                // page never gains a scrollbar.
                overflowX: 'clip',
                padding: `${GALLERY.paddingTop}px 24px ${GALLERY.paddingBottom}px`,
            }}
        >
            <div style={{ maxWidth: 1024, margin: '0 auto' }}>
                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: '-80px' }}
                    transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                    style={{ textAlign: 'center', marginBottom: '40px' }}
                >
                    <p style={{
                        fontSize: 'var(--text-xs)', fontWeight: 600, textTransform: 'uppercase',
                        letterSpacing: '0.1em', color: 'var(--text-faint)', marginBottom: '14px',
                    }}>
                        Gallery
                    </p>
                    <h2 style={{
                        fontSize: 'var(--text-2xl)', fontWeight: 700, color: 'var(--text)',
                        letterSpacing: 'var(--tracking-tight)', lineHeight: 1.3,
                    }}>
                        Every surface, one system.
                    </h2>
                </motion.div>

                <div
                    ref={wrapperRef}
                    style={{ display: 'flex', justifyContent: 'center', width: '100%' }}
                >
                    <motion.div
                        initial={{ opacity: 0 }}
                        whileInView={{ opacity: 1 }}
                        viewport={{ once: true, margin: '-60px' }}
                        transition={{ duration: 0.5 }}
                        style={{
                            transform: `scale(${scale})`,
                            transformOrigin: 'center top',
                            // Reserve only the scaled height so the section doesn't
                            // keep a large empty gap on small screens.
                            height: GALLERY.containerHeight * scale,
                        }}
                    >
                        <BounceCards
                            images={SHOTS.map(shot => shot.src)}
                            labels={SHOTS.map(shot => shot.label)}
                            cardSize={GALLERY.cardSize}
                            pushDistance={GALLERY.hoverPush}
                            containerWidth={NATURAL_WIDTH}
                            containerHeight={GALLERY.containerHeight}
                            animationDelay={0.2}
                            animationStagger={0.08}
                            easeType="elastic.out(1, 0.6)"
                            transformStyles={TRANSFORMS}
                            enableHover
                        />
                    </motion.div>
                </div>

                {/* Minimal captions — the only copy in this section. */}
                <motion.ul
                    initial={{ opacity: 0, y: 10 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: 0.15 }}
                    style={{
                        display: 'flex', flexWrap: 'wrap', justifyContent: 'center',
                        gap: '10px', listStyle: 'none', marginTop: '48px',
                    }}
                >
                    {SHOTS.map(shot => (
                        <li
                            key={shot.label}
                            style={{
                                fontSize: 'var(--text-xs)', fontWeight: 500,
                                color: 'var(--text-muted)', background: 'var(--surface-1)',
                                border: '1px solid var(--border)', borderRadius: 'var(--radius-pill)',
                                padding: '6px 14px',
                            }}
                        >
                            {shot.label}
                        </li>
                    ))}
                </motion.ul>
            </div>
        </section>
    );
}
