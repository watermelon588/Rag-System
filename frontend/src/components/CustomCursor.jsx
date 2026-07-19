import { useEffect, useRef, useState } from 'react';

/**
 * CustomCursor
 * - Dot: 10px, instant follow
 * - Ring: 28px, smooth trailing via rAF lerp
 * - Hover: scales both up on a/button/input
 * - Input focus: glow pulse on dot
 * - mix-blend-mode: difference
 * - Hides native cursor globally via CSS class on <body>
 */
export default function CustomCursor() {
    const dotRef = useRef(null);
    const ringRef = useRef(null);

    // Live mouse position
    const mouse = useRef({ x: -100, y: -100 });
    // Lerped ring position
    const ring = useRef({ x: -100, y: -100 });
    const rafId = useRef(null);

    const [hovered, setHovered] = useState(false);
    const [focused, setFocused] = useState(false);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        // Hide native cursor
        document.body.classList.add('cursor-none');

        const onMouseMove = (e) => {
            mouse.current = { x: e.clientX, y: e.clientY };
            if (!visible) setVisible(true);
        };

        const onMouseLeave = () => setVisible(false);
        const onMouseEnter = () => setVisible(true);

        // Detect hover on interactive elements
        const onMouseOver = (e) => {
            const el = e.target.closest('a, button, [role="button"], label');
            setHovered(!!el);
        };

        // Detect input/textarea focus
        const onFocusIn = (e) => {
            if (e.target.matches('input, textarea')) setFocused(true);
        };
        const onFocusOut = (e) => {
            if (e.target.matches('input, textarea')) setFocused(false);
        };

        document.addEventListener('mousemove', onMouseMove, { passive: true });
        document.addEventListener('mouseleave', onMouseLeave);
        document.addEventListener('mouseenter', onMouseEnter);
        document.addEventListener('mouseover', onMouseOver, { passive: true });
        document.addEventListener('focusin', onFocusIn, { passive: true });
        document.addEventListener('focusout', onFocusOut, { passive: true });

        // rAF loop — lerp ring toward mouse
        const animate = () => {
            const LERP = 0.12; // lower = more lag
            ring.current.x += (mouse.current.x - ring.current.x) * LERP;
            ring.current.y += (mouse.current.y - ring.current.y) * LERP;

            if (dotRef.current) {
                dotRef.current.style.transform =
                    `translate(${mouse.current.x}px, ${mouse.current.y}px)`;
            }
            if (ringRef.current) {
                ringRef.current.style.transform =
                    `translate(${ring.current.x}px, ${ring.current.y}px)`;
            }

            rafId.current = requestAnimationFrame(animate);
        };
        rafId.current = requestAnimationFrame(animate);

        return () => {
            document.body.classList.remove('cursor-none');
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseleave', onMouseLeave);
            document.removeEventListener('mouseenter', onMouseEnter);
            document.removeEventListener('mouseover', onMouseOver);
            document.removeEventListener('focusin', onFocusIn);
            document.removeEventListener('focusout', onFocusOut);
            cancelAnimationFrame(rafId.current);
        };
    }, []);

    if (typeof window === 'undefined') return null;

    const dotSize = hovered ? 14 : 10;
    const ringSize = hovered ? 40 : 28;
    const dotOpacity = visible ? 1 : 0;
    const ringOpacity = visible ? (hovered ? 0.6 : 0.35) : 0;

    return (
        <>
            {/* Primary dot */}
            <div
                ref={dotRef}
                aria-hidden="true"
                style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    width: dotSize,
                    height: dotSize,
                    borderRadius: '50%',
                    backgroundColor: focused ? 'rgba(147,130,255,0.9)' : 'white',
                    boxShadow: focused
                        ? '0 0 12px 4px rgba(147,130,255,0.55)'
                        : hovered
                            ? '0 0 8px 2px rgba(255,255,255,0.4)'
                            : 'none',
                    marginLeft: -(dotSize / 2),
                    marginTop: -(dotSize / 2),
                    pointerEvents: 'none',
                    zIndex: 99999,
                    opacity: dotOpacity,
                    mixBlendMode: 'difference',
                    transition: 'width 0.18s ease, height 0.18s ease, opacity 0.2s ease, background-color 0.2s ease, box-shadow 0.2s ease',
                    willChange: 'transform',
                }}
            />

            {/* Trailing ring */}
            <div
                ref={ringRef}
                aria-hidden="true"
                style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    width: ringSize,
                    height: ringSize,
                    borderRadius: '50%',
                    border: `1.5px solid ${focused ? 'rgba(147,130,255,0.7)' : 'rgba(255,255,255,0.8)'}`,
                    backgroundColor: 'transparent',
                    marginLeft: -(ringSize / 2),
                    marginTop: -(ringSize / 2),
                    pointerEvents: 'none',
                    zIndex: 99998,
                    opacity: ringOpacity,
                    mixBlendMode: 'difference',
                    transition: 'width 0.25s ease, height 0.25s ease, opacity 0.25s ease, border-color 0.2s ease',
                    willChange: 'transform',
                }}
            />
        </>
    );
}
