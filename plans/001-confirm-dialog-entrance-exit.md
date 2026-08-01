# 001 — Animate the confirm dialog in and out as a bottom sheet

- **Status**: DONE
- **Commit**: 958d863
- **Severity**: HIGH
- **Category**: Missed opportunity / Preventing a jarring change
- **Estimated scope**: 2 files, ~30 lines (1 CSS block edit + 1 JS file rewrite)

## Problem

`showConfirm()` creates the `.overlay`/`.dialog` bottom sheet and inserts it
directly into `document.body` with `appendChild`. Dismissal (`Cancel`,
`Confirm`, or tapping the backdrop) calls `overlay.remove()` immediately.
Neither the scrim nor the sheet has any transition — the dialog and its
backdrop teleport onto and off the screen instantly, even though it's styled
as a bottom sheet (`border-radius: 20px 20px 0 0`, anchored to the bottom via
`align-items: flex-end`).

`src/core/confirm-dialog.js:1-19` (current, full file):

```js
import { esc } from './dom.js';

export function showConfirm({ title, message, confirmLabel, confirmClass = 'btn-danger', onConfirm }) {
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `
  <div class="dialog">
    <h3>${esc(title)}</h3>
    <p>${esc(message)}</p>
    <div class="dialog-actions">
      <button class="btn btn-ghost" id="dialog-cancel">Cancel</button>
      <button class="btn ${confirmClass}" id="dialog-confirm">${esc(confirmLabel)}</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#dialog-cancel').addEventListener('click', () => overlay.remove());
  overlay.querySelector('#dialog-confirm').addEventListener('click', () => { overlay.remove(); onConfirm(); });
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}
```

`src/style.css:1643-1660` (current):

```css
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 300;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 0;
}

.dialog {
  background: var(--surface);
  border-radius: 20px 20px 0 0;
  padding: 24px;
  width: 100%;
  max-width: 480px;
}
```

## Target

The scrim fades in/out; the sheet slides up from `translateY(100%)` on enter
and slides back down on exit. Enter uses the iOS-like drawer curve at 280ms;
exit is faster (200ms) and uses `ease-out` — asymmetric timing, per the
Sonner principle that release/dismissal should always feel snappier than
entrance. Because the overlay is a freshly-created DOM node on every call,
`show` must be added on the *next frame* after insertion, not synchronously,
or the browser will coalesce the initial and target styles into one paint and
the transition won't run.

`src/style.css:1643-1660` (target — only additions/changes shown, rest of the
block is unchanged):

```css
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 300;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 0;
  opacity: 0;
  transition: opacity 200ms ease-out;
}

.overlay.show {
  opacity: 1;
}

.overlay.closing {
  transition-duration: 200ms;
}

.dialog {
  background: var(--surface);
  border-radius: 20px 20px 0 0;
  padding: 24px;
  width: 100%;
  max-width: 480px;
  transform: translateY(100%);
  transition: transform 280ms var(--ease-drawer);
}

.overlay.show .dialog {
  transform: translateY(0);
}

.overlay.closing .dialog {
  transition: transform 200ms var(--ease-out);
}
```

Add the two curve tokens to `:root` in `src/style.css` (lines 4-31) if they
are not already present (plan 002 also introduces `--ease-out`; if it has
already run, skip re-adding that line):

```css
:root {
  /* ...existing vars... */
  --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
  --ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);
}
```

`src/core/confirm-dialog.js` (target — full file):

```js
import { esc } from './dom.js';

export function showConfirm({ title, message, confirmLabel, confirmClass = 'btn-danger', onConfirm }) {
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `
  <div class="dialog">
    <h3>${esc(title)}</h3>
    <p>${esc(message)}</p>
    <div class="dialog-actions">
      <button class="btn btn-ghost" id="dialog-cancel">Cancel</button>
      <button class="btn ${confirmClass}" id="dialog-confirm">${esc(confirmLabel)}</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => overlay.classList.add('show'));
  });

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    overlay.classList.add('closing');
    overlay.classList.remove('show');
    overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
  };

  overlay.querySelector('#dialog-cancel').addEventListener('click', close);
  overlay.querySelector('#dialog-confirm').addEventListener('click', () => { close(); onConfirm(); });
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
}
```

## Repo conventions to follow

- No shared token file exists yet — curve/duration tokens live inline in
  `src/style.css`'s `:root` block (lines 4-31), alongside the existing color
  and shadow variables. Add new tokens there, in the same style (one
  `--name: value;` per line).
- The existing "mount then toggle a class on a later tick" pattern is already
  used correctly in `src/features/social/gifting.js:164-166` (staged
  `setTimeout` calls after the gift-reveal overlay is inserted) — same idea,
  just via `requestAnimationFrame` here since there's no deliberate staged
  delay to wait for.
- Keep using `esc()` from `./dom.js` for all interpolated text — untouched by
  this plan.

## Steps

1. In `src/style.css`, add `--ease-out: cubic-bezier(0.23, 1, 0.32, 1);` and
   `--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);` to the `:root` block
   (after line 30, before the closing `}` on line 31) — skip either line if
   it's already present.
2. In `src/style.css`, replace the `.overlay` rule (lines 1643-1652) with the
   target version above (adds `opacity: 0; transition: opacity 200ms
   ease-out;`).
3. Add the `.overlay.show` and `.overlay.closing` rules immediately after the
   `.overlay` rule.
4. In `src/style.css`, replace the `.dialog` rule (lines 1654-1660) with the
   target version above (adds `transform: translateY(100%); transition:
   transform 280ms var(--ease-drawer);`).
5. Add the `.overlay.show .dialog` and `.overlay.closing .dialog` rules
   immediately after the `.dialog` rule.
6. Replace the full contents of `src/core/confirm-dialog.js` with the target
   version above.

## Boundaries

- Do NOT touch any other file — `showConfirm()` is called from multiple
  features, but its public signature (`{ title, message, confirmLabel,
  confirmClass, onConfirm }`) and behavior (cancel = no-op, confirm = call
  `onConfirm`) are unchanged, so no caller needs updating.
- Do NOT add a new dependency (no animation library) — this is plain CSS
  transitions plus two `requestAnimationFrame` calls.
- Do NOT change the dialog's markup, copy, or button classes.
- If the current code at either file has drifted from the excerpts above
  (different property names, different structure), STOP and report instead
  of improvising.

## Verification

- **Mechanical**: `npm run dev`, open the app, trigger any confirm dialog
  (e.g. deleting a voucher). No build step required for a CSS/JS-only
  change; confirm no console errors on open/cancel/confirm/backdrop-tap.
- **Feel check**: 
  - Opening the dialog: the scrim should visibly fade in and the sheet
    should visibly slide up from the bottom edge — not appear instantly.
  - Tapping outside the dialog, Cancel, and Confirm should all trigger the
    same slide-down exit before the dialog leaves the DOM (watch that it
    doesn't just vanish).
  - Rapidly tap Cancel twice — the second tap must not throw (guarded by the
    `closed` flag) and must not double-attach a `transitionend` listener.
  - In DevTools, set the Animations panel playback to 10% and confirm the
    sheet's `transform` is the only thing visibly moving (no layout shift of
    content behind it).
  - Confirm the exit (200ms) is visibly quicker than the entrance (280ms).
- **Done when**: opening and closing any confirm dialog in the app shows a
  scrim fade + sheet slide in both directions, exit is faster than entrance,
  and double-dismissal doesn't error.
