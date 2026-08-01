# Animation improvement plans

Generated from a motion audit of VoucherWise at commit `958d863`, using
Emil Kowalski's design-engineering standards (see the `emil-design-eng` /
`improve-animations` skills). Nothing here has been applied to the codebase —
each plan is self-contained and ready for an executor agent to run.

Two findings from the audit were **not** turned into plans (deferred by the
person who requested this audit): ungated `:hover` rules on 4 selectors, and
adding a sliding-pill indicator to the segmented controls (`.auth-tab`,
`.value-mode-btn`, `.inline-tab`). Ask for those if you want them planned
later.

| # | Title | Severity | Status |
| --- | --- | --- | --- |
| [001](001-confirm-dialog-entrance-exit.md) | Animate the confirm dialog in and out as a bottom sheet | HIGH | DONE |
| [002](002-scope-transition-all.md) | Replace `transition: all` with scoped properties across 9 rules | HIGH | DONE |
| [003](003-gift-reveal-reduced-motion.md) | Respect `prefers-reduced-motion` in the gift-reveal celebration | MEDIUM | DONE |
| [004](004-push-toggle-transform.md) | Animate the push-notification toggle thumb with `transform`, not `left` | MEDIUM | DONE |

## Recommended execution order

1. **002** first — it's the broadest, lowest-risk change (pure property
   scoping, no new visual behavior) and introduces the `--ease-out` token
   that 001 also relies on.
2. **001** next — introduces `--ease-drawer` and the biggest visible win
   (the confirm dialog currently has zero entrance/exit motion at all).
3. **003** and **004** are independent of each other and of 001/002 — can run
   in any order, in parallel, or be skipped/reordered freely.

## Dependencies

- Plans 001, 002, and 004 each add CSS custom properties to the same `:root`
  block in `src/style.css` (`--ease-drawer`, `--ease-out`, `--ease-in-out`
  respectively). Each plan's steps say "add if not already present" — so
  running them in any order, including in parallel by different executors,
  is safe as long as each executor re-reads `:root` immediately before
  editing it (to avoid a lost-update race if run truly concurrently in the
  same working tree).
- Plan 003 touches only `src/style.css` and only adds a new block after the
  existing reduced-motion rule — no overlap with 001/002/004's edited lines.
- No plan depends on another's JS changes; only plan 001 touches JS
  (`src/core/confirm-dialog.js`).

## Not planned (from the audit, lower leverage)

- Ungated `:hover` on `.btn-primary`, `.btn-dark`, `.gift-note-prompt`,
  `.pw-toggle` (`src/style.css:190,218,1187,2073`) — add
  `@media (hover: hover) and (pointer: fine)` gating.
- Segmented controls (`.auth-tab`, `.value-mode-btn`, `.inline-tab`) have no
  sliding indicator between active/inactive positions — currently a flat
  background swap.
- Architectural note: `render()` (`src/core/router.js:137`) replaces
  `#app.innerHTML` wholesale on every navigation, so any future work
  animating view entrances (e.g. staggering `.voucher-list` cards) needs
  `@starting-style` or a mount-then-toggle-class pattern (already used
  correctly in `src/features/social/gifting.js:164-166`) — a bare CSS
  `transition` will not fire on freshly-inserted view content.
