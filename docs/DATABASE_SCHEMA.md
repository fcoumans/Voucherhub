# Database Schema

## Purpose

This document defines the core database structure for Voucher Hub (VoucherWise).

The database supports:

- User accounts
- Personal voucher storage
- Voucher expiry tracking
- Voucher marketplace listings (public + Trusted Community)
- Referral codes
- Notifications and push reminders
- Friendships / Trusted Community
- Voucher gifting between users
- AI photo/PDF extraction of voucher details
- Voucher photo/file storage

This document is generated from the live schema (Supabase project `ynlsrbtzcarjsqnldqyc`,
last verified 2026-07-30) — not from `supabase/migrations.sql`, which only tracks a
subset of tables and has drifted from what's actually deployed. If the two disagree,
the database is correct and `migrations.sql` should be treated as best-effort history,
not a source of truth. As of 2026-07-30 there's also `supabase/schema.sql`, a
consolidated snapshot generated directly from live catalog introspection — closer to
this document's source of truth than `migrations.sql` is, and the place to check first
if the two ever disagree. New individual migrations going forward live under
`supabase/migrations/` (see the README there for the naming convention); the prior
~47 migrations remain tracked only in the project's remote migration history, not as
local files.

---

# Tables

## users

Stores basic user profile information. Row is auto-created by the `handle_new_user`
trigger on `auth.users` insert (i.e. on signup).

| Field | Type | Notes |
|---|---|---|
| id | UUID | Primary key, FK → `auth.users.id` (cascade delete) |
| email | String | Unique, not null |
| first_name | String | Optional, title-cased (initcap) |
| last_name | String | Optional, title-cased (initcap) |
| avatar_url | String | **Dead column** — 0% populated, zero code references anywhere. |
| last_active_at | Timestamp | Stamped on login/session-resume and periodically on activity |
| created_at | Timestamp | Auto-generated |

Note: accounts created before the first_name/last_name split may only have a
combined `name` in their `auth.users` metadata — the client (`mapUser()` in
`src/app.js`) falls back to splitting that for display.

---

## vouchers

Stores vouchers owned by users.

| Field | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| user_id | UUID | FK → users.id (cascade delete), indexed |
| brand | String | Store or company name, not null — freeform autocomplete text, not constrained to `brands.name` |
| brand_id | UUID | FK → brands.id (set null on delete), indexed — best-effort enrichment resolved via `getBrandByName()` after `ensureBrand()` in `src/app.js`; nullable, not an enforced relationship the UI depends on |
| category | String | e.g. restaurant, fashion, travel |
| amount | Decimal | Original voucher value — nullable, but `amount` or `value_description` must be set. CHECK: `amount IS NULL OR amount >= 0` |
| remaining_amount | Decimal | **Dead column** — 0% populated, zero code references, fully superseded by `balance`. Kept for now (not dropped as part of this cleanup pass). |
| currency | String | EUR, USD, GBP, ... (default `EUR`) |
| voucher_code | String | Voucher code |
| pin | String | Optional PIN |
| expiration_date | Date | Expiry date |
| image_url | String | **Dead column** — 0% populated, zero code references. Fully superseded by `voucher_files`. |
| notes | Text | Terms, restrictions, extra info |
| status | Enum | `active`, `used`, `expired`, `listed`, `sold` |
| voucher_type | Enum | `gift_card`, `store_credit` (default `gift_card`) |
| copy_count | Integer | How many times the code was copied (default 0) |
| balance | Decimal | Current remaining value (used in place of `remaining_amount`). CHECK: `balance IS NULL OR balance >= 0` |
| photo_url | String | **Dead column** — only 1 legacy row has a value (predates `voucher_files`), zero code references today. Do not assume this is "the" photo field — it isn't. |
| barcode_path | String | Storage path of an extracted/uploaded barcode image |
| value_description | Text | Free-text value when there's no fixed amount (e.g. "Weekend getaway for two") |
| gift_message | Text | Optional note attached when gifting a voucher |
| gift_sender | Text | Display name of the gifter, set on claim |
| created_at | Timestamp | Auto-generated |
| updated_at | Timestamp | **Not currently maintained** — no trigger updates it and the app never sets it on update, so it's frozen at insert time forever despite the name. Either wire up an auto-update trigger or drop it; don't rely on it meaning "last updated." |

---

## voucher_files

One row per photo/PDF attached to a voucher (a voucher can have several — front, back, etc.). Replaces the older single `image_url`/`photo_url` fields for new uploads.

| Field | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| voucher_id | UUID | FK → vouchers.id (cascade delete), indexed |
| user_id | UUID | FK → auth.users.id (cascade delete) — owner, for RLS. Indexed |
| file_path | String | Path within the `voucher-photos` storage bucket |
| file_type | Enum | `image`, `pdf` (default `image`) |
| position | Integer | Display order (default 0) |
| created_at | Timestamp | Auto-generated |

---

## marketplace_listings

Stores vouchers listed for sale.

| Field | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| voucher_id | UUID | FK → vouchers.id (cascade delete), indexed |
| seller_id | UUID | FK → users.id (cascade delete), indexed |
| original_value | Decimal | Voucher value. CHECK: `>= 0` |
| selling_price | Decimal | Price seller wants. CHECK: `>= 0` |
| discount_percentage | Decimal | A real `GENERATED ALWAYS AS (...) STORED` column (not a plain default) — always in sync with `original_value`/`selling_price`, can't drift. The client currently ignores it and recomputes the same number in JS (`discountPct()`) instead of reading it — redundant but harmless. |
| currency | String | EUR, USD, GBP (default `EUR`) |
| status | Enum | `available`, `reserved`, `sold`, `cancelled` |
| visibility | Enum | `public`, `friends_only` — `friends_only` is the Trusted Community tier: visible only within the seller's network (direct friends + friends of friends, see `trusted_network_ids()` below), never in public Browse |
| created_at | Timestamp | Auto-generated |
| updated_at | Timestamp | **Not currently maintained** — same issue as `vouchers.updated_at`, see there. |

---

## referral_codes

Stores referral codes added by users or the platform.

| Field | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| user_id | UUID | Owner of the code, FK → users.id (nullable — platform-owned codes have no owner) |
| brand | String | Brand or app name, not null |
| brand_id | UUID | FK → brands.id, backfilled by matching `brand` name |
| code | String | Referral code |
| referral_link | String | Optional link |
| benefit_for_new_user | Text | Example: €10 discount |
| benefit_for_referrer | Text | Example: €10 credit |
| visibility | Enum | `public`, `friends`, `private` |
| category | String | e.g. Travel, Food, Shopping |
| terms | Text | Terms & conditions |
| expiration_date | Date | Optional |
| used_count | Integer | Denormalized count, kept in sync from `referral_code_uses` via trigger |
| created_at | Timestamp | Auto-generated |

---

## referral_code_uses

One row per (referral code, user) mark of "I used this" — never the code's own owner (enforced by RLS). Drives `referral_codes.used_count` via the `sync_referral_used_count` trigger.

| Field | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| referral_id | UUID | FK → referral_codes.id (cascade delete) |
| user_id | UUID | FK → auth.users.id (cascade delete) — the user who marked it used |
| created_at | Timestamp | Auto-generated |

Unique on `(referral_id, user_id)` — one mark per user per code.

---

## friendships

Stores friend relationships between users. Undirected in practice — either
side can be `requester_id` or `receiver_id`.

| Field | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| requester_id | UUID | FK → users.id (cascade delete) |
| receiver_id | UUID | FK → users.id (cascade delete) |
| status | Enum | `pending`, `accepted`, `declined`, `blocked` |
| created_at | Timestamp | Auto-generated |
| updated_at | Timestamp | Auto-generated |

Unique on `(requester_id, receiver_id)`. Check constraint prevents `requester_id = receiver_id`.

---

## voucher_gifts

Tracks a voucher sent from one user to another via a claimable link.

| Field | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| voucher_id | UUID | FK → vouchers.id (cascade delete) |
| sender_id | UUID | FK → auth.users.id (cascade delete) |
| status | Enum | `pending`, `claimed`, `cancelled` (default `pending`) |
| claimed_by | UUID | FK → auth.users.id, set on claim |
| claimed_at | Timestamp | Set on claim |
| expires_at | Timestamp | Default `now() + 30 days` |
| created_at | Timestamp | Auto-generated |

Claiming happens through the `claim_voucher_gift(p_gift_id)` RPC (see Functions below), not a direct table write — it needs to reassign voucher ownership and create a friendship atomically.

---

## notifications

Stores reminder notifications for voucher expiry.

| Field | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| user_id | UUID | FK → users.id (cascade delete), indexed |
| voucher_id | UUID | FK → vouchers.id (cascade delete), indexed |
| notification_type | Enum | `expiry_reminder`, `reminder` (default `expiry_reminder`) |
| reminder_date | Date | When reminder should be sent, not null |
| reminder_time | Time | Time of day for the reminder |
| sent | Boolean | **Server-owned.** Set only by the `send-daily-push` edge function when a push was actually delivered. Default false. |
| sent_at | Timestamp | **Server-owned.** Set only alongside `sent`. |
| dismissed_at | Timestamp | **Client-owned.** Set only by `dismissReminder()` when the user taps "remove reminder" on a banner. `sent`/`sent_at` and `dismissed_at` used to be conflated — both were written by `sent`/`sent_at`, so a user dismissal could get recorded as if a push had actually been delivered, and there was no way to tell the two apart after the fact. `send-daily-push` now checks `sent = false AND dismissed_at IS NULL` before pushing. |
| created_at | Timestamp | Auto-generated |

---

## push_subscriptions

Web Push subscription per device/browser, used by the `send-daily-push` edge function.

| Field | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| user_id | UUID | FK → auth.users.id, indexed |
| endpoint | String | Unique — the browser's push endpoint URL |
| p256dh | String | Push encryption key |
| auth | String | Push encryption auth secret |
| created_at | Timestamp | Auto-generated |

---

## push_notification_log

Records which expiry push notifications have already been sent, so the `send-daily-push` cron job doesn't resend the same reminder.

| Field | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| user_id | UUID | FK → auth.users.id |
| voucher_id | UUID | FK → vouchers.id (cascade delete) — previously had no foreign key at all; added as part of the architecture cleanup |
| days_before | Integer | Which reminder threshold this was (e.g. 7, 1) |
| sent_at | Timestamp | Auto-generated |

Unique on `(user_id, voucher_id, days_before)`.

---

## voucher_extraction_log

Logs every AI photo/PDF extraction attempt (the `extract-voucher` edge function), success or failure — used for monitoring extraction quality.

| Field | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| user_id | UUID | FK → auth.users.id (cascade delete) |
| file_type | Enum | `image`, `pdf` |
| success | Boolean | Not null |
| error_code | String | Set when `success = false` |
| created_at | Timestamp | Auto-generated |

---

## brands

Source of truth for brand logos, categories, and autocomplete suggestions across vouchers, referral codes, and the marketplace.

| Field | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| name | String | Unique, not null |
| category | String | e.g. Fashion, Travel, Food & Drink |
| domain | String | Used to fetch a logo and to generate an AI description |
| logo_url | String | Optional |
| description | String | Short AI-generated (`enrich-brand` edge function) blurb |
| created_by | UUID | FK → users.id, set null on delete |
| created_at | Timestamp | Auto-generated |

`brands` is a shared/global catalog, not per-user owned — the `brands_update` RLS
policy is `USING (true) WITH CHECK (true)` (any authenticated user can attempt an
update on any row), because `ensureBrand()` in `src/app.js` and the `enrich-brand`
edge function both legitimately correct/backfill brands they didn't create (category
correction; a one-time description backfill). Since RLS is row-level only, it can't
restrict *which columns* change — a `brands_guard_update` trigger (see Functions
below) enforces that boundary instead: only `category` (any time) and `description`
(once, from `NULL`) may actually change on a row the caller doesn't own; `name`,
`domain`, `logo_url`, `created_by`, and `created_at` are immutable to non-owners.

---

## public_profiles (view)

A `SECURITY DEFINER` view over `users` (joined with `marketplace_listings` for a sold-count).
It's the app's cross-user directory — the only way one user's client ever sees another
user's name/email: marketplace seller contact info, the friends list, pending friend
requests, and add-friend-by-email lookup all query this view, never `public.users`
directly.

| Field | Type | Notes |
|---|---|---|
| id | UUID | `users.id` |
| email | String | `users.email` |
| first_name | String | `users.first_name` |
| last_name | String | `users.last_name` |
| vouchers_sold | Integer | `count(marketplace_listings.id) FILTER (WHERE status = 'sold')` for that seller |

`users` RLS is self-only (`auth.uid() = id`), so a plain (`security_invoker`) view would
return zero rows for anyone but the caller — breaking every feature listed above. The
`SECURITY DEFINER` property is deliberate, not an oversight, and is scoped by: no
columns beyond the five above, and `SELECT` granted to `authenticated` only, never
`anon`/`PUBLIC`. Both the reasoning and the grant boundary are recorded in a
`COMMENT ON VIEW` on the live object, not just here.

---

## discovery_brands

Curated catalog powering the Discover pillar — brands whose gift cards users can buy
firsthand, browsable by category and region. Unlike `brands` (freeform, user-generated,
autocomplete-only), this table is admin-curated: only a SELECT policy exists, scoped to
`is_active = true`. Content is seeded/managed via migrations or direct SQL, not app code.

| Field | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| name | String | Unique, not null |
| category | String | Same taxonomy as `CATEGORIES` in `src/app.js` (e.g. Food & Drink, Sustainability) |
| regions | Text array | City-level tags, e.g. `{Ghent, Leuven, Bruges}` — a brand can span multiple cities |
| location | String | Display string, e.g. "Ghent, Leuven & Bruges, Belgium" |
| description | Text | Longer curated blurb (3-5 sentences), not null — deliberately longer than the AI-generated one-liners on `brands` |
| domain | String | Used to fetch a logo via logo.dev, same pattern as `brands.domain` |
| logo_url | String | Optional explicit override |
| website_url | String | Not null — deep-links straight to the brand's gift-card purchase page (not their homepage) where possible; the "Visit" button on the detail page links here (opens in a new tab) |
| fun_fact | Text | Optional short callout shown on the detail page (e.g. "gift card value never expires") — most brands won't have one |
| sort_order | Integer | Manual curation order, default 0 |
| is_active | Boolean | Default true — inactive rows are excluded by RLS, not just hidden client-side |
| created_at | Timestamp | Auto-generated |

Indexed on `regions` (GIN, for the region filter) and `(is_active, sort_order)`.

---

# Functions & Automation

| Function | Type | Purpose |
|---|---|---|
| `handle_new_user()` | Trigger (`on_auth_user_created` on `auth.users`) | Creates the matching `public.users` row on signup, title-casing first/last name from signup metadata |
| `sync_referral_used_count()` | Trigger (`referral_code_uses_sync` on `referral_code_uses`) | Keeps `referral_codes.used_count` in sync on insert/delete |
| `trusted_network_ids(p_user uuid)` | RPC, `SECURITY DEFINER`, `EXECUTE` granted to `authenticated` only | Returns a user's 1st- and 2nd-degree friend network (friends + friends of friends). Bypasses `friendships` RLS internally (which only lets a user read rows they're a party to — that blocks a plain 2-hop join) and is guarded to only ever compute the caller's own network. Used both by `marketplace_listings`' RLS policy and directly by the client for the Trusted Community tab |
| `claim_voucher_gift(p_gift_id uuid)` | RPC, `SECURITY DEFINER`, `EXECUTE` granted to `authenticated` only | Atomically transfers a gifted voucher (and its files) to the claiming user, marks the gift claimed, and auto-creates a friendship between sender and claimer if none exists. Every row it writes is derived server-side from the single `voucher_gifts` row matched by `p_gift_id`, never taken directly from other caller input — scope confirmed via `COMMENT ON FUNCTION` on the live object |
| `brands_guard_update()` | Trigger (`brands_guard_update_trg`, `BEFORE UPDATE` on `brands`) | Column-level guard the `brands_update` RLS policy can't express on its own (RLS is row-level only) — restricts a non-owner update to `category` and a one-time `description` backfill; see `brands` above |
| `rls_auto_enable()` | Event trigger (`ensure_rls`, project-level) | Supabase-platform safety net that auto-enables RLS on any newly created `public` table. Not app-specific — don't remove it thinking it's dead |

The two `SECURITY DEFINER` RPCs (`claim_voucher_gift`, `trusted_network_ids`) had `EXECUTE` granted to `PUBLIC` (Postgres's default on function creation, which includes the unauthenticated `anon` role) until an auth security review revoked it — see Cleanup History below. Both now grant `EXECUTE` to `authenticated` only; the trigger/event-trigger functions grant it to nobody (Postgres refuses direct calls to trigger/event-trigger functions regardless of grants, so they only ever run via their triggers). `trusted_network_ids` also gained a `COMMENT ON FUNCTION` confirming it as read-only.

## Scheduled jobs (pg_cron)

| Job | Schedule | Purpose |
|---|---|---|
| `send-daily-push` | Every 5 minutes | Calls the `send-daily-push` edge function via `pg_net`, which sends Web Push expiry reminders and logs them to `push_notification_log` |

---

# Storage

| Bucket | Public | Purpose |
|---|---|---|
| `voucher-photos` | No | Voucher photos/PDFs (`voucher_files.file_path`) and extracted barcode images (`vouchers.barcode_path`). Access is scoped per-user via storage RLS policies, keyed off the uploader's folder or ownership of the referencing `voucher_files`/`vouchers` row |

---

# Edge Functions

| Function | Purpose |
|---|---|
| `extract-voucher` | AI extraction of brand/amount/code/expiry from an uploaded voucher photo or PDF; logs every attempt to `voucher_extraction_log` |
| `enrich-brand` | AI-generated short brand description, using the brand's domain (if any) and its assigned category as context |
| `send-daily-push` | Sends Web Push expiry reminders to subscribed devices; invoked every 5 minutes by the `send-daily-push` pg_cron job |

---

# Important Rules

## Voucher Ownership

Every voucher belongs to one user.

A voucher can only be listed for sale by its owner.

---

## Marketplace Logic

When a voucher is listed for sale:

- voucher.status becomes `listed`
- marketplace_listings.status becomes `available`
- The seller chooses marketplace_listings.visibility: `public` (Browse tab, open to everyone) or `friends_only` (Trusted Community tab only — friends and friends of friends)

When sold:

- voucher.status becomes `sold`
- marketplace_listings.status becomes `sold`

When a listing is removed without selling (unlist):

- voucher.status returns to `active`
- marketplace_listings.status becomes `cancelled`

---

## Trusted Community

The marketplace has three tabs: Browse (public listings, open to everyone), Trusted Community (listings from the current user's network — direct friends and friends of friends — regardless of visibility), and My Listings.

- `public.trusted_network_ids(p_user)` returns a user's 1st- and 2nd-degree friend network (see Functions above).
- `marketplace_listings`' select RLS policy uses this function to enforce that `visibility = 'friends_only'` rows are only readable by sellers, and by users in the seller's trusted network — this is a real access control, not just client-side tab filtering.
- A `public` listing from someone in your network still appears in Trusted Community (in addition to Browse) — visibility there is a superset, not a separate pool.

---

## Expiry Logic

If expiration_date is in the past:

- voucher.status should become `expired`

The app should not allow expired vouchers to be listed for sale.

---

## Referral Code Logic

Referral codes can be:

- Platform-owned (no `user_id`) or user-owned
- Public, friends only, or private (`visibility`)
- Marked "used" by any non-owner once (`referral_code_uses`), which increments `used_count`

---

# Architecture Cleanup History

**2026-07-27, RLS/migrations.sql accuracy pass:** consolidated duplicate RLS policies
(`friendships`, `referral_codes`, `notifications`, `vouchers`, `marketplace_listings`
all carried dashboard-created policies under different names with identical/overlapping
logic — never actually incorrect access since Postgres ORs permissive policies together,
but confusing to audit). Brought `supabase/migrations.sql` up to full parity with the
live schema (all 13 tables now have tracked `CREATE TABLE` statements, including
`brands`, `vouchers`, `push_subscriptions`, `push_notification_log`, `voucher_files`,
which previously only existed live via the dashboard).

**2026-07-27, database architecture review:** cross-referenced every column against
actual app-code usage (not just column names) and live data patterns. Changes made:

- Added indexes on every FK column that RLS policies filter by (`vouchers.user_id`,
  `marketplace_listings.voucher_id`/`seller_id`, `referral_codes.user_id`/`brand_id`,
  `notifications.user_id`/`voucher_id`, `voucher_gifts.*`, `voucher_files.user_id`,
  `friendships.receiver_id`, and more) — previously almost none were indexed, meaning
  every RLS-scoped query did a sequential scan.
- Added the missing `push_notification_log.voucher_id` foreign key (had none at all).
- Added non-negative CHECK constraints on `vouchers.amount`/`balance` and
  `marketplace_listings.selling_price`/`original_value`.
- Fixed a real model bug: `notifications.sent`/`sent_at` was written by two unrelated
  events (the push cron job delivering a notification, and the user dismissing a
  reminder banner client-side), making it impossible to tell "delivered" apart from
  "cancelled by user" after the fact. Split into separate `sent`/`sent_at`
  (server-owned) and `dismissed_at` (client-owned) columns — see the `notifications`
  table above.
- Added `vouchers.brand_id` (FK → `brands.id`, nullable, `ON DELETE SET NULL`),
  normalizing brand the same way `referral_codes.brand_id` already did. `vouchers.brand`
  stays freeform autocomplete text; `brand_id` is resolved automatically via
  `getBrandByName()` in `src/app.js` after every save. Backfilled 41/42 existing rows.

**Confirmed dead columns, not yet dropped** (verified against both code and live data —
zero references, and either zero or near-zero populated rows — but left in place
pending a deliberate decision to drop them): `vouchers.remaining_amount`,
`vouchers.image_url`, `vouchers.photo_url`, `users.avatar_url`.

**2026-07-27, authentication security review:**

- **Fixed:** all 5 `SECURITY DEFINER` functions had `EXECUTE` granted to `PUBLIC`
  (Postgres's default on function creation), including the fully unauthenticated `anon`
  role — meaning any of them could be invoked directly via `/rest/v1/rpc/...` using only
  the public anon key, without ever logging in. `claim_voucher_gift` was the concerning
  one: it has real side effects (row locks, reassigns voucher ownership), and only
  avoided actual data corruption under an anon call because `vouchers.user_id` happens
  to be `NOT NULL` (making the UPDATE fail rather than succeed) — accidental protection,
  not real security. Revoked `PUBLIC` execute on all 5, re-granted to `authenticated`
  only where legitimately needed (`claim_voucher_gift`, `trusted_network_ids`); the 3
  trigger/event-trigger functions get no direct-call grant at all.
- **Fixed (app code, `src/app.js`):** client-side minimum password length raised from 6
  to 8 characters (signup and reset-password forms); `logout()` now does a full
  `window.location.reload()` instead of resetting individual `state` fields (the partial
  reset had already drifted out of sync with the app once, and a stale reset risks a
  second account briefly rendering with the previous user's leftover data on a shared
  device); removed PII (searched email + returned profile) from `console.log`/`error` in
  `fetchUserByEmail()`.
- **Fixed (`src/lib/supabase.js`):** switched `flowType` from the default `implicit` to
  `pkce` — email links (signup confirmation, password reset) now carry a short-lived
  exchange code instead of the access token itself, so the token never sits in the URL.
  Verified via the installed supabase-js source that `_initialize()` auto-detects a
  `?code=` param and exchanges it before `getSession()` resolves — no other code changes
  needed, and the existing `PASSWORD_RECOVERY` event listener remains as a fallback.
- **Confirmed already safe, no change needed:** no server-side secret (service-role key,
  Anthropic key, VAPID private key) is ever exposed to the client or echoed in any edge
  function response body; no password/token value is ever written to `state`,
  `localStorage`, or `console`; no OAuth/social sign-in is implemented; the
  `resetPasswordForEmail`/`emailRedirectTo` URLs are built from `window.location.origin`
  (not user-controllable), so there's no open-redirect vector in app code.
- **Not fixed here — requires the Supabase Dashboard, no MCP tool access to Auth config:**
  leaked-password-protection is confirmed disabled (flagged by the security advisor) —
  as of 2026-07-30, also confirmed **blocked at the plan level**: the org is on the Free
  plan, and leaked-password protection requires Pro or above, so the toggle isn't even
  available yet regardless of dashboard access; server-side minimum password length and
  complexity rules should be raised to match or exceed the client-side minimum (client
  checks alone don't stop a direct API call); Auth rate limits should be reviewed;
  CAPTCHA (hCaptcha/Turnstile) on signup/login would meaningfully harden brute-force/bot
  resistance but requires a third-party account and real implementation, not a toggle;
  confirm the Auth "Redirect URLs" allow-list only includes intended domains.
- **Flagged, not changed (product judgment call):** signup reveals "this email is
  already registered" for a duplicate email — real UX value, but a textbook
  user-enumeration signal. Left as-is pending a product decision.

**2026-07-30, security advisor follow-up:**

- **`brands_update` RLS tightened.** Decision: column-scoped, not owner-only or
  admin-only — `ensureBrand()` and `enrich-brand` both need to correct/backfill brands
  they don't own, and no admin role exists in the app, so both of the stricter options
  would have broken live functionality. The RLS policy itself is unchanged
  (`USING (true) WITH CHECK (true)`); a new `brands_guard_update` trigger enforces the
  real boundary (see `brands` and Functions above).
- **`public_profiles`'s `SECURITY DEFINER` reviewed and kept, not converted** — `users`
  RLS is self-only, so a plain view would break every cross-user lookup that depends on
  it. Hardened with an explicit `security_invoker = false`, explicit
  `REVOKE ALL ... FROM anon/PUBLIC`, and a `COMMENT ON VIEW` recording the justification
  (see `public_profiles` above).
- **`claim_voucher_gift` and `trusted_network_ids` scope confirmed and documented** —
  each now carries a `COMMENT ON FUNCTION` on the live object spelling out exactly what
  it's allowed to touch on another user's behalf and why it can't be used for anything
  broader (see Functions above).
- **Performance advisor's 44 `auth_rls_initplan` warnings fixed** — every flagged
  policy rewritten from `auth.uid()` to `(select auth.uid())` via `ALTER POLICY` (text
  changed only, not policy identity/roles), verified to preserve logic exactly
  (textual diff against the originals, plus empirical spot-checks comparing RLS-filtered
  results against manually-written reference queries). Advisor confirms 0 remaining.
- **Performance advisor's 14 unused-index warnings reviewed, none dropped** — every one
  either backs a foreign key (cascade/set-null performance) or is the exact column an
  RLS policy filters on, on tables with only single-digit-to-dozens of rows; "unused" at
  this size reflects the planner always preferring a seq scan over an index scan on a
  tiny table, not a design mistake. Worth re-checking once real usage volume builds up.
- **Leaked-password protection: still not enabled** — no Supabase MCP tool exposes Auth
  config, and it's blocked at the plan level regardless (see above).
