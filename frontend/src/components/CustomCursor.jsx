import { useEffect, useRef } from 'react';

/**
 * CustomCursor — magnetic + elastic pointer.
 *
 * - Dot: follows the raw pointer 1:1 (crisp focal point).
 * - Ring: trails with spring physics (velocity + stiffness/damping), so it
 *   stretches elastically when the pointer moves fast and settles back.
 * - Magnetic snap: over interactive elements the ring grows, eases toward
 *   the element's centre, and the whole element is nudged toward the pointer
 *   (a subtle magnetic pull), then springs back on leave.
 * - Monochrome with an electric-blue accent tint on interaction.
 *
 * All motion is driven by a single rAF loop writing transforms directly —
 * no React re-renders per frame.
 */

const MAGNETIC_SELECTOR =
    'a, button, [role="button"], label[for], input[type="submit"], .magnetic';
const MAGNETIC_STRENGTH = 0.28; // how far the element is pulled toward the pointer
const MAGNETIC_MAX = 14; // px cap on the pull

export default function CustomCursor() {
    const dotRef = useRef(null);
    const ringRef = useRef(null);

    useEffect(() => {
        // Skip entirely on touch / coarse pointers.
        if (!window.matchMedia?.('(pointer: fine)').matches) return;

        document.body.classList.add('cursor-none');

        const dot = dotRef.current;
        const ring = ringRef.current;

        const pointer = { x: innerWidth / 2, y: innerHeight / 2 };
        const ringPos = { x: pointer.x, y: pointer.y };
        const ringVel = { x: 0, y: 0 };
        let visible = false;
        let rafId = 0;

        // Magnetic target state
        let magnetEl = null;
        const magnetOffset = { x: 0, y: 0 };

        const setVisible = (v) => {
            visible = v;
            if (dot) dot.style.opacity = v ? '1' : '0';
            if (ring) ring.style.opacity = v ? '1' : '0';
        };

        const onMove = (e) => {
            pointer.x = e.clientX;
            pointer.y = e.clientY;
            if (!visible) setVisible(true);

            // Track a magnetic target under the pointer.
            const el = e.target.closest?.(MAGNETIC_SELECTOR);
            if (el !== magnetEl) {
                // release the previous element
                if (magnetEl) magnetEl.style.transform = '';
                magnetEl = el || null;
            }
        };

        const onLeaveWindow = () => setVisible(false);
        const onEnterWindow = () => setVisible(true);
        const onDown = () => ring && (ring.dataset.down = '1');
        const onUp = () => ring && (ring.dataset.down = '');

        addEventListener('mousemove', onMove, { passive: true });
        addEventListener('mouseleave', onLeaveWindow);
        addEventListener('mouseenter', onEnterWindow);
        addEventListener('mousedown', onDown, { passive: true });
        addEventListener('mouseup', onUp, { passive: true });

        const STIFFNESS = 0.14; // spring pull toward target
        const DAMPING = 0.72; // velocity retention (elastic settle)

        const animate = () => {
            // Where should the ring aim? The pointer, or an interactive
            // element's centre (magnetic snap).
            let targetX = pointer.x;
            let targetY = pointer.y;
            let hovering = false;

            if (magnetEl && magnetEl.isConnected) {
                const r = magnetEl.getBoundingClientRect();
                const cx = r.left + r.width / 2;
                const cy = r.top + r.height / 2;
                // ring eases toward the element centre
                targetX = cx + (pointer.x - cx) * 0.35;
                targetY = cy + (pointer.y - cy) * 0.35;
                hovering = true;

                // magnetic pull on the element itself
                const pull = (v) => Math.max(-MAGNETIC_MAX, Math.min(MAGNETIC_MAX, v * MAGNETIC_STRENGTH));
                magnetOffset.x += (pull(pointer.x - cx) - magnetOffset.x) * 0.2;
                magnetOffset.y += (pull(pointer.y - cy) - magnetOffset.y) * 0.2;
                magnetEl.style.transform = `translate(${magnetOffset.x}px, ${magnetOffset.y}px)`;
            }

            // Spring integrate the ring toward the target.
            const ax = (targetX - ringPos.x) * STIFFNESS;
            const ay = (targetY - ringPos.y) * STIFFNESS;
            ringVel.x = (ringVel.x + ax) * DAMPING;
            ringVel.y = (ringVel.y + ay) * DAMPING;
            ringPos.x += ringVel.x;
            ringPos.y += ringVel.y;

            // Elastic stretch: scale along the velocity vector.
            const speed = Math.hypot(ringVel.x, ringVel.y);
            const angle = Math.atan2(ringVel.y, ringVel.x) * (180 / Math.PI);
            const stretch = Math.min(speed / 55, 0.5); // 0 → 0.5
            const base = hovering ? 1.9 : 1;
            const scaleX = base * (1 + stretch);
            const scaleY = base * (1 - stretch * 0.7);
            const pressed = ring?.dataset.down ? 0.82 : 1;

            if (dot) {
                dot.style.transform = `translate(${pointer.x}px, ${pointer.y}px) translate(-50%, -50%) scale(${pressed})`;
            }
            if (ring) {
                ring.style.transform =
                    `translate(${ringPos.x}px, ${ringPos.y}px) translate(-50%, -50%) rotate(${angle}deg) scale(${scaleX * pressed}, ${scaleY * pressed})`;
                ring.style.borderColor = hovering
                    ? 'var(--accent)'
                    : 'rgba(255,255,255,0.75)';
                ring.style.opacity = visible ? (hovering ? '0.9' : '0.5') : '0';
            }

            rafId = requestAnimationFrame(animate);
        };
        rafId = requestAnimationFrame(animate);

        return () => {
            document.body.classList.remove('cursor-none');
            removeEventListener('mousemove', onMove);
            removeEventListener('mouseleave', onLeaveWindow);
            removeEventListener('mouseenter', onEnterWindow);
            removeEventListener('mousedown', onDown);
            removeEventListener('mouseup', onUp);
            cancelAnimationFrame(rafId);
            if (magnetEl) magnetEl.style.transform = '';
        };
    }, []);

    return (
        <>
            <div
                ref={dotRef}
                aria-hidden="true"
                style={{
                    position: 'fixed', top: 0, left: 0, width: 7, height: 7,
                    borderRadius: '50%', backgroundColor: '#fff',
                    pointerEvents: 'none', zIndex: 100000, opacity: 0,
                    mixBlendMode: 'difference', willChange: 'transform',
                    transition: 'opacity 0.25s ease',
                }}
            />
            <div
                ref={ringRef}
                aria-hidden="true"
                style={{
                    position: 'fixed', top: 0, left: 0, width: 34, height: 34,
                    borderRadius: '50%', border: '1.5px solid rgba(255,255,255,0.75)',
                    pointerEvents: 'none', zIndex: 99999, opacity: 0,
                    mixBlendMode: 'difference', willChange: 'transform',
                    transition: 'opacity 0.25s ease, border-color 0.2s ease',
                }}
            />
        </>
    );
}
