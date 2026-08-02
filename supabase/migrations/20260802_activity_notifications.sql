-- General-purpose notification feed (distinct from public.notifications,
-- which stays scoped to user-scheduled voucher reminders). Powers the new
-- in-app Notifications tab and the same events also delivered as push:
-- expiry threshold crossed, friend request received, referral code used,
-- marketplace listing interest.
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
-- SECURITY DEFINER functions below (or the service-role edge function, for
-- expiry pushes), each of which validates the underlying event server-side
-- before writing, the same pattern as claim_voucher_gift.
CREATE POLICY "activity_notifications_select" ON public.activity_notifications
  FOR SELECT TO authenticated USING (user_id = (select auth.uid()));

CREATE POLICY "activity_notifications_update" ON public.activity_notifications
  FOR UPDATE TO authenticated USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));

GRANT SELECT, UPDATE ON public.activity_notifications TO authenticated;

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
