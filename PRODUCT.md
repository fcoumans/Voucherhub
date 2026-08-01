# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Anyone who receives vouchers, gift cards, or store credit and wants to track, use, or resell them before they expire — a broad consumer audience, not a narrow persona. The recurring job: don't let voucher value die from being forgotten, lost, or simply unwanted (wrong brand, wrong store). Secondary job: find and share referral codes with friends without it feeling self-serving.

## Product Purpose

VoucherWise is a personal wallet for vouchers, gift cards, store credit, and referral codes. It exists to stop value leaking away through forgotten or expired vouchers, and to give users a way out when a voucher was never going to be used — resell it instead of letting it expire. Success is measured by voucher value saved from expiration, plus value exchanged through the marketplace.

Implemented pillars, confirmed from the codebase (`src/features/`): voucher wallet (manual or AI photo-scan add, barcode/OCR detection, expiration reminders, file attachments, non-monetary "value description" vouchers), marketplace (resale, public or friends-only listings), referral code hub, a curated Discover catalog of gift-card brands, and a social layer (friends, voucher gifting with a claim/reveal flow) plus web push notifications for expiring vouchers.

## Positioning

The trusted place to manage voucher value — a financial utility with warmth. Trustworthy like a fintech product, but warmer and friendlier than one; not another promotional discount site.

Comparable products: Revolut, Monzo, Notion, TicketSwap, Cleo / Copilot Money (for the warmth and polish, not the blue austerity).

Not comparable: Groupon, RetailMeNot, CouponBirds, generic discount websites.

## Operating Context

Installable PWA (web push via service worker, no native app). Core workflows: add a voucher (manual entry or AI photo scan with barcode auto-detection), track it toward its expiration date with reminders, mark it used or list it for resale, browse the marketplace or the curated Discover catalog, manage a referral code hub, add friends and gift vouchers to them (claim flow with a reveal moment), receive push notifications as vouchers approach expiration.

## Capabilities and Constraints

- No payment processing, escrow, or ratings in the marketplace — explicit MVP decision (buyer and seller arrange payment directly; two in-app hints say so verbatim). No fraud detection either.
- Auth is email/password only via Supabase, PKCE flow. No OAuth/social login.
- Backend is Supabase Postgres with RLS enabled on all tables; two `SECURITY DEFINER` RPCs (`claim_voucher_gift`, `trusted_network_ids`) exist to let a claim/friend-check action safely cross user boundaries — both reviewed and scoped intentionally.
- Leaked-password protection is unavailable (Supabase Free plan; the feature requires Pro+) — known, accepted gap, not a build task.
- No error-tracking/observability service wired up; errors are only visible via browser devtools console.
- The product stores real financial-adjacent data (voucher codes, PINs, resale listings) but no formal compliance/regulatory constraint beyond "no in-app payment processing" has been established — treat further compliance requirements as undecided, not assumed.
- Real usage data exists in the live Supabase project (dozens of users/vouchers/listings as of writing) — this is dev/dogfooding data, not public evidence; see Evidence on Hand.

## Brand Commitments

Name: **VoucherWise** (confirmed canonical, 2026-08-01). Note: most files under `docs/` (PROJECT_CONTEXT.md, PRD.md, BRAND_GUIDELINES.md's title, USER_FLOWS.md, ROADMAP.md, DATABASE_SCHEMA.md) still say "Voucher Hub" — that rename hasn't been reconciled in the docs yet; the shipped app (HTML title, PWA manifest, package.json) already says VoucherWise.

The following is drawn from `docs/BRAND_GUIDELINES.md`'s current uncommitted state, confirmed as the live brand direction (not the stale committed version):

- Brand attributes: Trustworthy, Organized, Professional, Efficient, Transparent.
- Personality: Reliable, financially responsible, organized, helpful, calm with warmth, professional. Explicitly not: loud, trendy for trend's sake, gamified, sales-driven.
- Primary color: Emerald Sea `#13B5A2` (light `#CFF1E8`, dark `#0E9488`) — psychology: freshness, value, growth. Used for navigation active state, primary buttons, links, brand identity.
- Secondary color: Slate Mist `#9AA6B2` — muted icons and supporting UI, neutral emphasis.
- Surface system: a single "liquid-glass" sheen on cards is the one sanctioned decorative treatment — deliberately the one exception to "every element must have a purpose," not license for further novelty.
- Motion: purposeful only, house rule is "why does this animate?" (references the emil-design-eng motion philosophy). Celebratory motion (e.g. gift-reveal confetti) is allowed but must stay rare — first-time/occasional moments only, never on frequently-seen UI.

## Evidence on Hand

No testimonials, press, or case studies exist. The live Supabase project has real dev/dogfooding data (users, vouchers, marketplace listings, referral codes as of the 2026-07-30 status check) — this is internal usage data, not public-facing proof. Future work must not fabricate testimonials, customer logos, or press mentions.

## Product Principles

1. Prevent value loss — every wallet and reminder decision should reduce the number of vouchers that die forgotten or expired.
2. Trustworthy custody over novelty — this product holds real financial value (codes, PINs, resale money); credibility and predictability outrank trend-driven flourishes.
3. Give unwanted vouchers a way out — resale should stay low-friction, even though it's currently peer-arranged with no payments, escrow, or ratings.
4. Warmth is restrained, not decorative — one consistent liquid-glass material choice and rare celebratory motion, not broad ornamentation.
5. Value should always be legible — voucher value, expiration, and marketplace pricing must always be clear at a glance.

## Accessibility & Inclusion

No product-specific accessibility standard has been established. Flagging one existing signal for future work: `index.html` sets `user-scalable=no` on the viewport meta tag, which disables pinch-to-zoom — a known accessibility anti-pattern, not yet reviewed as a deliberate decision.
