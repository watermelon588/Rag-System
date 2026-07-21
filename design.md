# Design System & Consistency Guide

This document is the single source of truth for how the interface looks and
behaves. The goal is a **cohesive, monochrome, cinematic dark UI with one
electric-blue accent** — every screen should feel like part of the same
product. When in doubt, follow this document rather than inventing new values.

All tokens live in [`frontend/src/index.css`](frontend/src/index.css) under
`:root`. **Never hard-code a hex/rgba that a token already covers** — reference
the CSS variable instead (`var(--accent)`, `var(--surface-2)`, …). Inline
styles may use `var(--token)` directly.

---

## 1. Foundations

### Color — monochrome + a single accent

The palette is intentionally almost colorless: black background, translucent
white surfaces, a white→transparent text ramp, and **one hue** — a subtle
electric blue — used only to draw the eye.

| Role | Token | Value |
|---|---|---|
| Background | `--bg` | `#000000` (video shows through) |
| Glass surface (low → high) | `--surface-1/2/3` | `rgba(255,255,255, .035 / .06 / .09)` |
| Border (default / strong) | `--border` / `--border-strong` | `rgba(255,255,255, .10 / .16)` |
| Text (primary → faint) | `--text` / `--text-secondary` / `--text-muted` / `--text-faint` | white at `.92 / .70 / .45 / .28` |
| **Accent** (electric blue) | `--accent` | `rgb(61, 139, 255)` |
| Accent soft / border / glow | `--accent-soft` / `--accent-border` / `--accent-glow` | blue at `.12 / .32 / .55` |

Compose accent alpha from the channels: `rgba(var(--accent-rgb), 0.2)`.

**Accent usage rule — the accent is a spotlight, not a coat of paint.** Use it
for: the active nav indicator, primary CTAs, focus/selection, links, key data
(relevance, confidence, citations), and interactive-hover cursor state. Do **not**
tint whole surfaces, body text, or large fills with it. If a screen looks blue,
it's overused.

**Status colors** (`--success` green, `--warning` amber, `--danger` red) are the
only exceptions to monochrome and are reserved for semantic feedback
(ready/failed, confidence tiers, errors) — never decoration.

### Typography

- **Family:** Inter (`--font-sans`) everywhere; monospace (`--font-mono`) only
  for URLs, IDs, and code.
- **Scale:** `--text-xs 11` · `--text-sm 13` · `--text-base 15` · `--text-lg 18`
  · `--text-xl 22` · `--text-2xl 30` · `--text-3xl clamp(38,6vw,72)` (hero only).
- **Weights:** 400 body, 500 secondary UI, 600 emphasis/labels, 700 headings.
- **Tracking:** headings use `--tracking-tight` (`-0.02em`); uppercase eyebrow
  labels use `+0.08–0.1em` at 10–11px, `--text-faint`.
- **Line-height:** ~1.6 for reading text, ~1.3 for headings.

### Spacing, radii, elevation

- **Spacing:** multiples of 4 (6, 8, 10, 12, 14, 16, 20, 24, 32, 40).
- **Radii:** `--radius-sm 8` (chips/inputs) · `--radius-md 12` (cards) ·
  `--radius-lg 16` (panels) · `--radius-xl 24` (hero surfaces) ·
  `--radius-pill` (buttons, badges, tabs).
- **Elevation:** `--shadow-card` for resting cards, `--shadow-pop` for popovers/
  menus/modals. Glass depth = surface alpha + `backdrop-filter: blur(12–24px)`.

### Motion

- Easing `--ease-out` `cubic-bezier(.22,1,.36,1)`; durations `--dur-fast .15s`,
  `--dur-base .25s`. Springs (framer-motion) for hovers/press: stiffness
  ~300, damping ~24.
- Entrances: fade + 8–18px rise (optionally a slight blur-in). Keep it subtle.
- **Always honor `prefers-reduced-motion`** (handled globally in `index.css`).

---

## 2. App-wide structure (consistency guarantees)

These shared pieces exist so pages can't drift apart. Reuse them; don't
re-implement.

- **Fixed background — [`AppBackground`](frontend/src/components/AppBackground.jsx).**
  Mounted **once** in `App.jsx`, pinned to the viewport (`position: fixed`,
  `z-index: 0`): the looping video at low opacity + dark wash + accent vignette.
  Every route shares the exact same backdrop. Pages must **not** add their own
  `<video>` or background fill — render transparent content above it.
- **Navbar — [`Navbar`](frontend/src/components/Navbar.jsx).** The one and only
  top bar: fixed, blurred glass, `--nav-height` (64px) tall. Active link = an
  electric-blue underline with glow; the sole primary CTA carries the accent.
  Offset page content by `calc(var(--nav-height) + 32px)`.
- **Page frame — [`AppShell`](frontend/src/components/AppShell.jsx).** Wraps a
  page with the Navbar + a centered max-width content column and the standard
  nav offset. Prefer it for new pages; complex full-height views (Chat) may lay
  out manually but must still keep the shared Navbar and a transparent root.
- **Cursor — [`CustomCursor`](frontend/src/components/CustomCursor.jsx).** See §4.

**z-index ladder** (keep these lanes): background `0` → page content `1–10` →
navbar `50` → in-page popovers/menus `1000` → cursor `99999–100000`. The upload
menu, citation popovers, etc. must sit at `1000` so they never hide behind the
navbar.

---

## 3. Components

- **Cards / panels:** `--surface-1/2` fill, `--border`, `--radius-md/lg`,
  `--shadow-card`, `backdrop-filter: blur(12px)`. Hover: lift `translateY(-2px)`
  and step the border to `--border-strong`.
- **Buttons:**
  - *Primary* — accent: `--accent-soft` fill, `--accent-border`, `--accent-text`
    (or solid white-on-black for max emphasis on the landing CTA).
  - *Secondary* — `--surface-2` fill, `--border`, `--text-secondary`.
  - *Ghost/icon* — transparent → `--surface-2` on hover.
  - Shape pill; press scales to ~0.97.
- **Inputs:** transparent/`--surface-1` fill, `--border`, white text,
  `caret-color` white; focus lifts the border and adds an accent ring/glow.
- **Badges / chips / tabs:** pill, `--text-xs`. Active tab & citation chips use
  the accent soft/border/text trio; status badges use status colors.
- **Popovers & menus:** `rgba(6,7,10,.96)` glass, `--border-strong`,
  `--shadow-pop`, `z-index: 1000`, and **open in a direction that can't be
  clipped** by the navbar (menus near the top open downward).

---

## 4. Custom cursor — magnetic + elastic

Interaction is part of the brand. The cursor ([`CustomCursor`](frontend/src/components/CustomCursor.jsx))
has two parts driven by one rAF loop (no React re-renders per frame):

- **Dot** — a small crisp point that tracks the pointer 1:1.
- **Ring** — trails with **spring physics** (stiffness/damping), **stretching
  elastically** along its velocity vector when moving fast, then settling.
- **Magnetic snap** — over any interactive element (`a, button, [role=button],
  label, .magnetic`) the ring grows and eases toward the element's center, and
  the element itself is gently pulled toward the pointer (capped), springing
  back on leave. The ring tints to `--accent` while hovering; press shrinks both.
- `mix-blend-mode: difference` keeps it legible on any background. Disabled on
  coarse/touch pointers and softened under `prefers-reduced-motion`.

Add the `.magnetic` class to opt any custom element into the magnetic pull.

---

## 5. Checklist for any new screen or component

1. Uses **tokens**, not hard-coded colors/sizes.
2. Sits on the shared **AppBackground** (transparent root) with the shared
   **Navbar**; content offset by the nav height.
3. Monochrome surfaces; **accent only** for emphasis/interaction/key data.
4. Inter + the type scale; correct text-ramp colors.
5. Motion uses the shared easing/durations and respects reduced-motion.
6. Interactive elements are cursor-magnetic and keyboard-focusable.
7. Popovers/menus at `z-index: 1000`, opening where they won't be clipped.
