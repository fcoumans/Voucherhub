-- ============================================================
-- Voucher Hub — Supabase migration (idempotent, run in SQL Editor)
--
-- This file is the annotated narrative history of this project's early
-- schema changes (the "why", not just the "what"). For a new engineer who
-- wants the current end state without reading this whole history, see
-- ../schema.sql. New individual migrations going forward live in
-- ./migrations/ following the convention described in ./migrations/README.md.
-- ============================================================

-- ============================================================
-- public.brands  (source of truth for logos / autocomplete)
-- ============================================================
-- Originally created via the dashboard, not this script — the CREATE
-- TABLE below only matters if bootstrapping a fresh project; on the live
-- project it's a no-op and the ALTERs that follow are what actually apply.
CREATE TABLE IF NOT EXISTS public.brands (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.brands ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);
ALTER TABLE public.brands ADD COLUMN IF NOT EXISTS category   TEXT;
ALTER TABLE public.brands ADD COLUMN IF NOT EXISTS domain     TEXT;
ALTER TABLE public.brands ADD COLUMN IF NOT EXISTS logo_url   TEXT;
ALTER TABLE public.brands ADD COLUMN IF NOT EXISTS description TEXT;

ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;

-- The live project actually had two dashboard-created policies under
-- different names ("Users can create brands", "Users can view all
-- brands") plus a stray "brands_read", and NO update policy at all — this
-- script's own brands_select/insert/update names never matched any of
-- them, so re-running it kept silently no-op'ing the DROPs and adding
-- nothing new. Every brand UPDATE (e.g. enrich-brand's description
-- backfill) matched zero rows under RLS with no error, ever, until this
-- was caught. Drop all the historical names so this converges to one set.
DROP POLICY IF EXISTS "Users can create brands" ON public.brands;
DROP POLICY IF EXISTS "Users can view all brands" ON public.brands;
DROP POLICY IF EXISTS "brands_read" ON public.brands;
DROP POLICY IF EXISTS "brands_select" ON public.brands;
DROP POLICY IF EXISTS "brands_insert" ON public.brands;
DROP POLICY IF EXISTS "brands_update" ON public.brands;

CREATE POLICY "brands_select" ON public.brands
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "brands_insert" ON public.brands
  FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());

CREATE POLICY "brands_update" ON public.brands
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- RLS is row-level only -- it can't restrict which COLUMNS change, and
-- ensureBrand()/enrich-brand both legitimately need to update brands they
-- don't own (category correction; one-time description backfill). A
-- BEFORE UPDATE trigger enforces the column-level boundary that RLS
-- can't: only `category` (any time) and `description` (once, from NULL)
-- may differ from the existing row for a non-owner update.
CREATE OR REPLACE FUNCTION public.brands_guard_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.name IS DISTINCT FROM OLD.name
     OR NEW.domain IS DISTINCT FROM OLD.domain
     OR NEW.logo_url IS DISTINCT FROM OLD.logo_url
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'brands: only category and description (once) may be updated'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.description IS DISTINCT FROM OLD.description AND OLD.description IS NOT NULL THEN
    RAISE EXCEPTION 'brands: description can only be set once, not overwritten'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS brands_guard_update_trg ON public.brands;
CREATE TRIGGER brands_guard_update_trg
BEFORE UPDATE ON public.brands
FOR EACH ROW EXECUTE FUNCTION public.brands_guard_update();

COMMENT ON TRIGGER brands_guard_update_trg ON public.brands IS
  'Column-level guard for brands_update RLS policy (USING(true)/WITH CHECK(true)): only category and a one-time description backfill may change on a row the caller does not own.';

-- ============================================================
-- public.users  (profile lookup for friend-by-email)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.users (
  id             UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email          TEXT NOT NULL,
  first_name     TEXT,
  last_name      TEXT,
  avatar_url     TEXT,
  last_active_at TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- Stamped by the client on every login/session-resume (see touchLastActive
-- in src/app.js) and at signup by handle_new_user below.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;
UPDATE public.users SET last_active_at = created_at WHERE last_active_at IS NULL;

-- Split from a single "name" column (kept in sync with the live project;
-- safe to re-run — later runs are no-ops once first_name/last_name exist
-- and name is gone).
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_name  TEXT;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'name') THEN
    UPDATE public.users
    SET
      first_name = NULLIF(initcap(split_part(trim(name), ' ', 1)), ''),
      last_name  = CASE
        WHEN position(' ' in trim(name)) > 0
        THEN NULLIF(initcap(trim(substring(trim(name) from position(' ' in trim(name)) + 1))), '')
        ELSE NULL
      END
    WHERE name IS NOT NULL AND first_name IS NULL;

    ALTER TABLE public.users DROP COLUMN name;
  END IF;
END $$;

-- RLS policies alone aren't sufficient without the base table grant (the
-- users_select/insert/update policies below were previously dead code on
-- the authenticated role for exactly this reason — direct client access,
-- e.g. touchLastActive() in src/app.js, needs this too).
GRANT SELECT, INSERT, UPDATE ON public.users TO authenticated;

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_select" ON public.users;
DROP POLICY IF EXISTS "users_insert" ON public.users;
DROP POLICY IF EXISTS "users_update" ON public.users;

CREATE POLICY "users_select" ON public.users
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "users_insert" ON public.users
  FOR INSERT TO authenticated WITH CHECK (id = auth.uid());

CREATE POLICY "users_update" ON public.users
  FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- Auth-signup trigger: creates the public.users row from the auth.users
-- metadata set by supabase.auth.signUp() at registration. Title-cases
-- (initcap) server-side as a safety net regardless of what the client sent.
-- (Was previously only defined live in the dashboard, not tracked here.)
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.users (id, email, first_name, last_name, last_active_at)
  values (
    new.id,
    new.email,
    initcap(new.raw_user_meta_data->>'first_name'),
    initcap(new.raw_user_meta_data->>'last_name'),
    now()
  );
  return new;
end;
$function$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger functions (RETURNS trigger) can't be invoked directly via a
-- normal function call regardless of grants — Postgres refuses with
-- "trigger functions can only be called as triggers" — so this REVOKE is
-- pure hygiene (removing the default PUBLIC grant every function gets at
-- creation), not a functional fix. Kept explicit anyway so a security
-- scan doesn't keep re-flagging it.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;

-- (public_profiles view is created further below, after
-- public.marketplace_listings exists — it left-joins that table.)

-- ============================================================
-- public.vouchers
-- ============================================================
-- Originally created via the dashboard, not this script — same note as
-- brands above: this CREATE TABLE only matters for a fresh bootstrap.
CREATE TABLE IF NOT EXISTS public.vouchers (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  brand             TEXT NOT NULL,
  category          TEXT,
  amount            NUMERIC(10,2),
  remaining_amount  NUMERIC(10,2),
  currency          TEXT DEFAULT 'EUR',
  voucher_code      TEXT,
  pin               TEXT,
  expiration_date   DATE,
  image_url         TEXT,
  notes             TEXT,
  status            TEXT DEFAULT 'active'
                      CHECK (status IN ('active', 'used', 'expired', 'listed', 'sold')),
  voucher_type      TEXT NOT NULL DEFAULT 'gift_card'
                      CHECK (voucher_type IN ('gift_card', 'store_credit')),
  copy_count        INTEGER NOT NULL DEFAULT 0,
  balance           NUMERIC,
  photo_url         TEXT,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS barcode_path TEXT;

-- Not every voucher has a monetary face value (e.g. "weekend getaway for
-- two", "movie ticket") — amount becomes optional, with a free-text
-- description as the alternative. One of the two must be present.
ALTER TABLE public.vouchers ALTER COLUMN amount DROP NOT NULL;
ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS value_description TEXT;
ALTER TABLE public.vouchers DROP CONSTRAINT IF EXISTS vouchers_value_present_check;
ALTER TABLE public.vouchers ADD CONSTRAINT vouchers_value_present_check
  CHECK (amount IS NOT NULL OR value_description IS NOT NULL);

-- Optional personal note some vouchers arrive with (a gift message + who
-- it's from) — read by AI extraction when visible, or entered manually.
ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS gift_message TEXT;
ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS gift_sender  TEXT;

-- Normalizes brand the same way referral_codes.brand_id already does —
-- vouchers.brand stays freeform autocomplete text (users can type
-- anything); brand_id is best-effort enrichment resolved via
-- getBrandByName() after ensureBrand() in src/app.js, not an enforced
-- relationship the UI depends on. Nullable + SET NULL to match.
ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES public.brands(id) ON DELETE SET NULL;
UPDATE public.vouchers v SET brand_id = b.id
  FROM public.brands b
  WHERE v.brand_id IS NULL AND lower(v.brand) = lower(b.name);

-- Guards against negative amounts — no bad data existed when these were
-- added, but nothing was stopping it either.
ALTER TABLE public.vouchers DROP CONSTRAINT IF EXISTS vouchers_amount_nonneg;
ALTER TABLE public.vouchers ADD CONSTRAINT vouchers_amount_nonneg CHECK (amount IS NULL OR amount >= 0);
ALTER TABLE public.vouchers DROP CONSTRAINT IF EXISTS vouchers_balance_nonneg;
ALTER TABLE public.vouchers ADD CONSTRAINT vouchers_balance_nonneg CHECK (balance IS NULL OR balance >= 0);

ALTER TABLE public.vouchers ENABLE ROW LEVEL SECURITY;

-- Same drift pattern already caught for brands above: the live project has
-- these under dashboard-assigned names ("Users can view own vouchers" etc),
-- so this script's own vouchers_select/insert/update/delete names never
-- matched anything and kept silently no-op'ing. Also: live has a SEPARATE
-- policy, "vouchers_select_listed", allowing ANY authenticated user to see
-- a voucher with status = 'listed' — undocumented here until now, but
-- required for the marketplace: fetchListings() joins
-- marketplace_listings -> vouchers(brand, expiration_date), and without
-- this a buyer couldn't see the brand/expiry of someone else's listing.
DROP POLICY IF EXISTS "Users can view own vouchers" ON public.vouchers;
DROP POLICY IF EXISTS "Users can create own vouchers" ON public.vouchers;
DROP POLICY IF EXISTS "Users can update own vouchers" ON public.vouchers;
DROP POLICY IF EXISTS "Users can delete own vouchers" ON public.vouchers;
DROP POLICY IF EXISTS "vouchers_select_listed" ON public.vouchers;
DROP POLICY IF EXISTS "vouchers_select" ON public.vouchers;
DROP POLICY IF EXISTS "vouchers_insert" ON public.vouchers;
DROP POLICY IF EXISTS "vouchers_update" ON public.vouchers;
DROP POLICY IF EXISTS "vouchers_delete" ON public.vouchers;

CREATE POLICY "vouchers_select" ON public.vouchers
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "vouchers_select_listed" ON public.vouchers
  FOR SELECT TO authenticated USING (status = 'listed');

CREATE POLICY "vouchers_insert" ON public.vouchers
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "vouchers_update" ON public.vouchers
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "vouchers_delete" ON public.vouchers
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ============================================================
-- public.marketplace_listings
-- ============================================================
CREATE TABLE IF NOT EXISTS public.marketplace_listings (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_id          UUID        NOT NULL REFERENCES public.vouchers(id) ON DELETE CASCADE,
  seller_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  original_value      NUMERIC(10,2) NOT NULL,
  selling_price       NUMERIC(10,2) NOT NULL,
  discount_percentage NUMERIC(5,2),
  currency            TEXT        NOT NULL DEFAULT 'EUR',
  status              TEXT        NOT NULL DEFAULT 'available'
                        CHECK (status IN ('available', 'reserved', 'sold', 'cancelled')),
  visibility          TEXT        NOT NULL DEFAULT 'public'
                        CHECK (visibility IN ('public', 'friends_only')),
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

-- Add missing columns to existing table safely
ALTER TABLE public.marketplace_listings ADD COLUMN IF NOT EXISTS discount_percentage NUMERIC(5,2);
ALTER TABLE public.marketplace_listings ADD COLUMN IF NOT EXISTS status     TEXT NOT NULL DEFAULT 'available';
ALTER TABLE public.marketplace_listings ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'public';
ALTER TABLE public.marketplace_listings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

ALTER TABLE public.marketplace_listings DROP CONSTRAINT IF EXISTS marketplace_listings_selling_price_nonneg;
ALTER TABLE public.marketplace_listings ADD CONSTRAINT marketplace_listings_selling_price_nonneg CHECK (selling_price >= 0);
ALTER TABLE public.marketplace_listings DROP CONSTRAINT IF EXISTS marketplace_listings_original_value_nonneg;
ALTER TABLE public.marketplace_listings ADD CONSTRAINT marketplace_listings_original_value_nonneg CHECK (original_value >= 0);

ALTER TABLE public.marketplace_listings ENABLE ROW LEVEL SECURITY;

-- Live carries one combined "Users can manage own listings" FOR ALL policy
-- (covers select/insert/update/delete for the seller) instead of this
-- file's split per-command policies — replace it with the explicit split
-- so every operation is individually traceable to a named policy here.
-- listings_select_own additionally covers the seller's own non-'available'
-- rows (cancelled/sold), which the combined policy granted implicitly.
DROP POLICY IF EXISTS "Users can manage own listings" ON public.marketplace_listings;
DROP POLICY IF EXISTS "listings_select" ON public.marketplace_listings;
DROP POLICY IF EXISTS "listings_select_own" ON public.marketplace_listings;
DROP POLICY IF EXISTS "listings_insert" ON public.marketplace_listings;
DROP POLICY IF EXISTS "listings_update" ON public.marketplace_listings;
DROP POLICY IF EXISTS "listings_delete" ON public.marketplace_listings;

-- The public SELECT policy (named "Anyone can view public available
-- listings" on the live project, not "listings_select") is (re)created
-- further below, after public.friendships and public.trusted_network_ids()
-- exist — it needs both to scope 'friends_only' (Trusted Community)
-- visibility to the seller's network.

CREATE POLICY "listings_select_own" ON public.marketplace_listings
  FOR SELECT TO authenticated USING (seller_id = auth.uid());

CREATE POLICY "listings_insert" ON public.marketplace_listings
  FOR INSERT TO authenticated WITH CHECK (seller_id = auth.uid());

CREATE POLICY "listings_update" ON public.marketplace_listings
  FOR UPDATE TO authenticated
  USING (seller_id = auth.uid()) WITH CHECK (seller_id = auth.uid());

CREATE POLICY "listings_delete" ON public.marketplace_listings
  FOR DELETE TO authenticated USING (seller_id = auth.uid());

-- public_profiles view (friend/seller/referral-owner lookups use this,
-- never public.users directly). Column set changes on every re-run that
-- changes it, so drop + recreate rather than CREATE OR REPLACE.
-- (Was previously only defined live in the dashboard, not tracked here.)
DROP VIEW IF EXISTS public.public_profiles;

CREATE VIEW public.public_profiles AS
SELECT u.id, u.email, u.first_name, u.last_name,
       count(ml.id) FILTER (WHERE ml.status = 'sold') AS vouchers_sold
FROM public.users u
LEFT JOIN public.marketplace_listings ml ON ml.seller_id = u.id
GROUP BY u.id, u.email, u.first_name, u.last_name;

-- Deliberately SECURITY DEFINER (the default for views unless
-- security_invoker is set true): public.users RLS is self-only
-- (auth.uid() = id), so a security_invoker view would return zero rows
-- for anyone but the caller — breaking every one of the cross-user
-- lookups this view exists for (marketplace seller contact, friends
-- list, pending friend requests, add-friend-by-email). Scope is bounded
-- by exposing only id/email/first_name/last_name/vouchers_sold and by
-- granting SELECT to authenticated only, never anon/PUBLIC.
ALTER VIEW public.public_profiles SET (security_invoker = false);

-- Recreating the view above drops its prior grants — reinstate SELECT for
-- the app's client role, and explicitly deny anon/PUBLIC.
REVOKE ALL ON public.public_profiles FROM PUBLIC;
REVOKE ALL ON public.public_profiles FROM anon;
GRANT SELECT ON public.public_profiles TO authenticated;

COMMENT ON VIEW public.public_profiles IS
  'Cross-user directory (marketplace seller contact, friends list, pending requests, add-friend-by-email) exposing id/email/first_name/last_name/vouchers_sold for ANY user. Deliberately SECURITY DEFINER: public.users RLS is self-only (auth.uid() = id), so a security_invoker view would return zero rows for anyone but the caller, breaking all of the above. Scope is bounded by: (a) no columns beyond the five listed, (b) SELECT granted only to authenticated, never anon/PUBLIC.';

-- ============================================================
-- public.referral_codes
-- ============================================================
CREATE TABLE IF NOT EXISTS public.referral_codes (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand_id             UUID REFERENCES public.brands(id) ON DELETE SET NULL,
  brand                TEXT NOT NULL,
  code                 TEXT NOT NULL,
  referral_link        TEXT,
  benefit_for_new_user TEXT,
  benefit_for_referrer TEXT,
  visibility           TEXT NOT NULL DEFAULT 'public'
                         CHECK (visibility IN ('public', 'friends', 'private')),
  expiration_date      DATE,
  created_at           TIMESTAMPTZ DEFAULT now()
);

-- Add missing columns to existing table safely
ALTER TABLE public.referral_codes ADD COLUMN IF NOT EXISTS brand_id             UUID REFERENCES public.brands(id) ON DELETE SET NULL;
ALTER TABLE public.referral_codes ADD COLUMN IF NOT EXISTS referral_link        TEXT;
ALTER TABLE public.referral_codes ADD COLUMN IF NOT EXISTS benefit_for_new_user TEXT;
ALTER TABLE public.referral_codes ADD COLUMN IF NOT EXISTS benefit_for_referrer TEXT;
ALTER TABLE public.referral_codes ADD COLUMN IF NOT EXISTS expiration_date      DATE;
ALTER TABLE public.referral_codes ADD COLUMN IF NOT EXISTS terms                TEXT;
ALTER TABLE public.referral_codes ADD COLUMN IF NOT EXISTS used_count           INTEGER NOT NULL DEFAULT 0;

-- Backfill brand_id from brands table where name matches
UPDATE public.referral_codes rc
SET brand_id = b.id
FROM public.brands b
WHERE rc.brand_id IS NULL
  AND lower(rc.brand) = lower(b.name);

ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;

-- Same drift pattern again: live carries four overlapping dashboard-named
-- SELECT-ish policies here (two of which are narrower subsets of what
-- referrals_select already covers), so this section never converged
-- either.
DROP POLICY IF EXISTS "Anyone can view public referral codes" ON public.referral_codes;
DROP POLICY IF EXISTS "Users can read referral codes" ON public.referral_codes;
DROP POLICY IF EXISTS "Users can view own referral codes" ON public.referral_codes;
DROP POLICY IF EXISTS "Users can create own referral codes" ON public.referral_codes;
DROP POLICY IF EXISTS "Users can update own referral codes" ON public.referral_codes;
DROP POLICY IF EXISTS "Users can delete own referral codes" ON public.referral_codes;
DROP POLICY IF EXISTS "referrals_select" ON public.referral_codes;
DROP POLICY IF EXISTS "referrals_insert" ON public.referral_codes;
DROP POLICY IF EXISTS "referrals_update" ON public.referral_codes;
DROP POLICY IF EXISTS "referrals_delete" ON public.referral_codes;

-- Own codes always visible; public codes visible to all authenticated;
-- friend codes visible if the viewer follows the owner (requester_id/receiver_id schema)
CREATE POLICY "referrals_select" ON public.referral_codes
  FOR SELECT TO authenticated USING (
    user_id = auth.uid()
    OR visibility = 'public'
    OR (
      visibility = 'friends'
      AND user_id IN (
        SELECT receiver_id FROM public.friendships
        WHERE requester_id = auth.uid() AND status = 'accepted'
      )
    )
  );

CREATE POLICY "referrals_insert" ON public.referral_codes
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "referrals_update" ON public.referral_codes
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "referrals_delete" ON public.referral_codes
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ============================================================
-- public.referral_code_uses  ("+1 Use" marks — a join table rather than a
-- plain counter so the owner is blocked from inflating their own code's
-- count at the RLS level (not just hidden in the UI), and so the same
-- non-owner can't spam +1 repeatedly — one mark per user per code.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.referral_code_uses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_id UUID NOT NULL REFERENCES public.referral_codes(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (referral_id, user_id)
);

GRANT SELECT, INSERT, DELETE ON public.referral_code_uses TO authenticated;

ALTER TABLE public.referral_code_uses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "referral_code_uses_select" ON public.referral_code_uses;
DROP POLICY IF EXISTS "referral_code_uses_insert" ON public.referral_code_uses;
DROP POLICY IF EXISTS "referral_code_uses_delete" ON public.referral_code_uses;

-- A user only ever needs to know their OWN marks (to render "already
-- marked" button state) — no need to expose who else marked a code.
CREATE POLICY "referral_code_uses_select" ON public.referral_code_uses
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- The core fix for "users can give their own referral +1 use": you can
-- only mark a code as used if you are NOT its owner.
CREATE POLICY "referral_code_uses_insert" ON public.referral_code_uses
  FOR INSERT TO authenticated WITH CHECK (
    user_id = auth.uid()
    AND user_id <> (SELECT rc.user_id FROM public.referral_codes rc WHERE rc.id = referral_id)
  );

CREATE POLICY "referral_code_uses_delete" ON public.referral_code_uses
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Keeps referral_codes.used_count as a denormalized, sortable count.
-- SECURITY DEFINER: the calling (non-owner) user has no UPDATE rights on
-- someone else's referral_codes row under its owner-only RLS policy, so
-- this needs to run with elevated privilege to persist the count.
CREATE OR REPLACE FUNCTION public.sync_referral_used_count()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.referral_codes SET used_count = used_count + 1 WHERE id = NEW.referral_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.referral_codes SET used_count = GREATEST(used_count - 1, 0) WHERE id = OLD.referral_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS referral_code_uses_sync ON public.referral_code_uses;
CREATE TRIGGER referral_code_uses_sync
  AFTER INSERT OR DELETE ON public.referral_code_uses
  FOR EACH ROW EXECUTE FUNCTION public.sync_referral_used_count();

-- Hygiene only, see the matching comment on handle_new_user above —
-- trigger functions can't be called directly regardless of grants.
REVOKE EXECUTE ON FUNCTION public.sync_referral_used_count() FROM PUBLIC;

-- ============================================================
-- public.friendships
-- ============================================================
CREATE TABLE IF NOT EXISTS public.friendships (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  receiver_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'accepted'
                 CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE (requester_id, receiver_id)
);

ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

-- Same drift pattern again: the live project accumulated FIVE overlapping
-- dashboard-named policies here (two near-identical SELECTs, two
-- near-identical INSERTs, two near-identical UPDATEs — none named
-- "friendships_select" etc), so this section never actually converged
-- either. Also: the live table has no UPDATE column-level need beyond
-- accept/decline, so no dedicated "friendships_update" policy exists here
-- — accept/decline goes through app code that only ever sets status, and
-- there's historically been no UPDATE policy tracked in this file at all,
-- even though "Users can update friendships involving them" exists live.
-- Add it here as friendships_update so it's finally tracked.
DROP POLICY IF EXISTS "Users can view friendships involving them" ON public.friendships;
DROP POLICY IF EXISTS "Users can read their friendships" ON public.friendships;
DROP POLICY IF EXISTS "Users can create friend requests" ON public.friendships;
DROP POLICY IF EXISTS "Users can create friendship requests" ON public.friendships;
DROP POLICY IF EXISTS "Users can update friendships involving them" ON public.friendships;
DROP POLICY IF EXISTS "Users can update their friendships" ON public.friendships;
DROP POLICY IF EXISTS "Users can delete their friendships" ON public.friendships;
DROP POLICY IF EXISTS "friendships_select" ON public.friendships;
DROP POLICY IF EXISTS "friendships_insert" ON public.friendships;
DROP POLICY IF EXISTS "friendships_update" ON public.friendships;
DROP POLICY IF EXISTS "friendships_delete" ON public.friendships;

CREATE POLICY "friendships_select" ON public.friendships
  FOR SELECT TO authenticated
  USING (requester_id = auth.uid() OR receiver_id = auth.uid());

CREATE POLICY "friendships_insert" ON public.friendships
  FOR INSERT TO authenticated WITH CHECK (requester_id = auth.uid());

CREATE POLICY "friendships_update" ON public.friendships
  FOR UPDATE TO authenticated
  USING (requester_id = auth.uid() OR receiver_id = auth.uid())
  WITH CHECK (requester_id = auth.uid() OR receiver_id = auth.uid());

-- Both requester_id = auth.uid() AND receiver_id = auth.uid() are required:
-- declineFriendRequest() in src/app.js deletes as the receiver, and
-- removeFriend() deletes from either side. The narrower
-- requester-only version previously tracked in this file (never actually
-- applied live, see comment above) would have broken both of those.
CREATE POLICY "friendships_delete" ON public.friendships
  FOR DELETE TO authenticated USING (requester_id = auth.uid() OR receiver_id = auth.uid());

-- ============================================================
-- Trusted Community: a marketplace listing's "friends"-visibility means
-- visible to the seller's 1st- AND 2nd-degree network (friends, and
-- friends of friends), not just direct friends. friendships_select's RLS
-- (requester_id/receiver_id = auth.uid()) only lets a user read rows
-- where they're a party — it blocks a plain 2-hop self-join, since
-- friend B's OTHER friendships aren't visible to A under that policy. So
-- computing "who is B friends with" requires a SECURITY DEFINER function
-- that bypasses RLS internally; it's guarded to p_user = auth.uid() so it
-- can't be called to enumerate a stranger's network.
-- ============================================================
CREATE OR REPLACE FUNCTION public.trusted_network_ids(p_user UUID)
RETURNS TABLE(user_id UUID)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$
  WITH direct AS (
    SELECT receiver_id AS id FROM public.friendships
      WHERE requester_id = p_user AND status = 'accepted' AND p_user = auth.uid()
    UNION
    SELECT requester_id AS id FROM public.friendships
      WHERE receiver_id = p_user AND status = 'accepted' AND p_user = auth.uid()
  ),
  extended AS (
    SELECT receiver_id AS id FROM public.friendships
      WHERE requester_id IN (SELECT id FROM direct) AND status = 'accepted'
    UNION
    SELECT requester_id AS id FROM public.friendships
      WHERE receiver_id IN (SELECT id FROM direct) AND status = 'accepted'
  )
  SELECT id FROM direct
  UNION
  SELECT id FROM extended
  EXCEPT
  SELECT p_user
$$;

-- Postgres grants EXECUTE to PUBLIC (which includes the fully
-- unauthenticated `anon` role) by default on every function it creates —
-- the GRANT ... TO authenticated below is additive, not a replacement, so
-- without this REVOKE an anonymous caller could still invoke this
-- directly via /rest/v1/rpc/trusted_network_ids using only the public
-- anon key. Safe here regardless (self-guarded: WHERE p_user = auth.uid()
-- returns nothing for a NULL/anon auth.uid()), but revoked anyway as
-- defense-in-depth and to not rely on that guard alone.
REVOKE EXECUTE ON FUNCTION public.trusted_network_ids(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.trusted_network_ids(UUID) TO authenticated;

COMMENT ON FUNCTION public.trusted_network_ids(UUID) IS
  'SECURITY DEFINER, read-only. Returns the 1st- and 2nd-degree accepted-friendship network of p_user. Self-guarded: every branch of the CTE requires p_user = auth.uid(), so passing any id other than the caller''s own returns an empty set -- it cannot be used to enumerate another user''s network. Touches no data beyond SELECTs on public.friendships; performs no writes.';

-- Public-visibility SELECT policy, named "Anyone can view public available
-- listings" on the live project (kept as-is rather than renamed, since it's
-- user-facing-adjacent and already referenced in dashboard audit history).
-- Public listings are visible to everyone; 'friends_only' (Trusted
-- Community) listings are visible only within the seller's trusted
-- network; sellers always see their own (any status) via the separate
-- listings_select_own policy defined above.
DROP POLICY IF EXISTS "listings_select" ON public.marketplace_listings;
DROP POLICY IF EXISTS "Anyone can view public available listings" ON public.marketplace_listings;

CREATE POLICY "Anyone can view public available listings" ON public.marketplace_listings
  FOR SELECT TO authenticated USING (
    status = 'available'
    AND (
      visibility = 'public'
      OR (
        visibility = 'friends_only'
        AND seller_id IN (SELECT user_id FROM public.trusted_network_ids(auth.uid()))
      )
    )
  );

-- ============================================================
-- public.notifications  (reminders)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.notifications (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  voucher_id        UUID REFERENCES public.vouchers(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL DEFAULT 'expiry_reminder'
                       CHECK (notification_type IN ('expiry_reminder', 'reminder')),
  reminder_date     DATE NOT NULL,
  reminder_time     TIME,
  sent              BOOLEAN NOT NULL DEFAULT false,
  sent_at           TIMESTAMPTZ,
  dismissed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT now()
);

-- Add missing columns to existing table safely
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS notification_type TEXT NOT NULL DEFAULT 'expiry_reminder';
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS reminder_time     TIME;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS sent              BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS sent_at          TIMESTAMPTZ;
-- dismissed_at fixes a real model bug: sent/sent_at used to be written by
-- TWO unrelated events — the send-daily-push cron job (a push was actually
-- delivered) AND dismissReminder() in the client (the user tapped "remove
-- reminder" on a banner, before it ever fired). Conflating the two meant
-- sent_at could record a dismissal as if it were a delivery, and there was
-- no way to tell "delivered" apart from "cancelled by the user" after the
-- fact. Now: sent/sent_at is server-owned only; dismissed_at is
-- client-owned only. send-daily-push checks both (sent = false AND
-- dismissed_at IS NULL) before pushing.
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS dismissed_at TIMESTAMPTZ;
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_notification_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_notification_type_check
  CHECK (notification_type IN ('expiry_reminder', 'reminder'));

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Same drift pattern as brands/vouchers/friendships above: live has these
-- under dashboard names (including two overlapping SELECT policies), so
-- this section's own DROP/CREATE names never matched and kept no-op'ing.
DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can read own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can create own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can delete own notifications" ON public.notifications;
DROP POLICY IF EXISTS "notifications_select" ON public.notifications;
DROP POLICY IF EXISTS "notifications_insert" ON public.notifications;
DROP POLICY IF EXISTS "notifications_update" ON public.notifications;
DROP POLICY IF EXISTS "notifications_delete" ON public.notifications;

CREATE POLICY "notifications_select" ON public.notifications
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "notifications_insert" ON public.notifications
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "notifications_update" ON public.notifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "notifications_delete" ON public.notifications
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ============================================================
-- public.voucher_extraction_log  (audit trail for AI voucher
-- extraction — metadata only, never field values; no rate limit
-- is currently enforced against it, see extract-voucher/index.ts)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.voucher_extraction_log (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_type  TEXT NOT NULL CHECK (file_type IN ('image', 'pdf')),
  success    BOOLEAN NOT NULL,
  error_code TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS policies alone aren't sufficient without the base table grant.
GRANT SELECT, INSERT ON public.voucher_extraction_log TO authenticated;

ALTER TABLE public.voucher_extraction_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "extraction_log_select" ON public.voucher_extraction_log;
DROP POLICY IF EXISTS "extraction_log_insert" ON public.voucher_extraction_log;

CREATE POLICY "extraction_log_select" ON public.voucher_extraction_log
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "extraction_log_insert" ON public.voucher_extraction_log
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- ============================================================
-- public.voucher_files  (one row per photo/PDF attached to a voucher —
-- a voucher can have several; replaces the older single image_url/
-- photo_url columns for new uploads. Referenced by claim_voucher_gift
-- below, which reassigns ownership on gift claim, and by the
-- voucher-photos storage policies further down.)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.voucher_files (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_id UUID NOT NULL REFERENCES public.vouchers(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_path  TEXT NOT NULL,
  file_type  TEXT NOT NULL DEFAULT 'image' CHECK (file_type IN ('image', 'pdf')),
  position   INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.voucher_files TO authenticated;
ALTER TABLE public.voucher_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "voucher_files_select" ON public.voucher_files;
DROP POLICY IF EXISTS "voucher_files_insert" ON public.voucher_files;
DROP POLICY IF EXISTS "voucher_files_update" ON public.voucher_files;
DROP POLICY IF EXISTS "voucher_files_delete" ON public.voucher_files;

CREATE POLICY "voucher_files_select" ON public.voucher_files
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "voucher_files_insert" ON public.voucher_files
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "voucher_files_update" ON public.voucher_files
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "voucher_files_delete" ON public.voucher_files
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ============================================================
-- public.voucher_gifts  (send a voucher to a friend via a claim
-- link/QR code, even before they have an account)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.voucher_gifts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_id UUID NOT NULL REFERENCES public.vouchers(id) ON DELETE CASCADE,
  sender_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'claimed', 'cancelled')),
  claimed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  claimed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days'),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- At most one active pending gift per voucher at a time.
CREATE UNIQUE INDEX IF NOT EXISTS voucher_gifts_one_pending_per_voucher
  ON public.voucher_gifts (voucher_id) WHERE status = 'pending';

GRANT SELECT, INSERT, UPDATE ON public.voucher_gifts TO authenticated;
ALTER TABLE public.voucher_gifts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "voucher_gifts_select" ON public.voucher_gifts;
DROP POLICY IF EXISTS "voucher_gifts_insert" ON public.voucher_gifts;
DROP POLICY IF EXISTS "voucher_gifts_update" ON public.voucher_gifts;

CREATE POLICY "voucher_gifts_select" ON public.voucher_gifts
  FOR SELECT TO authenticated USING (sender_id = auth.uid());

CREATE POLICY "voucher_gifts_insert" ON public.voucher_gifts
  FOR INSERT TO authenticated WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.vouchers v WHERE v.id = voucher_id AND v.user_id = auth.uid())
  );

CREATE POLICY "voucher_gifts_update" ON public.voucher_gifts
  FOR UPDATE TO authenticated USING (sender_id = auth.uid()) WITH CHECK (sender_id = auth.uid());

-- SECURITY DEFINER: the recipient isn't the voucher's owner yet, so the
-- ownership transfer below can't happen under the normal owner-scoped RLS
-- policies on vouchers/voucher_files — this function runs with elevated
-- privilege but still resolves auth.uid() from the caller's own session.
CREATE OR REPLACE FUNCTION public.claim_voucher_gift(p_gift_id UUID)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_gift RECORD;
BEGIN
  SELECT * INTO v_gift FROM public.voucher_gifts
    WHERE id = p_gift_id AND status = 'pending' AND expires_at > now()
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This gift link is no longer valid' USING ERRCODE = 'P0001';
  END IF;
  IF v_gift.sender_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot claim your own gift' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.vouchers SET user_id = auth.uid() WHERE id = v_gift.voucher_id;
  -- voucher_files RLS is user_id-scoped too (select/insert/update/delete all
  -- `user_id = auth.uid()`) — without this, the new owner couldn't see the
  -- attached photos/barcode crop that came with the voucher.
  UPDATE public.voucher_files SET user_id = auth.uid() WHERE voucher_id = v_gift.voucher_id;
  UPDATE public.voucher_gifts SET status = 'claimed', claimed_by = auth.uid(), claimed_at = now()
    WHERE id = v_gift.id;

  -- Claiming a gift is a deliberate, mutual act (sender chose this person to
  -- gift to; recipient chose to claim), so skip the normal pending-request
  -- step and land them straight in each other's friends list.
  IF NOT EXISTS (
    SELECT 1 FROM public.friendships
    WHERE (requester_id = v_gift.sender_id AND receiver_id = auth.uid())
       OR (requester_id = auth.uid() AND receiver_id = v_gift.sender_id)
  ) THEN
    INSERT INTO public.friendships (requester_id, receiver_id, status)
    VALUES (v_gift.sender_id, auth.uid(), 'accepted');
  END IF;

  RETURN v_gift.voucher_id;
END;
$$;

-- Security fix: Postgres grants EXECUTE to PUBLIC (including the
-- unauthenticated `anon` role) by default on function creation — without
-- this REVOKE, an anonymous caller with only the public anon key could
-- invoke this directly via /rest/v1/rpc/claim_voucher_gift, never having
-- logged in. Unlike trusted_network_ids, this one has real side effects
-- (row locks, attempts to reassign voucher ownership via
-- `auth.uid()` — which is NULL for an anon caller) — it was only saved
-- from actually corrupting data by vouchers.user_id being NOT NULL,
-- which made the UPDATE fail rather than succeed. That's accidental
-- protection, not real security, and would not survive a future schema
-- change. Discovered and fixed as part of an auth security review.
REVOKE EXECUTE ON FUNCTION public.claim_voucher_gift(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_voucher_gift(UUID) TO authenticated;

COMMENT ON FUNCTION public.claim_voucher_gift(UUID) IS
  'SECURITY DEFINER. On behalf of the caller, claims exactly one public.voucher_gifts row: the one matching p_gift_id, only if status=''pending'', unexpired, and sender_id <> auth.uid(). All row targets for the writes below (voucher_id, voucher_files.voucher_id, the gift row itself, the sender for the new friendship) are derived server-side from that single looked-up row -- never taken directly from caller input beyond p_gift_id -- so the function cannot be parameterized to touch any voucher, file, or gift outside that one validated transfer. Writes: reassigns public.vouchers.user_id and public.voucher_files.user_id for that voucher to auth.uid(); marks the gift ''claimed''; inserts one accepted public.friendships row between sender and claimer if none exists.';

-- ============================================================
-- storage.objects policies for the voucher-photos bucket
-- (bucket + original path-prefix policies were created outside this
-- tracked file; recorded here now because claim_voucher_gift above
-- needed select/update/delete extended to also recognize ownership
-- transferred via voucher_files.user_id or vouchers.barcode_path, not
-- just the path prefix — otherwise a gift recipient could see the
-- voucher but never actually open its attached photo or barcode
-- crop, since files stay at their original ${uploaderId}/... path
-- rather than being physically moved on claim)
-- ============================================================
DROP POLICY IF EXISTS "voucher_photos_select" ON storage.objects;
DROP POLICY IF EXISTS "voucher_photos_update" ON storage.objects;
DROP POLICY IF EXISTS "voucher_photos_delete" ON storage.objects;

CREATE POLICY "voucher_photos_select" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'voucher-photos' AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (SELECT 1 FROM public.voucher_files vf WHERE vf.file_path = name AND vf.user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.vouchers v WHERE v.barcode_path = name AND v.user_id = auth.uid())
    )
  );

CREATE POLICY "voucher_photos_update" ON storage.objects
  FOR UPDATE TO authenticated USING (
    bucket_id = 'voucher-photos' AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (SELECT 1 FROM public.voucher_files vf WHERE vf.file_path = name AND vf.user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.vouchers v WHERE v.barcode_path = name AND v.user_id = auth.uid())
    )
  );

CREATE POLICY "voucher_photos_delete" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'voucher-photos' AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (SELECT 1 FROM public.voucher_files vf WHERE vf.file_path = name AND vf.user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.vouchers v WHERE v.barcode_path = name AND v.user_id = auth.uid())
    )
  );

-- voucher_photos_insert is untouched — new uploads always go into the
-- uploader's own folder by construction (uploadVoucherFile builds the
-- path as ${currentUser.id}/...), so the plain path-prefix check stays:
--   FOR INSERT TO authenticated WITH CHECK (
--     bucket_id = 'voucher-photos' AND (storage.foldername(name))[1] = auth.uid()::text
--   );

-- ============================================================
-- public.push_subscriptions  (Web Push subscription per device/browser)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id),
  endpoint   TEXT NOT NULL UNIQUE,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "push_sub select" ON public.push_subscriptions;
DROP POLICY IF EXISTS "push_sub insert" ON public.push_subscriptions;
DROP POLICY IF EXISTS "push_sub update" ON public.push_subscriptions;
DROP POLICY IF EXISTS "push_sub delete" ON public.push_subscriptions;
DROP POLICY IF EXISTS "push_subscriptions_select" ON public.push_subscriptions;
DROP POLICY IF EXISTS "push_subscriptions_insert" ON public.push_subscriptions;
DROP POLICY IF EXISTS "push_subscriptions_update" ON public.push_subscriptions;
DROP POLICY IF EXISTS "push_subscriptions_delete" ON public.push_subscriptions;

CREATE POLICY "push_subscriptions_select" ON public.push_subscriptions
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "push_subscriptions_insert" ON public.push_subscriptions
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "push_subscriptions_update" ON public.push_subscriptions
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "push_subscriptions_delete" ON public.push_subscriptions
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ============================================================
-- public.push_notification_log  (which expiry pushes have already been
-- sent, so send-daily-push doesn't resend the same reminder — the
-- edge function itself runs as service_role and bypasses RLS to write
-- here; the client-facing SELECT policy below is read-only for the
-- owning user, e.g. for potential future "reminders sent" UI)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.push_notification_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id),
  voucher_id  UUID NOT NULL REFERENCES public.vouchers(id) ON DELETE CASCADE,
  days_before INTEGER NOT NULL,
  sent_at     TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, voucher_id, days_before)
);

-- voucher_id had no foreign key at all on the live project — nothing
-- enforced or cascaded cleanup if a voucher was deleted. Verified zero
-- orphaned rows existed before adding this.
ALTER TABLE public.push_notification_log DROP CONSTRAINT IF EXISTS push_notification_log_voucher_id_fkey;
ALTER TABLE public.push_notification_log ADD CONSTRAINT push_notification_log_voucher_id_fkey
  FOREIGN KEY (voucher_id) REFERENCES public.vouchers(id) ON DELETE CASCADE;

ALTER TABLE public.push_notification_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users read own push log" ON public.push_notification_log;
DROP POLICY IF EXISTS "push_notification_log_select" ON public.push_notification_log;

CREATE POLICY "push_notification_log_select" ON public.push_notification_log
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- ============================================================
-- Scheduled job (pg_cron): fires send-daily-push every 5 minutes via
-- pg_net, authenticated with the service_role key from Vault. This is
-- project-level cron config, not a table/policy — recorded here so it's
-- not only discoverable via the dashboard.
-- ============================================================
SELECT cron.schedule(
  'send-daily-push',
  '*/5 * * * *',
  $$
    select net.http_post(
      url := 'https://ynlsrbtzcarjsqnldqyc.supabase.co/functions/v1/send-daily-push',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1)
      ),
      body := '{}'::jsonb
    );
  $$
) WHERE NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-daily-push');

-- ============================================================
-- Missing FK indexes. Every RLS policy in this file filters by exactly
-- these columns (user_id/seller_id/voucher_id/etc) — without an index,
-- every RLS-scoped query was doing a sequential scan. Purely additive,
-- safe to run anytime.
-- ============================================================
CREATE INDEX IF NOT EXISTS vouchers_user_id_idx ON public.vouchers (user_id);
CREATE INDEX IF NOT EXISTS vouchers_brand_id_idx ON public.vouchers (brand_id);
CREATE INDEX IF NOT EXISTS marketplace_listings_voucher_id_idx ON public.marketplace_listings (voucher_id);
CREATE INDEX IF NOT EXISTS marketplace_listings_seller_id_idx ON public.marketplace_listings (seller_id);
CREATE INDEX IF NOT EXISTS referral_codes_user_id_idx ON public.referral_codes (user_id);
CREATE INDEX IF NOT EXISTS referral_codes_brand_id_idx ON public.referral_codes (brand_id);
CREATE INDEX IF NOT EXISTS referral_code_uses_user_id_idx ON public.referral_code_uses (user_id);
CREATE INDEX IF NOT EXISTS notifications_user_id_idx ON public.notifications (user_id);
CREATE INDEX IF NOT EXISTS notifications_voucher_id_idx ON public.notifications (voucher_id);
CREATE INDEX IF NOT EXISTS push_subscriptions_user_id_idx ON public.push_subscriptions (user_id);
CREATE INDEX IF NOT EXISTS voucher_extraction_log_user_id_idx ON public.voucher_extraction_log (user_id);
CREATE INDEX IF NOT EXISTS voucher_gifts_voucher_id_idx ON public.voucher_gifts (voucher_id);
CREATE INDEX IF NOT EXISTS voucher_gifts_sender_id_idx ON public.voucher_gifts (sender_id);
CREATE INDEX IF NOT EXISTS voucher_gifts_claimed_by_idx ON public.voucher_gifts (claimed_by);
CREATE INDEX IF NOT EXISTS voucher_files_user_id_idx ON public.voucher_files (user_id);
CREATE INDEX IF NOT EXISTS friendships_receiver_id_idx ON public.friendships (receiver_id);
CREATE INDEX IF NOT EXISTS brands_created_by_idx ON public.brands (created_by);
CREATE INDEX IF NOT EXISTS push_notification_log_voucher_id_idx ON public.push_notification_log (voucher_id);

-- ============================================================
-- Not app schema — do not remove: public.rls_auto_enable() is a
-- Supabase-platform-generated event trigger function (event trigger
-- "ensure_rls", fires on every CREATE TABLE in the public schema) that
-- auto-enables RLS on any newly created table as a safety net. It predates
-- this file, isn't authored by this project, and every ALTER TABLE ...
-- ENABLE ROW LEVEL SECURITY statement above is redundant with it — kept
-- explicit anyway so this script doesn't silently depend on project-level
-- config that isn't tracked in version control. Like the other trigger
-- functions above, it can't be invoked directly regardless of grants —
-- REVOKE here is hygiene only, done directly on the live project as part
-- of an auth security review (not re-declared here since this function
-- isn't authored by this file to begin with).

-- ============================================================
-- public.discovery_brands
-- Curated catalog for the Discover pillar: brands whose gift cards
-- users can buy firsthand (redirect-to-website), browsable by
-- category and region. Admin-curated content, not user-generated —
-- only a SELECT policy is granted to authenticated users.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.discovery_brands (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  category    TEXT NOT NULL,
  regions     TEXT[] NOT NULL DEFAULT '{}',
  location    TEXT,
  description TEXT NOT NULL,
  domain      TEXT,
  logo_url    TEXT,
  website_url TEXT NOT NULL,
  sort_order  INT NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_discovery_brands_regions     ON public.discovery_brands USING GIN (regions);
CREATE INDEX IF NOT EXISTS idx_discovery_brands_active_sort ON public.discovery_brands (is_active, sort_order);

ALTER TABLE public.discovery_brands ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "discovery_brands_select" ON public.discovery_brands;
CREATE POLICY "discovery_brands_select" ON public.discovery_brands
  FOR SELECT TO authenticated USING (is_active = true);

-- RLS policies only ever narrow rows on top of a base table grant — they
-- never substitute for one. Every other table in this file was originally
-- created via the Supabase dashboard, which auto-grants SELECT (and more)
-- to authenticated as part of creating the table; this one was created via
-- raw SQL, which does not. Omitting this left every authenticated user
-- hitting "permission denied for table discovery_brands" (Postgres error
-- 42501) before RLS was ever evaluated — the Discover tab rendered as
-- permanently empty with the failure only visible in a console.error.
GRANT SELECT ON public.discovery_brands TO authenticated;

-- Optional short callout shown on the brand detail page (e.g. "gift card
-- value never expires") — most brands won't have one.
ALTER TABLE public.discovery_brands ADD COLUMN IF NOT EXISTS fun_fact TEXT;

-- Seed content, kept idempotent (upsert on the unique `name`) so re-running
-- this file converges to the same curated catalog rather than erroring on
-- a second run or duplicating rows.
INSERT INTO public.discovery_brands
  (name, category, regions, location, description, domain, website_url, fun_fact, sort_order)
VALUES
(
  'Pureto',
  'Food & Drink',
  ARRAY['Ghent', 'Leuven', 'Bruges'],
  'Ghent, Leuven & Bruges, Belgium',
  'Pureto turns a family recipe into a fast-casual meal: warm, creamy potato purée served in custom-built bowls with your choice of sauces, meat, fish or vegetable toppings. It was founded by two brothers from Ghent who reworked their mother''s recipes for a modern audience, and was named "Starter van het Jaar" (Starter of the Year) in 2025. You''ll find restaurants in Ghent, Leuven and Bruges, alongside food trucks and delivery through Deliveroo, Uber Eats and Takeaway.com. The menu covers vegetarian, halal and meat options, plus a kids'' menu and catering for private and corporate events.',
  'pureto.be',
  'https://pureto.be/product/cadeaubon/',
  NULL,
  1
),
(
  'Ice Ice Amy',
  'Food & Drink',
  ARRAY['Ghent', 'Ostend', 'Antwerp'],
  'Ghent, Ostend & Antwerp, Belgium',
  'ICE ICE AMY is an artisanal ice cream brand built around small-batch, made-from-scratch flavours (think Pistachio Honey, Spiced Apple Crumble or Roasted Coffee), using natural ingredients with no artificial additives or colourings. It''s the creation of founder Amélie Cobbaert, who develops every recipe herself and serves it in fresh, daily-baked waffle cones. Scoop shops are open in Ghent (Kouter), Ostend (Langestraat) and Antwerp (Groenplaats), with vegan, lactose-free and gluten-free options available at every location. The website also runs a webshop for pickup or local delivery, plus gift cards you can send to someone else.',
  'iceiceamy.be',
  'https://www.iceiceamy.be/gift-card',
  NULL,
  2
),
(
  'Planet B',
  'Sustainability',
  ARRAY['Ghent'],
  'Ghent, Belgium (ships across Belgium & the Netherlands)',
  'Planet B is a Ghent-based sustainable e-commerce platform and Certified B Corporation, built around the idea that small, everyday swaps can add up to a real environmental impact. It''s the parent brand behind WONDR (personal care and beauty) and POWR (plastic-free cleaning products, including wash strips and concentrated detergents), sold through its own webshop. Planet B reports having kept nearly 6 million plastic bottles out of circulation and donated roughly €330,000 worth of product to date. A membership option adds a discount and quarterly shopping credit for regular customers.',
  'planetb.care',
  'https://planetb.care/products/gift-card?variant=32604608528458',
  'Cool fact: the gift card value never expires and can be used across multiple orders. Sustainability at its best.',
  3
)
ON CONFLICT (name) DO UPDATE SET
  category    = EXCLUDED.category,
  regions     = EXCLUDED.regions,
  location    = EXCLUDED.location,
  description = EXCLUDED.description,
  domain      = EXCLUDED.domain,
  website_url = EXCLUDED.website_url,
  fun_fact    = EXCLUDED.fun_fact,
  sort_order  = EXCLUDED.sort_order;
-- ============================================================
