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

ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "brands_select" ON public.brands;
DROP POLICY IF EXISTS "brands_insert" ON public.brands;
DROP POLICY IF EXISTS "brands_update" ON public.brands;

CREATE POLICY "brands_select" ON public.brands
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "brands_insert" ON public.brands
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "brands_update" ON public.brands
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- public.users  (profile lookup for friend-by-email)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.users (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email      TEXT NOT NULL,
  name       TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

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

-- ============================================================
-- public.vouchers
-- ============================================================
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

CREATE POLICY "listings_select" ON public.marketplace_listings
  FOR SELECT TO authenticated USING (status = 'active');

CREATE POLICY "listings_insert" ON public.marketplace_listings
  FOR INSERT TO authenticated WITH CHECK (seller_id = auth.uid());

CREATE POLICY "listings_update" ON public.marketplace_listings
  FOR UPDATE TO authenticated
  USING (seller_id = auth.uid()) WITH CHECK (seller_id = auth.uid());

CREATE POLICY "listings_delete" ON public.marketplace_listings
  FOR DELETE TO authenticated USING (seller_id = auth.uid());

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
