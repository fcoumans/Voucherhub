-- ============================================================
-- Voucher Hub — Supabase migration (idempotent, run in SQL Editor)
-- ============================================================

-- ============================================================
-- public.brands  (source of truth for logos / autocomplete)
-- ============================================================
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

-- (public_profiles view is created further below, after
-- public.marketplace_listings exists — it left-joins that table.)

-- ============================================================
-- public.vouchers
-- ============================================================
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

ALTER TABLE public.vouchers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vouchers_select" ON public.vouchers;
DROP POLICY IF EXISTS "vouchers_insert" ON public.vouchers;
DROP POLICY IF EXISTS "vouchers_update" ON public.vouchers;
DROP POLICY IF EXISTS "vouchers_delete" ON public.vouchers;

CREATE POLICY "vouchers_select" ON public.vouchers
  FOR SELECT TO authenticated USING (user_id = auth.uid());

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
  status              TEXT        NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'inactive', 'sold')),
  visibility          TEXT        NOT NULL DEFAULT 'public'
                        CHECK (visibility IN ('public', 'friends', 'private')),
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

-- Add missing columns to existing table safely
ALTER TABLE public.marketplace_listings ADD COLUMN IF NOT EXISTS discount_percentage NUMERIC(5,2);
ALTER TABLE public.marketplace_listings ADD COLUMN IF NOT EXISTS status     TEXT NOT NULL DEFAULT 'active';
ALTER TABLE public.marketplace_listings ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'public';
ALTER TABLE public.marketplace_listings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

ALTER TABLE public.marketplace_listings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "listings_select" ON public.marketplace_listings;
DROP POLICY IF EXISTS "listings_insert" ON public.marketplace_listings;
DROP POLICY IF EXISTS "listings_update" ON public.marketplace_listings;
DROP POLICY IF EXISTS "listings_delete" ON public.marketplace_listings;

-- The public SELECT policy (named "Anyone can view public available
-- listings" on the live project, not "listings_select") is (re)created
-- further below, after public.friendships and public.trusted_network_ids()
-- exist — it needs both to scope 'friends_only' (Trusted Community)
-- visibility to the seller's network.

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

-- Recreating the view above drops its prior grants — reinstate SELECT for
-- the app's client role.
GRANT SELECT ON public.public_profiles TO authenticated;

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

DROP POLICY IF EXISTS "friendships_select" ON public.friendships;
DROP POLICY IF EXISTS "friendships_insert" ON public.friendships;
DROP POLICY IF EXISTS "friendships_delete" ON public.friendships;

CREATE POLICY "friendships_select" ON public.friendships
  FOR SELECT TO authenticated
  USING (requester_id = auth.uid() OR receiver_id = auth.uid());

CREATE POLICY "friendships_insert" ON public.friendships
  FOR INSERT TO authenticated WITH CHECK (requester_id = auth.uid());

CREATE POLICY "friendships_delete" ON public.friendships
  FOR DELETE TO authenticated USING (requester_id = auth.uid());

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

GRANT EXECUTE ON FUNCTION public.trusted_network_ids(UUID) TO authenticated;

-- Real definition of listings_select. NOTE: the live project's actual
-- status/visibility enums do NOT match this file's CREATE TABLE stanza
-- above (that block is stale/aspirational — same drift documented for
-- brands earlier in this file) — live CHECK constraints are
-- status IN ('available','reserved','sold','cancelled') and
-- visibility IN ('public','friends_only'), and the live SELECT policy is
-- named "Anyone can view public available listings", not "listings_select".
-- Public listings are visible to everyone; 'friends_only' (Trusted
-- Community) listings are visible only within the seller's trusted
-- network; sellers always see their own via the separate
-- "Users can manage own listings" FOR ALL policy.
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
  notification_type TEXT NOT NULL DEFAULT 'reminder',
  reminder_date     DATE,
  sent              BOOLEAN NOT NULL DEFAULT false,
  sent_at           TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT now()
);

-- Add missing columns to existing table safely
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS notification_type TEXT NOT NULL DEFAULT 'reminder';
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS sent              BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS sent_at          TIMESTAMPTZ;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

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

GRANT EXECUTE ON FUNCTION public.claim_voucher_gift(UUID) TO authenticated;

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
