# 002 — Replace `transition: all` with scoped properties across 9 rules

- **Status**: DONE
- **Commit**: 958d863
- **Severity**: HIGH
- **Category**: Performance / Physicality
- **Estimated scope**: 1 file (`src/style.css`), 9 rule edits + 1 token addition

## Problem

Nine rules in `src/style.css` use `transition: all <duration>`, which
animates every property that changes on the element — not just the ones the
rule actually cares about — and is an aggressive escalation trigger on its
own (unbounded property animation, some of which may not be
compositor-friendly). Each should transition only the specific properties it
changes, with the curve that matches what kind of change it is (`ease-out`
for press/entrance feedback, plain `ease` for hover/active-class color
swaps).

Current code, all in `src/style.css`:

```css
/* line 178 */
.btn {
  /* ... */
  transition: all 0.15s;
}
/* .btn:active { transform: scale(0.97); } — line 183 */
/* .btn-primary:hover { background: var(--primary-dark); } — line 190 */
/* .btn-dark:hover { background: #0c1a30; } — line 218 */

/* line 242 */
.btn-icon {
  /* ... */
  transition: all 0.15s;
}
/* .btn-icon:active { background: var(--gray-light); } — line 246 */

/* line 627 */
.auth-tab {
  /* ... */
  transition: all 0.15s;
}
/* .auth-tab.active { background: var(--surface); color: var(--primary); box-shadow: var(--shadow); } — line 630 */

/* line 854 */
.quick-action {
  /* ... */
  transition: all 0.15s;
}
/* .quick-action:active { transform: scale(0.97); } — line 858 */

/* line 898 */
.voucher-card {
  /* ... */
  transition: all 0.15s;
}
/* .voucher-card:active { transform: scale(0.99); } — line 903 */

/* line 1008 */
.chip {
  /* ... */
  transition: all 0.15s;
}
/* .chip.active { background: var(--primary-light); color: var(--primary-dark); border-color: var(--primary-light); } — line 1012 */

/* line 1304 */
.listing-card {
  /* ... */
  transition: all 0.15s;
}
/* .listing-card:active { transform: scale(0.99); } — line 1309 */

/* line 1630 */
.toast {
  /* ... */
  transition: all 0.25s;
}
/* .toast.show { opacity: 1; transform: translateX(-50%) translateY(0); } — line 1635 */

/* line 2005 */
.inline-tab {
  /* ... */
  transition: all 0.15s;
}
/* .inline-tab.active { background: var(--surface); color: var(--primary); box-shadow: var(--shadow); } — line 2009 */
```

## Target

Transform-driven press feedback gets the custom `--ease-out` curve (has more
"punch" than the built-in easing); hover/active-class color swaps keep plain
`ease` (per the decision rule: entrance/exit and press feedback get
`ease-out`, hover/color changes get `ease`). Durations are unchanged from
today's values except stated.

```css
/* line 178 */
.btn {
  transition: transform 160ms var(--ease-out), background 150ms ease;
}

/* line 242 */
.btn-icon {
  transition: background 150ms ease;
}

/* line 627 */
.auth-tab {
  transition: background 150ms ease, color 150ms ease, box-shadow 150ms ease;
}

/* line 854 */
.quick-action {
  transition: transform 160ms var(--ease-out);
}

/* line 898 */
.voucher-card {
  transition: transform 160ms var(--ease-out);
}

/* line 1008 */
.chip {
  transition: background 150ms ease, color 150ms ease, border-color 150ms ease;
}

/* line 1304 */
.listing-card {
  transition: transform 160ms var(--ease-out);
}

/* line 1630 */
.toast {
  transition: transform 250ms var(--ease-out), opacity 250ms var(--ease-out);
}

/* line 2005 */
.inline-tab {
  transition: background 150ms ease, color 150ms ease, box-shadow 150ms ease;
}
```

Add the curve token to `:root` in `src/style.css` (lines 4-31) if not already
present (plan 001 also introduces this token — if it has already run, skip):

```css
:root {
  /* ...existing vars... */
  --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
}
```

## Repo conventions to follow

- `.value-mode-btn` (`src/style.css:1138`) already does this correctly —
  `transition: background 0.15s, color 0.15s, box-shadow 0.15s;` — use it as
  the exemplar for the comma-separated multi-property style applied to
  `.auth-tab`, `.chip`, and `.inline-tab` above (note: this plan uses `150ms`
  instead of `0.15s` only for consistency with the new tokenized rules —
  functionally identical; do not "fix" `.value-mode-btn` itself, it's out of
  scope).
- Curve/duration tokens live inline in `src/style.css`'s `:root` block,
  alongside the existing color and shadow variables (see plan 001 for the
  same convention).

## Steps

1. In `src/style.css`, add `--ease-out: cubic-bezier(0.23, 1, 0.32, 1);` to
   the `:root` block if it is not already present (it may have been added by
   plan 001).
2. Replace the `transition: all 0.15s;` declaration on line 178 (`.btn`) with
   `transition: transform 160ms var(--ease-out), background 150ms ease;`.
3. Replace the `transition: all 0.15s;` declaration on line 242 (`.btn-icon`)
   with `transition: background 150ms ease;`.
4. Replace the `transition: all 0.15s;` declaration on line 627 (`.auth-tab`)
   with `transition: background 150ms ease, color 150ms ease, box-shadow 150ms ease;`.
5. Replace the `transition: all 0.15s;` declaration on line 854
   (`.quick-action`) with `transition: transform 160ms var(--ease-out);`.
6. Replace the `transition: all 0.15s;` declaration on line 898
   (`.voucher-card`) with `transition: transform 160ms var(--ease-out);`.
7. Replace the `transition: all 0.15s;` declaration on line 1008 (`.chip`)
   with `transition: background 150ms ease, color 150ms ease, border-color 150ms ease;`.
8. Replace the `transition: all 0.15s;` declaration on line 1304
   (`.listing-card`) with `transition: transform 160ms var(--ease-out);`.
9. Replace the `transition: all 0.25s;` declaration on line 1630 (`.toast`)
   with `transition: transform 250ms var(--ease-out), opacity 250ms var(--ease-out);`.
10. Replace the `transition: all 0.15s;` declaration on line 2005
    (`.inline-tab`) with `transition: background 150ms ease, color 150ms ease, box-shadow 150ms ease;`.

## Boundaries

- Do NOT change any property values other than the `transition` declaration
  itself in each of the 9 rules — no color, spacing, or layout changes.
- Do NOT touch `.value-mode-btn` (line 1138) — it's already correct and is
  cited only as the exemplar.
- Do NOT add press-feedback (`:active { transform: scale(...) }`) to `.chip`
  — that's a separate missed-opportunity item, not part of this plan.
- If any of the 9 line numbers don't match the quoted current code (drift
  since the commit stamp), STOP and report instead of improvising — search
  for the rule by selector name and re-verify the properties it actually
  changes before editing.

## Verification

- **Mechanical**: `npm run dev`, load the app, exercise each element (tap a
  button, tap a voucher/listing card, switch auth tabs, switch filter chips,
  trigger a toast, switch inline tabs, toggle push notification row nearby).
  No console errors.
- **Feel check**:
  - Buttons and cards should still show the same visual press-down and
    hover-color change as before — nothing should look broken or missing,
    just no longer animate unrelated properties.
  - In DevTools Animations panel, trigger a button press and confirm only
    `transform` (and, for hover, `background`) appear as animated
    properties — not `all` or unexpected ones like `padding`/`width`.
  - Toast should still fade+slide in and out symmetrically; confirm timing
    still reads as ~250ms, not noticeably different from before.
  - Auth tabs and inline tabs should still crossfade their active background
    smoothly with no flash.
- **Done when**: none of the 9 rules contain `transition: all` anymore, every
  interaction listed above still animates the same properties visually as
  before, and the Animations panel shows no unintended properties animating.
