# VoucherWise — Status Summary

_Generated 2026-07-29 by reading the actual codebase and querying the live Supabase project. Every claim below is either read directly from source/config or from the live database via the Supabase MCP — nothing here is taken from docs/roadmap claims without checking the code._

---

## 1. Tech stack (actual, verified)

- **Frontend**: Vanilla JavaScript (no framework — no React/Vue/Svelte in `package.json`). Rendering is still template strings + `innerHTML`, and the router (`go(view, params)` / `render()`) is still hand-rolled — none of that changed. What did change, 2026-08-01: the code itself moved. `src/app.js` was one 4,355-line file containing every view, fetch call, action, and the event dispatcher; it's now a 3-line entry point that imports `init()` from `core/router.js`. The rest lives in `src/core/` (shared state, router, global click/submit dispatch, UI/icon helpers — ~1,320 lines across 9 files) and `src/features/{auth,wallet,marketplace,social,notifications,discover,referrals}/` (~3,248 lines, each feature owning its own fetch/action/view files). Plus a 2,142-line `src/style.css`, untouched by the split.
- **Build tool**: Vite 8 (`npm run dev` / `npm run build` / `npm run preview`). Production build succeeds cleanly (`vite build` → `dist/`, ~340KB main JS chunk, 268ms build time as of this writing).
- **PWA, not native**: `public/manifest.json` + `public/sw.js` (service worker for push notifications) make this an installable web app. There is **no React Native / Expo project**, despite the original `docs/ROADMAP.md` planning one — the docs themselves now flag this ("it ended up as a vanilla-JS Vite web app + PWA instead").
- **Backend**: Supabase (Postgres 17.6, project `VoucherWise`, region `eu-west-3`, status `ACTIVE_HEALTHY`, created 2026-06-18 — so the backend is about 6 weeks old). Client talks to it via `@supabase/supabase-js` (`src/lib/supabase.js`), configured for **PKCE auth flow**.
- **Edge Functions** (Deno, in `supabase/functions/`):
  - `extract-voucher` (263 lines) — AI-based OCR/field-extraction from voucher photos.
  - `enrich-brand` (153 lines) — brand metadata enrichment.
  - `send-daily-push` (178 lines) — scheduled push notification sender (pg_cron + pg_net triggered).
- **Barcode scanning**: `@zxing/browser` + `@zxing/library` (client-side barcode detection from photos).
- **QR codes**: `qrcode` npm package (used for the voucher-gift share flow).
- **No dependency on**: React, TypeScript (app code is plain `.js`; only edge functions are `.ts`), any CSS framework, any state-management library, any router library, any ORM (raw `supabase-js` query builder + RPC calls only). ~~any testing framework~~ — as of 2026-08-01, `@playwright/test` is a devDependency; see §5.

---

## 2. What's actually built

Confirmed by reading the router (`VIEWS` map, `src/core/router.js` — moved there 2026-08-01, was `src/app.js:3456`) and the action handlers behind each screen:

**Auth**: welcome, email/password login, registration, email verification gate, forgot/reset password.

**Voucher Wallet** (core pillar): add voucher (manual entry or AI photo scan with multi-photo support), edit, delete, mark used/unused, expiration reminders (date+time), barcode auto-detection from photos, file attachments (photos/PDFs) via Supabase Storage, non-monetary "value description" vouchers, search/filter.

**Marketplace** (resale pillar): list a voucher for sale (public or friends-only visibility), browse/search listings, listing detail, unlist, a "Trusted Community" tab (marketplace filtered to the friend network via an RPC).

**Referral Code Hub** (3rd pillar): add/edit/delete referral codes, categorized (with terms, benefit-for-new-user, benefit-for-referrer fields), copy-code tracking, per-code usage toggle/count.

**Discover**: a curated, admin-populated gift-card brand catalog (separate from user-added `brands`), shipped 2026-07-28 — the newest feature in the repo.

**Social layer**: friend requests (add/accept/decline/remove), voucher gifting between users (send a voucher as a gift, claim flow with a reveal animation, auto-friending on claim), friends-only visibility gating on both marketplace listings and referral codes.

**Notifications**: web push (VAPID keys, service worker), a daily scheduled push job (pg_cron → edge function) for expiring vouchers, in-app notification records, push subscribe/unsubscribe/status UI in Profile.

**Profile**: KPI cards (active voucher count, total value, gifted-voucher accounting — both fixed for double-counting bugs in recent commits).

This is a **materially complete implementation** of everything in `docs/MVP_SCOPE.md`'s "Included" list, plus several items that doc explicitly lists as "Excluded" (AI extraction, OCR, friend system) — the docs have been updated to say as much rather than left stale.

---

## 3. Database state

Live-queried via Supabase MCP against project `ynlsrbtzcarjsqnldqyc`, not just read from the migrations file:

- **48 migrations applied** as of 2026-07-30 (was 45 as of this doc's original 2026-07-29 pass; 3 more landed since, covering a security-advisor follow-up — see §3 advisor notes below). `supabase/migrations.sql` (1,096+ lines) remains a consolidated narrative snapshot, not itself the migration history. As of 2026-07-30 there's also `supabase/schema.sql` (generated directly from live catalog introspection — the more reliable of the two if they disagree) and `supabase/migrations/` (new individual migration files going forward, one naming convention documented in its README; the prior ~47 migrations aren't being backfilled as local files).
- **14 tables in `public`, all with RLS enabled**: `users`, `vouchers`, `marketplace_listings`, `referral_codes`, `referral_code_uses`, `friendships`, `notifications`, `voucher_extraction_log`, `voucher_files`, `voucher_gifts`, `push_subscriptions`, `push_notification_log`, `brands`, `discovery_brands`.
- **This has real usage data, not just an empty schema**: 18 users, 42 vouchers, 6 marketplace listings, 14 referral codes, 12 friendships, 33 voucher file attachments, 103 logged extraction attempts. This reads as active dogfooding/dev-testing, not a blank database.
- **49 RLS policies**, 2 `SECURITY DEFINER` functions (`claim_voucher_gift`, `trusted_network_ids`) used to let one user's action (claiming a gift, checking friend network) touch another user's rows safely, 1 trigger-backed denormalized counter (`sync_referral_used_count`), 1 storage bucket (`voucher-photos`) with its own RLS.
- Storage bucket has been iterated on for size limits and ownership-transfer semantics (gift claim reassigns file ownership) per migration history.

**Live security advisor output (Supabase linter), current as of this check (2026-07-29):**
- 1 **ERROR**: `public.public_profiles` view uses `SECURITY DEFINER`, which runs with the view creator's permissions rather than the querying user's — worth confirming this is intentional and not silently bypassing per-user RLS.
- 5 **WARN**: `pg_net` extension installed in the `public` schema (should be moved to its own schema); `brands` table has an `UPDATE` RLS policy with `USING (true)` / `WITH CHECK (true)` — effectively any authenticated user can update any brand row; the two `SECURITY DEFINER` RPCs are callable by any authenticated user (may be intentional, wasn't re-verified against intent here); leaked-password protection (HaveIBeenPwned check) is disabled in Supabase Auth settings.

> **Update, 2026-07-30:** the `public_profiles` ERROR and both "may be intentional, wasn't re-verified" WARNs above were reviewed in a follow-up session — `public_profiles`'s `SECURITY DEFINER` is confirmed intentional (justified, hardened, documented via `COMMENT ON VIEW`), `brands_update` was deliberately tightened via a new column-guard trigger (the RLS text itself is unchanged, so the advisor will keep flagging it — that's expected), and both RPCs now carry `COMMENT ON FUNCTION` confirming their exact blast radius. Leaked-password protection is still disabled — confirmed blocked at the plan level (Free plan; requires Pro+), not just unconfigured. `pg_net`-in-`public` is still unaddressed. Full detail in `docs/DATABASE_SCHEMA.md`'s 2026-07-30 Cleanup History entry.

**Live performance advisor output**: 69 lints — dominated by 44 `auth_rls_initplan` warnings (RLS policies calling `auth.uid()` per-row instead of `(select auth.uid())`, which doesn't scale) and 14 unused-index warnings. None of this is urgent at current data volume (dozens of rows per table) but will matter before any real user growth.

> **Update, 2026-07-30:** all 44 `auth_rls_initplan` warnings are fixed (rewritten to `(select auth.uid())`, verified logic-equivalent) — advisor now shows 0. The 14 unused-index warnings were reviewed individually and intentionally left as-is: each backs either a foreign key or an RLS-filter column on a table that's just small/new, not evidence of a design mistake. 11 `multiple_permissive_policies` warnings (duplicate-intent policies from organic dashboard+migration growth, e.g. on `friendships`/`notifications`/`referral_codes`) were noted but are still open — not addressed this pass.

---

## 4. Auth status

- Supabase Auth, email + password only. No OAuth/social login.
- **PKCE flow explicitly configured** (`src/lib/supabase.js`) with a code comment explaining why: avoids putting a live access token in email-link URLs.
- Email confirmation is required before first login (`register()` checks `data.session` and routes to a `verify-email` screen if Supabase returns no session — i.e., confirmation-pending).
- Password reset flow exists (`forgot-password` / `reset-password` views).
- Per the 2026-07-25 commit "Authentication security review": RPC access was restricted to authenticated users, PKCE was adopted, and logout was hardened (full page reload on logout rather than partial in-memory state reset, specifically to prevent a stale-session bug where a second account signing in on the same tab could briefly render with the previous user's data — see the comment on `logout()` in `src/features/auth/auth.js`, moved there 2026-08-01, was `src/app.js:726`).
- **Known gap**: leaked-password protection is disabled at the Supabase project level (see advisor output above) — passwords aren't checked against known-breach lists. As of 2026-07-30, confirmed this isn't just an unflipped toggle: the org is on the Free plan, and the feature requires Pro or above, so it can't be enabled until the project is upgraded.

---

## 5. What's broken or incomplete

Grep across `src/*.js` and the edge functions found **zero `TODO`/`FIXME`/`HACK` markers** — this codebase doesn't use that convention, so absence of TODOs is not the same as absence of gaps. Concrete gaps found by reading the code:

- ~~**No automated tests.** No `*.test.*`/`*.spec.*` files anywhere, no test runner in `package.json`, no CI config (no `.github/workflows`, no other CI YAML). Correctness currently depends entirely on manual testing.~~ **Partially resolved 2026-08-01**: a Playwright e2e suite now exists (`tests/e2e/`, 10 tests across 5 files: signup, add-voucher, marketplace listing, gift send/claim, and a smoke test that visits every nav destination checking for console errors) plus a GitHub Actions workflow (`.github/workflows/ci.yml`) that builds and runs the suite on every push/PR. All 10 pass as of this writing. Caveats worth knowing: (1) the suite mocks Supabase at the network layer rather than hitting a real backend, so it validates frontend behavior against the API contract, not RLS policies or the `claim_voucher_gift`/`trusted_network_ids` RPCs' actual SQL; (2) coverage is uneven — auth/wallet/marketplace/gifting have real interaction tests, referrals/friends-requests/discover/reminders/push are only smoke-tested for rendering, not exercised; (3) **none of this is committed** — `tests/`, `playwright.config.js`, and `.github/` are untracked in git as of this writing (see §6). Until they're committed and pushed, the CI workflow isn't actually running on GitHub.
- **No payment processing in the marketplace, by explicit design** — two separate in-app hints say so verbatim: "Buyer contacts you by email. No payment processing in MVP" and "Payment is arranged directly with the seller. No payment processing in this MVP." There's also no escrow, no transfer-of-ownership transaction, no seller ratings — `docs/ROADMAP.md` Phase 6 ("Marketplace Transactions") describes this as future work and it hasn't started.
- ~~**RLS gap on `brands`**: the `brands_update` policy allows any authenticated user to update any brand row (flagged by Supabase's own linter as `rls_policy_always_true`). Given `brands` is user-populated (vs. the curated `discovery_brands` table), this may be intentional, but it's worth an explicit decision rather than leaving it as a linter warning.~~ **Resolved 2026-07-30**: confirmed intentional (shared catalog, no admin role exists), tightened via a column-guard trigger so non-owners can only correct `category`/backfill a blank `description`, not rewrite `name`/`domain`/`logo_url`. The linter will keep showing this warning regardless (it only reads the RLS text, which is unchanged by design) — that's expected, not unresolved.
- ~~**`SECURITY DEFINER` view** (`public_profiles`) and **two `SECURITY DEFINER` RPCs** callable by any authenticated user — each needs a one-time check that the privilege escalation is scoped correctly, since a mistake here bypasses RLS by definition.~~ **Resolved 2026-07-30**: all three reviewed. `public_profiles` is justified and kept (hardened + documented); both RPCs (`claim_voucher_gift`, `trusted_network_ids`) now carry a `COMMENT ON FUNCTION` on the live object confirming exactly what each can touch on another user's behalf and why it can't be used more broadly.
- **64 `console.*` calls left across `src/` (2026-08-01 count; was 63 in `app.js` alone before the split)**, mostly `console.error` in catch blocks — functional as basic error visibility, but there's no error tracking/reporting service wired up, so errors in production are only visible to a user who opens devtools, not to the team.
- ~~**Single 4,355-line file for the entire frontend.** It's internally organized (fetch functions → actions → view templates → router), but this is a scaling risk for a second engineer joining — no module boundaries, so simultaneous edits by two people will collide constantly.~~ **Resolved 2026-08-01**: split into `src/core/` + `src/features/{auth,wallet,marketplace,social,notifications,discover,referrals}/` (see §1). Done incrementally — build + the (then-new) Playwright suite verified after each module moved — rather than as one large untested rewrite. Not yet committed (see §6): a second engineer cloning `main` today would still get the old single-file layout.
- ~~**63 performance lint warnings** on RLS policies (see §3) — not urgent now, will matter once table sizes grow past dev-scale.~~ **Partially resolved 2026-07-30**: the 44 `auth_rls_initplan` warnings are fixed. The 14 unused-index warnings were reviewed and intentionally left (small tables / FK-support / RLS-filter columns, not dead weight). 11 `multiple_permissive_policies` warnings remain open, not addressed this pass.
- **A tracked file was deleted locally and not yet committed**: `.env.example` shows as deleted in `git status` (working tree, unstaged). Minor, but flag it before it's lost — a fresh clone currently has no template for required env vars.

---

## 6. Deployment status

- **Vercel is configured**: `.vercel/project.json` links this directory to a Vercel project (`voucher-hub`, project ID `prj_AUfFYC1Z3t85FQIKf30jvkNGsyiT`). No `vercel.json` in the repo, so it's relying on Vercel's Vite auto-detection rather than custom build config.
- **Production build works**: `npm run build` completes cleanly with no errors (verified by running it during this audit) — output is a static `dist/` bundle (index.html + hashed JS/CSS assets), consistent with a static/SPA deploy on Vercel.
- **No EAS / native mobile build config** — there's no `app.json`/`app.config.js`/`eas.json` for a native app, consistent with §1: this ships as a PWA, not through app stores.
- ~~**No CI/CD pipeline** — no GitHub Actions or equivalent, so there's no automated build/test/deploy gate before merges to `main`. Deploys appear to be manual (or Vercel's git-push auto-deploy, but nothing enforces tests or a build check first since there are no tests to enforce).~~ **Partially resolved, not yet live, 2026-08-01**: `.github/workflows/ci.yml` now runs `npm run build` + the Playwright suite on every push/PR. But **the entire working tree from this pass — the CI workflow, the test suite, and the `src/core`/`src/features` module split — is uncommitted.** `git status` shows `.github/`, `tests/`, `playwright.config.js`, `src/core/`, `src/features/` as untracked, and `src/app.js` as modified-but-unstaged; the last actual commit on `main` is still `ebe17d5` ("Remove Profile from bottom nav, center Wallet"), predating all of it. Vercel's git-push auto-deploy means production is still serving the old single-file `app.js`, and the CI gate isn't active on GitHub until this is committed and pushed. This is the single most important fact in this update: nothing described as "done" above is deployed or even version-controlled yet.
- Environment variables required for the client (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_LOGODEV_TOKEN`, `VITE_VAPID_PUBLIC_KEY`) are present locally in `.env` (gitignored, correctly not tracked in git) but the `.env.example` template that would document these for a new collaborator was just deleted locally (see §5) — worth restoring/recommitting before onboarding anyone else.

---

## 7. Honest gap analysis — why you need a co-founder engineer

**What's genuinely solid:** the core product loop (add → track → remind → sell/gift → discover) is fully implemented against a real, actively-used database, with a real auth security pass already done, real RLS on every table, and a clean production build. This is well past "prototype" — it's a working single-maintainer product with real usage data (18 users, 42 vouchers already in the live DB).

**Where a second engineer changes the trajectory:**

1. ~~**You have zero test coverage and zero CI on a 4,355-line file that's the entire application.** Right now, every change is verified by hand. That's sustainable solo because you hold the whole file's behavior in your head. It stops being sustainable the moment a second person edits it — either you need tests as a shared source of truth, or you need to split the file into modules a second person can own without stepping on you. Both are real engineering work, not incremental features.~~ **Both underway as of 2026-08-01**: a Playwright e2e suite + CI gate exist (§5), and the file's been split into `core/` + per-feature modules (§1) a second engineer could plausibly own a slice of without colliding with you. Two things keep this from being fully closed: it's all still uncommitted (§6), so it isn't yet the shared reality anyone else would clone; and test coverage itself is uneven — referrals, friends, discover, and notifications are only smoke-tested for "does it render," not for correctness. Commit/push this work and extend coverage to those gaps, and this line item is genuinely done rather than in-progress.
2. **The security/perf linter findings (§3) are exactly the kind of thing that's cheap to fix now and expensive after real users show up** — as of 2026-07-30, the `brands` RLS review, the `SECURITY DEFINER` review, and the 44 RLS performance warnings are resolved (see §3/§5 updates); leaked-password protection is still off, now confirmed blocked by the Free plan rather than just unconfigured, and 11 `multiple_permissive_policies` warnings are still open. None were ever fires, but this is exactly the kind of "should have a second set of eyes" queue that a co-founder engineer is for versus a solo founder prioritizing new features — and it's evidence the queue does get cleared when someone has time to sit with it.
3. **The marketplace's core value prop (turn unwanted vouchers into cash) has no payment rail yet** — by design, for now. Building actual money movement (Stripe Connect–style payouts, escrow, dispute handling) is a materially different and harder engineering problem than everything shipped so far (CRUD + auth + RLS), and it's the single biggest gap between what exists and the stated "Main Value Proposition" (turn unwanted vouchers into cash, not just list them).
4. **The AI extraction pipeline (edge functions for OCR/enrichment) is exactly the kind of component that needs ongoing tuning** (prompt/model changes, cost monitoring, failure-rate tracking — there's a `voucher_extraction_log` table with 103 rows already, i.e., data to mine for accuracy) — that's a distinct skill set from frontend/product work and benefits from a second technical owner.
5. **No native app.** If mobile app-store distribution (push reliability, camera/scanning UX, offline) becomes a priority over PWA, that's a parallel platform effort, not a tweak to the existing Vite app.

In short: the single-founder build has proven the product works end-to-end. The remaining gaps — test/CI infrastructure, a security/perf hardening pass, real payments, and ongoing AI-pipeline ownership — are each meaningfully-sized, distinct engineering tracks that are hard to run in parallel solo while still shipping product features. That's the case for a second engineer now rather than later, before the single-file architecture and the untested surface area get more expensive to unwind.
