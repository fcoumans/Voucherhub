# 003 — Respect prefers-reduced-motion in the gift-reveal celebration

- **Status**: DONE
- **Commit**: 958d863
- **Severity**: MEDIUM
- **Category**: Accessibility / Cohesion
- **Estimated scope**: 1 file (`src/style.css`), 1 new media-query block

## Problem

The welcome screen already respects `prefers-reduced-motion` (`src/style.css:743-749`).
The gift-reveal celebration — gift box lid flying off (`translate(10px, -70px)
rotate(-35deg)`), gift box base shrinking (`scale(0.75)`), and 1.1s confetti
pieces arcing outward — involves substantially larger movement than the
welcome screen's fades, and has **no** reduced-motion handling at all. This
is both an accessibility gap and a cohesion inconsistency: one entrance
sequence in the app respects the setting, the more intense one doesn't.

Current code, all in `src/style.css`:

```css
/* line 1786-1795 */
.gift-box-base {
  position: absolute;
  bottom: 0;
  width: 130px;
  height: 90px;
  background: linear-gradient(135deg, #13B5A2, #0E9488);
  border-radius: 10px;
  box-shadow: 0 12px 24px rgba(17, 35, 63, 0.18);
  transition: transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) 0.15s, opacity 0.4s ease 0.15s;
}

/* line 1807-1818 */
.gift-box-lid {
  position: absolute;
  top: 14px;
  left: -8px;
  width: 146px;
  height: 26px;
  background: #0E9488;
  border-radius: 8px;
  transform-origin: 20% 100%;
  transition: transform 0.55s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.5s ease 0.15s;
  z-index: 2;
}

/* line 1831-1839 */
.gift-box.open .gift-box-lid {
  transform: translate(10px, -70px) rotate(-35deg);
  opacity: 0;
}

.gift-box.open .gift-box-base {
  transform: scale(0.75);
  opacity: 0;
}

/* line 1857-1865 */
.confetti-layer.burst .confetti-piece {
  animation: confettiBurst 1.1s ease-out forwards;
  animation-delay: var(--delay, 0s);
}

@keyframes confettiBurst {
  0%   { transform: translate(0, 0) rotate(0deg); opacity: 1; }
  100% { transform: translate(var(--x), calc(var(--y) + 140px)) rotate(var(--rot)); opacity: 0; }
}

/* line 1867-1886 */
.gift-reveal-card {
  position: absolute;
  bottom: 10px;
  left: 50%;
  width: 180px;
  padding: 20px 16px;
  background: linear-gradient(135deg, #13B5A2, #0E9488);
  border-radius: var(--radius);
  box-shadow: 0 16px 32px rgba(17, 35, 63, 0.22);
  color: #fff;
  transform: translate(-50%, 10px) scale(0.5);
  opacity: 0;
  transition: transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.4s ease;
  z-index: 1;
}

.gift-reveal-card.revealed {
  transform: translate(-50%, 0) scale(1);
  opacity: 1;
}
```

## Target

Under `prefers-reduced-motion: reduce`: the box lid and base fade out in
place instead of flying/shrinking, confetti is skipped entirely (it's purely
decorative with no informational purpose), and the reveal card cross-fades
in place instead of scaling up from `0.5` with a bounce. Opacity — which aids
comprehension of the reveal — is kept everywhere; only movement is removed.

Add this block to `src/style.css`, immediately after the existing
`prefers-reduced-motion` block (after line 749):

```css
@media (prefers-reduced-motion: reduce) {
  .gift-box-lid,
  .gift-box-base {
    transition: opacity 200ms ease;
  }

  .gift-box.open .gift-box-lid,
  .gift-box.open .gift-box-base {
    transform: none;
  }

  .confetti-layer.burst .confetti-piece {
    animation: none;
    opacity: 0;
  }

  .gift-reveal-card {
    transform: translate(-50%, 0);
    transition: opacity 200ms ease;
  }

  .gift-reveal-card.revealed {
    transform: translate(-50%, 0);
  }
}
```

## Repo conventions to follow

- Mirror the existing pattern at `src/style.css:743-749` — a dedicated
  `@media (prefers-reduced-motion: reduce)` block placed near the animations
  it overrides, keeping opacity transitions but neutralizing transform
  movement (`transform: none` or a static value equal to the resting state).
- Do not introduce a JS-side `matchMedia` check — this codebase (see
  `src/features/social/gifting.js:164-166`) drives the whole reveal sequence
  through CSS class toggles (`open`, `burst`, `revealed`) with JS only
  handling timing; the reduced-motion override should stay pure CSS,
  consistent with that split.

## Steps

1. In `src/style.css`, insert the new `@media (prefers-reduced-motion:
   reduce) { ... }` block above immediately after line 749 (the closing
   brace of the existing welcome-screen reduced-motion block), before the
   `HOME SCREEN` section comment on line 751.
2. Do not modify the existing rules above it (`.gift-box-base`,
   `.gift-box-lid`, `.gift-box.open .gift-box-lid`, `.gift-box.open
   .gift-box-base`, `.confetti-layer.burst .confetti-piece`,
   `@keyframes confettiBurst`, `.gift-reveal-card`,
   `.gift-reveal-card.revealed`) — this plan only adds an override block.

## Boundaries

- Do NOT touch `src/features/social/gifting.js` — the JS timing (450ms /
  500ms / 850ms staged class toggles) is unchanged; the media query handles
  everything.
- Do NOT modify the non-reduced-motion animation values — full-motion users
  see no change.
- Do NOT remove the confetti DOM elements or JS that creates them — only
  suppress their animation and visibility via CSS.
- If the line numbers for the existing rules have drifted from the excerpts
  above, STOP and report instead of guessing where to insert the new block —
  find the existing `@media (prefers-reduced-motion: reduce)` block by
  content and insert immediately after it.

## Verification

- **Mechanical**: `npm run dev`, no build errors expected (pure CSS
  addition).
- **Feel check** (Chrome DevTools → Rendering panel → "Emulate CSS media
  feature prefers-reduced-motion: reduce"):
  - Trigger a gift reveal (claim a pending gift, or whatever flow renders
    `#gift-reveal-box`). With reduced motion emulated: the box lid and base
    should fade out in place — no flying, no shrinking. No confetti pieces
    should appear. The reveal card should fade in without scaling up or
    sliding.
  - Turn off the emulation and re-trigger the same flow: full motion (flying
    lid, shrinking base, confetti burst, scale-up card) should be completely
    unchanged from before this plan.
- **Done when**: the reduced-motion emulation shows only opacity changes
  across the whole gift-reveal sequence (box, confetti, card), and disabling
  the emulation restores the original full-motion sequence exactly.
