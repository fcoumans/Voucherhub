# 004 — Animate the push-notification toggle thumb with transform, not `left`

- **Status**: DONE
- **Commit**: 958d863
- **Severity**: MEDIUM
- **Category**: Performance
- **Estimated scope**: 1 file (`src/style.css`), 1 rule + 1 state selector

## Problem

`.push-toggle-thumb` animates the `left` property to slide the toggle knob.
`left` is a layout property — animating it forces the browser to recompute
layout and paint on every frame, unlike `transform`, which is
compositor/GPU-only.

`src/style.css:1561-1579` (current):

```css
.push-toggle {
  width: 44px; height: 26px;
  background: var(--border);
  border-radius: 13px;
  position: relative;
  flex-shrink: 0;
  transition: background 0.2s;
}
.push-toggle.on { background: var(--primary); }
.push-toggle-thumb {
  position: absolute;
  top: 3px; left: 3px;
  width: 20px; height: 20px;
  background: #fff;
  border-radius: 50%;
  box-shadow: 0 1px 3px rgba(0,0,0,0.2);
  transition: left 0.2s;
}
.push-toggle.on .push-toggle-thumb { left: 21px; }
```

## Target

Keep `left: 3px` as the thumb's static resting position; drive the "on"
state's 18px shift (`21px - 3px`) via `transform: translateX(18px)` instead,
transitioning `transform` (GPU-only). This is "moving on screen" motion, so
per the easing decision order it takes `ease-in-out`, not `ease-out`.
Duration is unchanged (200ms).

```css
.push-toggle {
  width: 44px; height: 26px;
  background: var(--border);
  border-radius: 13px;
  position: relative;
  flex-shrink: 0;
  transition: background 200ms ease;
}
.push-toggle.on { background: var(--primary); }
.push-toggle-thumb {
  position: absolute;
  top: 3px; left: 3px;
  width: 20px; height: 20px;
  background: #fff;
  border-radius: 50%;
  box-shadow: 0 1px 3px rgba(0,0,0,0.2);
  transition: transform 200ms var(--ease-in-out);
}
.push-toggle.on .push-toggle-thumb { transform: translateX(18px); }
```

Add the curve token to `:root` in `src/style.css` (lines 4-31) if not already
present:

```css
:root {
  /* ...existing vars... */
  --ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
}
```

## Repo conventions to follow

- Curve/duration tokens live inline in `src/style.css`'s `:root` block,
  alongside the existing color and shadow variables (same convention as
  plans 001/002, which introduce `--ease-drawer`/`--ease-out` the same way —
  add only `--ease-in-out` here if the others already exist from those
  plans).
- `.push-toggle`'s own `background` transition (line 1567) is unrelated to
  this finding (it's already a compositor-friendly color transition) — the
  duration unit is normalized to `200ms`/`ease` here only for consistency
  with the rewritten thumb rule; this is cosmetic, not a functional change.

## Steps

1. In `src/style.css`, add `--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);`
   to the `:root` block if it is not already present.
2. Replace the `.push-toggle-thumb` rule (`src/style.css:1570-1578`) so its
   `transition` reads `transition: transform 200ms var(--ease-in-out);`
   instead of `transition: left 0.2s;`.
3. Replace the `.push-toggle.on .push-toggle-thumb { left: 21px; }` rule
   (`src/style.css:1579`) with `.push-toggle.on .push-toggle-thumb {
   transform: translateX(18px); }`.
4. Optionally normalize `.push-toggle`'s `transition: background 0.2s;`
   (line 1567) to `transition: background 200ms ease;` for consistency —
   purely cosmetic, safe to skip if it causes any ambiguity with the current
   code.

## Boundaries

- Do NOT change `.push-toggle`'s dimensions, `.on` background color, or any
  other visual property.
- Do NOT touch `src/features/notifications/push.js` — this is a pure CSS
  fix; the JS only toggles the `.on` class, which is unchanged.
- If the current code at `src/style.css:1561-1579` has drifted from the
  excerpt above, STOP and report instead of improvising.

## Verification

- **Mechanical**: `npm run dev`, navigate to the settings/profile view that
  renders the push-notification toggle, no console errors.
- **Feel check**:
  - Tap the toggle: the knob should still visibly slide from left to right
    (and back) over the same ~200ms, ending up in the same visual position
    (flush right side of the pill) as before.
  - In DevTools Animations panel, confirm the animated property is
    `transform`, not `left`.
  - In the Performance/Rendering panel, confirm no layout (purple) bars are
    triggered by the toggle animation — only composite.
- **Done when**: the toggle's knob motion looks pixel-identical to before,
  driven entirely by `transform`, with no `left` animation remaining in the
  rule.
