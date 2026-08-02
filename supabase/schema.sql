-- ============================================================
-- Voucher Hub — consolidated schema snapshot
-- Generated: 2026-07-30, directly from the live project (ynlsrbtzcarjsqnldqyc)
-- via catalog introspection (pg_catalog / information_schema), not copied
-- from supabase/migrations.sql.
--
-- What this file is: the CURRENT END STATE of the public schema, in one
-- readable pass — for a new engineer who doesn't want to replay 45+
-- migrations to understand what exists today. Written to be runnable
-- top-to-bottom against a fresh Supabase project to bootstrap a matching
-- schema (dependency order respected throughout).
--
-- What this file is NOT: a replacement for migration history. It is not
-- itself a migration and is never applied to the live project. It won't be
-- kept in perfect sync automatically — regenerate it (or update it by hand)
-- whenever a new migration lands, so it doesn't quietly go stale. The
-- narrative "why" behind each historical change still lives in
-- supabase/migrations.sql and, going forward, in supabase/migrations/
-- (see the README there for the naming convention).
-- ============================================================

-- ============================================================
-- Extensions
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp"       WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto           WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron;
-- pg_net lives in `public` on the live project (flagged by the Supabase
-- security advisor as "Extension in Public" — a known, not-yet-fixed
-- warning, not something this snapshot silently corrects).
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ============================================================
-- public.users  (profile row per auth.users, split first/last name;
-- backing table for friend-by-email lookup and public_profiles view)
-- ============================================================
CREATE TABLE public.users (
  id             UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email          TEXT NOT NULL UNIQUE,
  avatar_url     TEXT,
  first_name     TEXT,
  last_name      TEXT,
  last_active_at TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own profile" ON public.users
  FOR SELECT USING ((select auth.uid()) = id);

CREATE POLICY "Users can update their own profile" ON public.users
  FOR UPDATE USING ((select auth.uid()) = id);

GRANT SELECT, INSERT, UPDATE ON public.users TO authenticated;

-- ============================================================
-- public.brands  (shared/global brand catalog — not per-user owned;
-- source of truth for logos/autocomplete/category across all users)
-- ============================================================
CREATE TABLE public.brands (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  created_by  UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT now(),
  category    TEXT,
  domain      TEXT,
  logo_url    TEXT,
  description TEXT
);

CREATE INDEX brands_created_by_idx ON public.brands (created_by);

ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;

CREATE POLICY "brands_select" ON public.brands
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "brands_insert" ON public.brands
  FOR INSERT TO authenticated WITH CHECK (created_by = (select auth.uid()));

-- Any authenticated user may attempt an UPDATE (ensureBrand() corrects
-- category on brands it doesn't own; enrich-brand backfills a blank
-- description) — RLS can't restrict by column, so brands_guard_update
-- (trigger, defined further below once the function exists) enforces the
-- real boundary: only `category` (freely) and `description` (once, from
-- NULL) may actually change on a row the caller doesn't own.
CREATE POLICY "brands_update" ON public.brands
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON public.brands TO authenticated;

-- ============================================================
-- public.discovery_brands  (admin-curated catalog for the Discover
-- pillar — brands users can buy firsthand via redirect-to-website.
-- Not user-generated: SELECT-only for authenticated.)
-- ============================================================
CREATE TABLE public.discovery_brands (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  -- A brand can belong to more than one category (e.g. Planet B is both
  -- Sustainability and Shopping) — always non-empty, see the check below.
  categories  TEXT[] NOT NULL DEFAULT '{}',
  regions     TEXT[] NOT NULL DEFAULT '{}',
  location    TEXT,
  description TEXT NOT NULL,
  domain      TEXT,
  logo_url    TEXT,
  website_url TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  fun_fact    TEXT,
  CONSTRAINT discovery_brands_categories_nonempty CHECK (array_length(categories, 1) > 0)
);

CREATE INDEX idx_discovery_brands_regions     ON public.discovery_brands USING GIN (regions);
CREATE INDEX idx_discovery_brands_categories  ON public.discovery_brands USING GIN (categories);
CREATE INDEX idx_discovery_brands_active_sort ON public.discovery_brands (is_active, sort_order);

ALTER TABLE public.discovery_brands ENABLE ROW LEVEL SECURITY;

CREATE POLICY "discovery_brands_select" ON public.discovery_brands
  FOR SELECT TO authenticated USING (is_active = true);

-- Raw-SQL-created tables don't inherit the dashboard's automatic grant to
-- `authenticated` — RLS only ever narrows on top of a base grant, it never
-- substitutes for one. Without this, every read 42501's before RLS even runs.
GRANT SELECT ON public.discovery_brands TO authenticated;

-- Live currently holds 3 seed rows (Pureto, and others) — seed content
-- itself is intentionally not reproduced here; this file tracks schema, not
-- data. See supabase/migrations.sql for the original seed INSERT.

-- ============================================================
-- public.vouchers  (a user's own gift cards / store credit)
-- ============================================================
CREATE TABLE public.vouchers (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  brand              TEXT NOT NULL,
  brand_id           UUID REFERENCES public.brands(id) ON DELETE SET NULL,
  category           TEXT,
  amount             NUMERIC,
  remaining_amount   NUMERIC,
  balance            NUMERIC,
  currency           TEXT DEFAULT 'EUR',
  voucher_code       TEXT,
  pin                TEXT,
  expiration_date    DATE,
  image_url          TEXT,
  photo_url          TEXT,
  barcode_path       TEXT,
  notes              TEXT,
  value_description  TEXT,
  gift_message       TEXT,
  gift_sender        TEXT,
  status             TEXT DEFAULT 'active',
  voucher_type       TEXT NOT NULL DEFAULT 'gift_card',
  copy_count         INTEGER NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ DEFAULT now(),
  updated_at         TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT vouchers_amount_nonneg        CHECK (amount IS NULL OR amount >= 0),
  CONSTRAINT vouchers_balance_nonneg       CHECK (balance IS NULL OR balance >= 0),
  CONSTRAINT vouchers_status_check         CHECK (status = ANY (ARRAY['active','used','expired','listed','sold'])),
  CONSTRAINT vouchers_voucher_type_check   CHECK (voucher_type = ANY (ARRAY['gift_card','store_credit'])),
  -- A voucher needs SOME value representation, either a numeric amount or a
  -- free-text description (e.g. "one large pizza") for non-monetary cards.
  CONSTRAINT vouchers_value_present_check  CHECK (amount IS NOT NULL OR value_description IS NOT NULL)
);

CREATE INDEX vouchers_user_id_idx  ON public.vouchers (user_id);
CREATE INDEX vouchers_brand_id_idx ON public.vouchers (brand_id);

ALTER TABLE public.vouchers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own vouchers" ON public.vouchers
  FOR SELECT USING ((select auth.uid()) = user_id);

CREATE POLICY "vouchers_select_listed" ON public.vouchers
  FOR SELECT TO authenticated USING (status = 'listed');

CREATE POLICY "Users can create own vouchers" ON public.vouchers
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update own vouchers" ON public.vouchers
  FOR UPDATE USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete own vouchers" ON public.vouchers
  FOR DELETE USING ((select auth.uid()) = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vouchers TO authenticated;

-- ============================================================
-- public.voucher_files  (one row per photo/PDF on a voucher; a voucher
-- can have several. Ownership is reassigned wholesale by
-- claim_voucher_gift on a gift claim — see that function below.)
-- ============================================================
CREATE TABLE public.voucher_files (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_id UUID NOT NULL REFERENCES public.vouchers(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_path  TEXT NOT NULL,
  file_type  TEXT NOT NULL DEFAULT 'image',
  position   INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT voucher_files_file_type_check CHECK (file_type = ANY (ARRAY['image','pdf']))
);

CREATE INDEX voucher_files_user_id_idx    ON public.voucher_files (user_id);
CREATE INDEX voucher_files_voucher_id_idx ON public.voucher_files (voucher_id);

ALTER TABLE public.voucher_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "voucher_files_select" ON public.voucher_files
  FOR SELECT TO authenticated USING (user_id = (select auth.uid()));

CREATE POLICY "voucher_files_insert" ON public.voucher_files
  FOR INSERT TO authenticated WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "voucher_files_update" ON public.voucher_files
  FOR UPDATE TO authenticated USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "voucher_files_delete" ON public.voucher_files
  FOR DELETE TO authenticated USING (user_id = (select auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.voucher_files TO authenticated;

-- ============================================================
-- public.voucher_gifts  (send a voucher to a friend via a claim
-- link/QR code, even before they have an account)
-- ============================================================
CREATE TABLE public.voucher_gifts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_id UUID NOT NULL REFERENCES public.vouchers(id) ON DELETE CASCADE,
  sender_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status     TEXT NOT NULL DEFAULT 'pending',
  claimed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  claimed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days'),
  created_at TIMESTAMPTZ DEFAULT now(),
  -- Snapshot of the voucher's brand/amount/currency/value_description at
  -- send time (see voucher_gifts_snapshot_voucher_trigger below) — survives
  -- claim_voucher_gift reassigning vouchers.user_id to the recipient, so the
  -- sender can still see what they sent after a friend claims it.
  voucher_brand              TEXT,
  voucher_value              NUMERIC,
  voucher_currency           TEXT,
  voucher_value_description  TEXT,
  CONSTRAINT voucher_gifts_status_check CHECK (status = ANY (ARRAY['pending','claimed','cancelled']))
);

-- At most one active pending gift per voucher at a time.
CREATE UNIQUE INDEX voucher_gifts_one_pending_per_voucher
  ON public.voucher_gifts (voucher_id) WHERE (status = 'pending');
CREATE INDEX voucher_gifts_sender_id_idx  ON public.voucher_gifts (sender_id);
CREATE INDEX voucher_gifts_claimed_by_idx ON public.voucher_gifts (claimed_by);
CREATE INDEX voucher_gifts_voucher_id_idx ON public.voucher_gifts (voucher_id);

ALTER TABLE public.voucher_gifts ENABLE ROW LEVEL SECURITY;

-- Note: the recipient is deliberately NOT covered by any of these
-- policies — until they claim it, they have no RLS-visible access to the
-- gift row at all. claim_voucher_gift (below) is how a claim happens; it
-- runs SECURITY DEFINER specifically because the claimer isn't `sender_id`.
CREATE POLICY "voucher_gifts_select" ON public.voucher_gifts
  FOR SELECT TO authenticated USING (sender_id = (select auth.uid()));

CREATE POLICY "voucher_gifts_insert" ON public.voucher_gifts
  FOR INSERT TO authenticated WITH CHECK (
    sender_id = (select auth.uid())
    AND EXISTS (SELECT 1 FROM public.vouchers v WHERE v.id = voucher_id AND v.user_id = (select auth.uid()))
  );

CREATE POLICY "voucher_gifts_update" ON public.voucher_gifts
  FOR UPDATE TO authenticated USING (sender_id = (select auth.uid())) WITH CHECK (sender_id = (select auth.uid()));

GRANT SELECT, INSERT, UPDATE ON public.voucher_gifts TO authenticated;

-- BEFORE INSERT trigger: copies brand/amount/currency/value_description from
-- the referenced voucher onto the new gift row's voucher_brand/voucher_value/
-- voucher_currency/voucher_value_description columns above.
CREATE OR REPLACE FUNCTION public.voucher_gifts_snapshot_voucher()
RETURNS trigger
LANGUAGE plpgsql SET search_path = public
AS $$
BEGIN
  SELECT brand, amount, currency, value_description
    INTO NEW.voucher_brand, NEW.voucher_value, NEW.voucher_currency, NEW.voucher_value_description
  FROM public.vouchers WHERE id = NEW.voucher_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER voucher_gifts_snapshot_voucher_trigger
  BEFORE INSERT ON public.voucher_gifts
  FOR EACH ROW EXECUTE FUNCTION public.voucher_gifts_snapshot_voucher();

COMMENT ON FUNCTION public.voucher_gifts_snapshot_voucher() IS
  'BEFORE INSERT trigger on voucher_gifts. Copies brand/amount/currency/value_description from the referenced voucher into voucher_brand/voucher_value/voucher_currency/voucher_value_description on the new gift row, so the sender can still see what they sent after claim_voucher_gift transfers vouchers.user_id to the recipient.';

-- ============================================================
-- public.voucher_extraction_log  (append-only telemetry: did AI photo/PDF
-- extraction succeed. No UPDATE/DELETE policy — write-once by design.)
-- ============================================================
CREATE TABLE public.voucher_extraction_log (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_type  TEXT NOT NULL,
  success    BOOLEAN NOT NULL,
  error_code TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT voucher_extraction_log_file_type_check CHECK (file_type = ANY (ARRAY['image','pdf']))
);

CREATE INDEX voucher_extraction_log_user_id_idx ON public.voucher_extraction_log (user_id);

ALTER TABLE public.voucher_extraction_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "extraction_log_select" ON public.voucher_extraction_log
  FOR SELECT TO authenticated USING (user_id = (select auth.uid()));

CREATE POLICY "extraction_log_insert" ON public.voucher_extraction_log
  FOR INSERT TO authenticated WITH CHECK (user_id = (select auth.uid()));

GRANT SELECT, INSERT ON public.voucher_extraction_log TO authenticated;

-- ============================================================
-- public.marketplace_listings  (peer-to-peer resale of a voucher)
-- ============================================================
CREATE TABLE public.marketplace_listings (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_id           UUID NOT NULL REFERENCES public.vouchers(id) ON DELETE CASCADE,
  seller_id            UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  original_value       NUMERIC NOT NULL,
  selling_price        NUMERIC NOT NULL,
  -- Generated column: always derived from original_value/selling_price,
  -- never written directly.
  discount_percentage  NUMERIC GENERATED ALWAYS AS (
    CASE WHEN original_value > 0
      THEN round(((original_value - selling_price) / original_value) * 100, 2)
      ELSE 0
    END
  ) STORED,
  currency             TEXT DEFAULT 'EUR',
  status               TEXT DEFAULT 'available',
  visibility           TEXT DEFAULT 'public',
  created_at           TIMESTAMPTZ DEFAULT now(),
  updated_at           TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT marketplace_listings_original_value_nonneg CHECK (original_value >= 0),
  CONSTRAINT marketplace_listings_selling_price_nonneg  CHECK (selling_price >= 0),
  CONSTRAINT marketplace_listings_status_check          CHECK (status = ANY (ARRAY['available','reserved','sold','cancelled'])),
  CONSTRAINT marketplace_listings_visibility_check      CHECK (visibility = ANY (ARRAY['public','friends_only']))
);

CREATE INDEX marketplace_listings_seller_id_idx  ON public.marketplace_listings (seller_id);
CREATE INDEX marketplace_listings_voucher_id_idx ON public.marketplace_listings (voucher_id);

ALTER TABLE public.marketplace_listings ENABLE ROW LEVEL SECURITY;

-- Seller has full read/write over their own listings, any status.
CREATE POLICY "Users can manage own listings" ON public.marketplace_listings
  FOR ALL USING ((select auth.uid()) = seller_id) WITH CHECK ((select auth.uid()) = seller_id);

-- Public/friends-only visibility for everyone else — added further below,
-- once public.friendships and public.trusted_network_ids() exist, since it
-- depends on both to scope 'friends_only' (Trusted Community) visibility.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketplace_listings TO authenticated;

-- ============================================================
-- public.friendships  (mutual, request/accept model)
-- ============================================================
CREATE TABLE public.friendships (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  receiver_id  UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status       TEXT DEFAULT 'pending',
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT friendships_status_check CHECK (status = ANY (ARRAY['pending','accepted','declined','blocked'])),
  CONSTRAINT no_self_friendship        CHECK (requester_id <> receiver_id),
  CONSTRAINT unique_friendship         UNIQUE (requester_id, receiver_id)
);

CREATE INDEX friendships_receiver_id_idx ON public.friendships (receiver_id);

ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

-- Live carries duplicate-by-history policy pairs (one set from an earlier
-- pass targeting `public`, one from a later pass targeting `authenticated`,
-- both with identical quals) — reproduced here exactly as they exist on the
-- live project rather than "cleaned up", since this file is a snapshot of
-- reality, not a redesign.
CREATE POLICY "Users can view friendships involving them" ON public.friendships
  FOR SELECT USING ((select auth.uid()) = requester_id OR (select auth.uid()) = receiver_id);
CREATE POLICY "Users can read their friendships" ON public.friendships
  FOR SELECT TO authenticated USING ((select auth.uid()) = requester_id OR (select auth.uid()) = receiver_id);

CREATE POLICY "Users can create friend requests" ON public.friendships
  FOR INSERT WITH CHECK ((select auth.uid()) = requester_id);
CREATE POLICY "Users can create friendship requests" ON public.friendships
  FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = requester_id);

CREATE POLICY "Users can update friendships involving them" ON public.friendships
  FOR UPDATE USING ((select auth.uid()) = requester_id OR (select auth.uid()) = receiver_id);
CREATE POLICY "Users can update their friendships" ON public.friendships
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = requester_id OR (select auth.uid()) = receiver_id)
  WITH CHECK ((select auth.uid()) = requester_id OR (select auth.uid()) = receiver_id);

CREATE POLICY "Users can delete their friendships" ON public.friendships
  FOR DELETE TO authenticated USING ((select auth.uid()) = requester_id OR (select auth.uid()) = receiver_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.friendships TO authenticated;

-- ============================================================
-- public.trusted_network_ids(p_user)  —  SECURITY DEFINER, read-only
-- ============================================================
-- Returns the 1st- and 2nd-degree accepted-friendship network of p_user.
-- friendships_select's RLS (requester_id/receiver_id = auth.uid()) only
-- lets a user read rows where they're a party — it blocks a plain 2-hop
-- self-join, since friend B's OTHER friendships aren't visible to A under
-- that policy. So computing "who is B friends with" requires bypassing
-- RLS internally. Self-guarded: every branch requires p_user = auth.uid(),
-- so passing any id other than the caller's own returns an empty set — it
-- cannot be used to enumerate a stranger's network. Touches no data beyond
-- SELECTs on public.friendships; performs no writes.
CREATE OR REPLACE FUNCTION public.trusted_network_ids(p_user UUID)
RETURNS TABLE(user_id UUID)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
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

-- Postgres grants EXECUTE to PUBLIC (including unauthenticated `anon`) by
-- default on function creation — revoked as defense-in-depth even though
-- the self-guard above already makes an anon call a no-op.
REVOKE EXECUTE ON FUNCTION public.trusted_network_ids(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.trusted_network_ids(UUID) TO authenticated;

COMMENT ON FUNCTION public.trusted_network_ids(UUID) IS
  'SECURITY DEFINER, read-only. Returns the 1st- and 2nd-degree accepted-friendship network of p_user. Self-guarded: every branch of the CTE requires p_user = auth.uid(), so passing any id other than the caller''s own returns an empty set -- it cannot be used to enumerate another user''s network. Touches no data beyond SELECTs on public.friendships; performs no writes.';

-- Now that trusted_network_ids exists, add the public/friends_only
-- visibility policy on marketplace_listings.
CREATE POLICY "Anyone can view public available listings" ON public.marketplace_listings
  FOR SELECT TO authenticated USING (
    status = 'available'
    AND (
      visibility = 'public'
      OR (
        visibility = 'friends_only'
        AND seller_id IN (SELECT user_id FROM public.trusted_network_ids((select auth.uid())))
      )
    )
  );

-- ============================================================
-- public.notifications  (expiry reminders for vouchers)
-- ============================================================
CREATE TABLE public.notifications (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  voucher_id        UUID REFERENCES public.vouchers(id) ON DELETE CASCADE,
  notification_type TEXT DEFAULT 'expiry_reminder',
  reminder_date     DATE NOT NULL,
  reminder_time     TIME,
  sent              BOOLEAN DEFAULT false,
  sent_at           TIMESTAMPTZ,
  dismissed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT notifications_notification_type_check CHECK (notification_type = ANY (ARRAY['expiry_reminder','reminder']))
);

CREATE INDEX notifications_user_id_idx    ON public.notifications (user_id);
CREATE INDEX notifications_voucher_id_idx ON public.notifications (voucher_id);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Same organic duplicate-policy pattern as friendships (public vs
-- authenticated role, identical qual) — kept as-is, matching live.
CREATE POLICY "Users can view own notifications" ON public.notifications
  FOR SELECT USING ((select auth.uid()) = user_id);
CREATE POLICY "Users can read own notifications" ON public.notifications
  FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can create own notifications" ON public.notifications
  FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update own notifications" ON public.notifications
  FOR UPDATE TO authenticated USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete own notifications" ON public.notifications
  FOR DELETE TO authenticated USING ((select auth.uid()) = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;

-- ============================================================
-- public.activity_notifications  (general in-app notification feed —
-- distinct from public.notifications above, which stays scoped to
-- user-scheduled voucher reminders. Powers the Notifications tab and the
-- same events also delivered as push: expiry threshold crossed, friend
-- request received, referral code used, marketplace listing interest.)
-- ============================================================
CREATE TABLE public.activity_notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,  -- recipient
  type       TEXT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  link_view  TEXT,     -- frontend view name to navigate to on tap, e.g. 'voucher-detail'
  link_id    TEXT,     -- id param for that view, if any
  read_at    TIMESTAMPTZ,
  pushed_at  TIMESTAMPTZ,  -- set once send-daily-push has delivered this as a push
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT activity_notifications_type_check CHECK (type = ANY (ARRAY['expiry','friend_request','referral_used','listing_interest']))
);

CREATE INDEX activity_notifications_user_id_idx ON public.activity_notifications (user_id, created_at DESC);
CREATE INDEX activity_notifications_unpushed_idx ON public.activity_notifications (pushed_at) WHERE pushed_at IS NULL;

ALTER TABLE public.activity_notifications ENABLE ROW LEVEL SECURITY;

-- Recipients can read and mark their own notifications read. No direct
-- INSERT policy for `authenticated` — every insert goes through one of the
-- notify_* SECURITY DEFINER functions below (or the service-role edge
-- function, for expiry pushes), each validating the underlying event
-- server-side before writing, the same pattern as claim_voucher_gift.
CREATE POLICY "activity_notifications_select" ON public.activity_notifications
  FOR SELECT TO authenticated USING (user_id = (select auth.uid()));

CREATE POLICY "activity_notifications_update" ON public.activity_notifications
  FOR UPDATE TO authenticated USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));

GRANT SELECT, UPDATE ON public.activity_notifications TO authenticated;

-- ============================================================
-- public.referral_codes  (share a signup/referral code for a brand)
-- ============================================================
CREATE TABLE public.referral_codes (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID REFERENCES public.users(id) ON DELETE SET NULL,
  brand                TEXT NOT NULL,
  brand_id             UUID REFERENCES public.brands(id) ON DELETE SET NULL,
  category             TEXT,
  code                 TEXT,
  referral_link        TEXT,
  benefit_for_new_user TEXT,
  benefit_for_referrer TEXT,
  terms                TEXT,
  visibility           TEXT DEFAULT 'public',
  used_count           INTEGER NOT NULL DEFAULT 0,
  expiration_date      DATE,
  created_at           TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT referral_codes_visibility_check CHECK (visibility = ANY (ARRAY['public','friends','private']))
);

CREATE INDEX referral_codes_user_id_idx  ON public.referral_codes (user_id);
CREATE INDEX referral_codes_brand_id_idx ON public.referral_codes (brand_id);

ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;

-- Four overlapping SELECT policies from successive passes (public-only,
-- authenticated-with-public-clause, authenticated-own-only,
-- friends-aware) — all still live simultaneously (PERMISSIVE policies OR
-- together), reproduced as-is.
CREATE POLICY "Users can view own referral codes" ON public.referral_codes
  FOR SELECT USING ((select auth.uid()) = user_id);
CREATE POLICY "Anyone can view public referral codes" ON public.referral_codes
  FOR SELECT USING (visibility = 'public');
CREATE POLICY "Users can read referral codes" ON public.referral_codes
  FOR SELECT TO authenticated USING (user_id = (select auth.uid()) OR visibility = 'public');
CREATE POLICY "referrals_select" ON public.referral_codes
  FOR SELECT TO authenticated USING (
    user_id = (select auth.uid())
    OR visibility = 'public'
    OR (
      visibility = 'friends'
      AND user_id IN (
        SELECT receiver_id FROM public.friendships
          WHERE requester_id = (select auth.uid()) AND status = 'accepted'
        UNION
        SELECT requester_id FROM public.friendships
          WHERE receiver_id = (select auth.uid()) AND status = 'accepted'
      )
    )
  );

CREATE POLICY "Users can create own referral codes" ON public.referral_codes
  FOR INSERT TO authenticated WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can update own referral codes" ON public.referral_codes
  FOR UPDATE TO authenticated USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can delete own referral codes" ON public.referral_codes
  FOR DELETE TO authenticated USING (user_id = (select auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.referral_codes TO authenticated;

-- ============================================================
-- public.referral_code_uses  (one row per user who redeemed a code;
-- used_count on referral_codes is kept in sync by a trigger below)
-- ============================================================
CREATE TABLE public.referral_code_uses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_id UUID NOT NULL REFERENCES public.referral_codes(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT referral_code_uses_referral_id_user_id_key UNIQUE (referral_id, user_id)
);

CREATE INDEX referral_code_uses_user_id_idx ON public.referral_code_uses (user_id);

ALTER TABLE public.referral_code_uses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "referral_code_uses_select" ON public.referral_code_uses
  FOR SELECT TO authenticated USING (user_id = (select auth.uid()));

CREATE POLICY "referral_code_uses_insert" ON public.referral_code_uses
  FOR INSERT TO authenticated WITH CHECK (
    user_id = (select auth.uid())
    -- can't redeem your own referral code
    AND user_id <> (SELECT rc.user_id FROM public.referral_codes rc WHERE rc.id = referral_id)
  );

CREATE POLICY "referral_code_uses_delete" ON public.referral_code_uses
  FOR DELETE TO authenticated USING (user_id = (select auth.uid()));

GRANT SELECT, INSERT, DELETE ON public.referral_code_uses TO authenticated;

-- ============================================================
-- public.push_subscriptions  (Web Push endpoints, one per device)
-- ============================================================
CREATE TABLE public.push_subscriptions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id),
  endpoint   TEXT NOT NULL UNIQUE,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX push_subscriptions_user_id_idx ON public.push_subscriptions (user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "push_sub select" ON public.push_subscriptions
  FOR SELECT USING ((select auth.uid()) = user_id);
CREATE POLICY "push_sub insert" ON public.push_subscriptions
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "push_sub update" ON public.push_subscriptions
  FOR UPDATE USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "push_sub delete" ON public.push_subscriptions
  FOR DELETE USING ((select auth.uid()) = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;

-- ============================================================
-- public.push_notification_log  (dedupe guard: one push per
-- user/voucher/days-before combination)
-- ============================================================
CREATE TABLE public.push_notification_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id),
  voucher_id  UUID NOT NULL REFERENCES public.vouchers(id) ON DELETE CASCADE,
  days_before INTEGER NOT NULL,
  sent_at     TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT push_notification_log_user_id_voucher_id_days_before_key
    UNIQUE (user_id, voucher_id, days_before)
);

CREATE INDEX push_notification_log_voucher_id_idx ON public.push_notification_log (voucher_id);

ALTER TABLE public.push_notification_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own push log" ON public.push_notification_log
  FOR SELECT USING ((select auth.uid()) = user_id);

GRANT SELECT, INSERT ON public.push_notification_log TO authenticated;

-- ============================================================
-- public.public_profiles  —  SECURITY DEFINER view
-- ============================================================
-- Cross-user directory (marketplace seller contact, friends list, pending
-- requests, add-friend-by-email) exposing id/email/first_name/last_name/
-- vouchers_sold for ANY user. Deliberately SECURITY DEFINER: public.users
-- RLS is self-only (auth.uid() = id), so a security_invoker view would
-- return zero rows for anyone but the caller, breaking all of the above.
-- Scope is bounded by: (a) no columns beyond the five listed, (b) SELECT
-- granted only to authenticated, never anon/PUBLIC.
CREATE VIEW public.public_profiles AS
SELECT u.id, u.email, u.first_name, u.last_name,
       count(ml.id) FILTER (WHERE ml.status = 'sold') AS vouchers_sold
FROM public.users u
LEFT JOIN public.marketplace_listings ml ON ml.seller_id = u.id
GROUP BY u.id, u.email, u.first_name, u.last_name;

ALTER VIEW public.public_profiles SET (security_invoker = false);

REVOKE ALL ON public.public_profiles FROM PUBLIC;
REVOKE ALL ON public.public_profiles FROM anon;
GRANT SELECT ON public.public_profiles TO authenticated;

COMMENT ON VIEW public.public_profiles IS
  'Cross-user directory (marketplace seller contact, friends list, pending requests, add-friend-by-email) exposing id/email/first_name/last_name/vouchers_sold for ANY user. Deliberately SECURITY DEFINER: public.users RLS is self-only (auth.uid() = id), so a security_invoker view would return zero rows for anyone but the caller, breaking all of the above. Scope is bounded by: (a) no columns beyond the five listed, (b) SELECT granted only to authenticated, never anon/PUBLIC.';

-- ============================================================
-- public.claim_voucher_gift(p_gift_id)  —  SECURITY DEFINER
-- ============================================================
-- On behalf of the caller, claims exactly one public.voucher_gifts row:
-- the one matching p_gift_id, only if status='pending', unexpired, and
-- sender_id <> auth.uid(). All row targets for the writes below
-- (voucher_id, voucher_files.voucher_id, the gift row itself, the sender
-- for the new friendship) are derived server-side from that single
-- looked-up row — never taken directly from caller input beyond
-- p_gift_id — so the function cannot be parameterized to touch any
-- voucher, file, or gift outside that one validated transfer. Writes:
-- reassigns vouchers.user_id and voucher_files.user_id for that voucher
-- to auth.uid(); marks the gift 'claimed'; inserts one accepted
-- friendships row between sender and claimer if none exists.
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
  UPDATE public.voucher_files SET user_id = auth.uid() WHERE voucher_id = v_gift.voucher_id;
  UPDATE public.voucher_gifts SET status = 'claimed', claimed_by = auth.uid(), claimed_at = now()
    WHERE id = v_gift.id;

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

REVOKE EXECUTE ON FUNCTION public.claim_voucher_gift(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_voucher_gift(UUID) TO authenticated;

COMMENT ON FUNCTION public.claim_voucher_gift(UUID) IS
  'SECURITY DEFINER. On behalf of the caller, claims exactly one public.voucher_gifts row: the one matching p_gift_id, only if status=''pending'', unexpired, and sender_id <> auth.uid(). All row targets for the writes below (voucher_id, voucher_files.voucher_id, the gift row itself, the sender for the new friendship) are derived server-side from that single looked-up row -- never taken directly from caller input beyond p_gift_id -- so the function cannot be parameterized to touch any voucher, file, or gift outside that one validated transfer. Writes: reassigns public.vouchers.user_id and public.voucher_files.user_id for that voucher to auth.uid(); marks the gift ''claimed''; inserts one accepted public.friendships row between sender and claimer if none exists.';

-- ============================================================
-- notify_friend_request(p_friendship_id)  —  SECURITY DEFINER
-- ============================================================
-- Notifies the receiver of a pending friend request the caller just sent.
-- All row targets are derived server-side from the validated friendship
-- row (requester_id = caller, status = 'pending') — never taken directly
-- from client input beyond p_friendship_id.
CREATE OR REPLACE FUNCTION public.notify_friend_request(p_friendship_id UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_row RECORD; v_name TEXT;
BEGIN
  SELECT * INTO v_row FROM public.friendships
    WHERE id = p_friendship_id AND requester_id = auth.uid() AND status = 'pending';
  IF NOT FOUND THEN RETURN; END IF;

  SELECT COALESCE(NULLIF(trim(first_name || ' ' || last_name), ''), email) INTO v_name
    FROM public.users WHERE id = auth.uid();

  INSERT INTO public.activity_notifications (user_id, type, title, body, link_view)
  VALUES (v_row.receiver_id, 'friend_request', 'New friend request',
          COALESCE(v_name, 'Someone') || ' wants to connect with you', 'friends');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.notify_friend_request(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notify_friend_request(UUID) TO authenticated;

-- ============================================================
-- notify_referral_used(p_referral_id)  —  SECURITY DEFINER
-- ============================================================
-- Notifies a referral code's owner that someone marked it used. Fires only
-- for a real, existing referral code that isn't the caller's own.
CREATE OR REPLACE FUNCTION public.notify_referral_used(p_referral_id UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_row RECORD;
BEGIN
  SELECT * INTO v_row FROM public.referral_codes
    WHERE id = p_referral_id AND user_id IS NOT NULL AND user_id <> auth.uid();
  IF NOT FOUND THEN RETURN; END IF;

  INSERT INTO public.activity_notifications (user_id, type, title, body, link_view)
  VALUES (v_row.user_id, 'referral_used', 'Referral code used',
          'Someone marked your ' || v_row.brand || ' referral code as used', 'referrals');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.notify_referral_used(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notify_referral_used(UUID) TO authenticated;

-- ============================================================
-- notify_listing_interest(p_listing_id)  —  SECURITY DEFINER
-- ============================================================
-- Notifies a marketplace listing's seller that someone tapped "I'm
-- interested". Fires only for a real, available listing that isn't the
-- caller's own.
CREATE OR REPLACE FUNCTION public.notify_listing_interest(p_listing_id UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_seller_id UUID; v_brand TEXT; v_name TEXT;
BEGIN
  SELECT ml.seller_id, v.brand INTO v_seller_id, v_brand
    FROM public.marketplace_listings ml
    JOIN public.vouchers v ON v.id = ml.voucher_id
    WHERE ml.id = p_listing_id AND ml.seller_id <> auth.uid() AND ml.status = 'available';
  IF NOT FOUND THEN RETURN; END IF;

  SELECT COALESCE(NULLIF(trim(first_name || ' ' || last_name), ''), email) INTO v_name
    FROM public.users WHERE id = auth.uid();

  INSERT INTO public.activity_notifications (user_id, type, title, body, link_view, link_id)
  VALUES (v_seller_id, 'listing_interest', 'Someone is interested!',
          COALESCE(v_name, 'A buyer') || ' is interested in your ' || v_brand || ' listing',
          'listing-detail', p_listing_id::text);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.notify_listing_interest(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notify_listing_interest(UUID) TO authenticated;

-- ============================================================
-- public.brands_guard_update()  —  BEFORE UPDATE trigger on brands
-- ============================================================
-- RLS on brands is row-level only, so it can't restrict which COLUMNS
-- change on a row the caller doesn't own. This trigger enforces the
-- actual boundary: only `category` (any time) and `description` (once,
-- from NULL) may differ from the existing row.
CREATE OR REPLACE FUNCTION public.brands_guard_update()
RETURNS trigger
LANGUAGE plpgsql SET search_path = public
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

CREATE TRIGGER brands_guard_update_trg
BEFORE UPDATE ON public.brands
FOR EACH ROW EXECUTE FUNCTION public.brands_guard_update();

COMMENT ON TRIGGER brands_guard_update_trg ON public.brands IS
  'Column-level guard for brands_update RLS policy (USING(true)/WITH CHECK(true)): only category and a one-time description backfill may change on a row the caller does not own.';

-- ============================================================
-- public.sync_referral_used_count()  —  keeps referral_codes.used_count
-- in sync with referral_code_uses row count
-- ============================================================
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

REVOKE EXECUTE ON FUNCTION public.sync_referral_used_count() FROM PUBLIC;

CREATE TRIGGER referral_code_uses_sync
AFTER INSERT OR DELETE ON public.referral_code_uses
FOR EACH ROW EXECUTE FUNCTION public.sync_referral_used_count();

-- ============================================================
-- public.handle_new_user()  —  provisions public.users on signup
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
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
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- Not app schema — informational only, do not re-create.
-- public.rls_auto_enable() is a Supabase-platform-generated event trigger
-- function (event trigger "ensure_rls", fires on every CREATE TABLE in the
-- public schema) that auto-enables RLS on any newly created table as a
-- safety net. It predates this project's own migrations and isn't
-- authored by this codebase — every ALTER TABLE ... ENABLE ROW LEVEL
-- SECURITY statement above is technically redundant with it, but kept
-- explicit anyway so this file doesn't silently depend on project-level
-- config that isn't tracked in version control.
-- ============================================================

-- ============================================================
-- storage: voucher-photos bucket (private; one folder per user id)
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'voucher-photos', 'voucher-photos', false, 10485760,
  ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Access is granted either by folder ownership (first path segment =
-- auth.uid()) or, for files that moved on gift-claim ownership transfer,
-- by matching a voucher_files.file_path or vouchers.barcode_path row the
-- caller now owns.
CREATE POLICY "voucher_photos_select" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'voucher-photos' AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (SELECT 1 FROM public.voucher_files vf WHERE vf.file_path = objects.name AND vf.user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.vouchers v WHERE v.barcode_path = objects.name AND v.user_id = auth.uid())
    )
  );

CREATE POLICY "voucher_photos_insert" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'voucher-photos' AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "voucher_photos_update" ON storage.objects
  FOR UPDATE TO authenticated USING (
    bucket_id = 'voucher-photos' AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (SELECT 1 FROM public.voucher_files vf WHERE vf.file_path = objects.name AND vf.user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.vouchers v WHERE v.barcode_path = objects.name AND v.user_id = auth.uid())
    )
  );

CREATE POLICY "voucher_photos_delete" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'voucher-photos' AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (SELECT 1 FROM public.voucher_files vf WHERE vf.file_path = objects.name AND vf.user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.vouchers v WHERE v.barcode_path = objects.name AND v.user_id = auth.uid())
    )
  );

-- ============================================================
-- pg_cron: daily push notification dispatch
-- ============================================================
-- Every 5 minutes, invokes the send-daily-push edge function with the
-- service_role key (pulled from Vault) so it can bypass RLS to scan all
-- users' upcoming reminders.
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
);
