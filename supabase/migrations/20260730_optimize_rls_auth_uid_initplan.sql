-- Performance advisor: 44 policies re-evaluate auth.uid() per row instead of
-- once per query. Wrapping the call as (select auth.uid()) lets Postgres
-- cache it as an InitPlan -- same boolean result every row (auth.uid() is
-- STABLE and argument-free, so it can't vary within one statement), just
-- evaluated once instead of per row. ALTER POLICY only changes USING/WITH
-- CHECK text -- role list and policy identity are untouched.

-- users
ALTER POLICY "Users can view their own profile" ON public.users
  USING ((select auth.uid()) = id);
ALTER POLICY "Users can update their own profile" ON public.users
  USING ((select auth.uid()) = id);

-- vouchers
ALTER POLICY "Users can view own vouchers" ON public.vouchers
  USING ((select auth.uid()) = user_id);
ALTER POLICY "Users can create own vouchers" ON public.vouchers
  WITH CHECK ((select auth.uid()) = user_id);
ALTER POLICY "Users can update own vouchers" ON public.vouchers
  USING ((select auth.uid()) = user_id);
ALTER POLICY "Users can delete own vouchers" ON public.vouchers
  USING ((select auth.uid()) = user_id);

-- marketplace_listings
ALTER POLICY "Users can manage own listings" ON public.marketplace_listings
  USING ((select auth.uid()) = seller_id)
  WITH CHECK ((select auth.uid()) = seller_id);
ALTER POLICY "Anyone can view public available listings" ON public.marketplace_listings
  USING (
    status = 'available'
    AND (
      visibility = 'public'
      OR (
        visibility = 'friends_only'
        AND seller_id IN (SELECT user_id FROM public.trusted_network_ids((select auth.uid())))
      )
    )
  );

-- friendships
ALTER POLICY "Users can view friendships involving them" ON public.friendships
  USING ((select auth.uid()) = requester_id OR (select auth.uid()) = receiver_id);
ALTER POLICY "Users can read their friendships" ON public.friendships
  USING ((select auth.uid()) = requester_id OR (select auth.uid()) = receiver_id);
ALTER POLICY "Users can create friend requests" ON public.friendships
  WITH CHECK ((select auth.uid()) = requester_id);
ALTER POLICY "Users can create friendship requests" ON public.friendships
  WITH CHECK ((select auth.uid()) = requester_id);
ALTER POLICY "Users can update friendships involving them" ON public.friendships
  USING ((select auth.uid()) = requester_id OR (select auth.uid()) = receiver_id);
ALTER POLICY "Users can update their friendships" ON public.friendships
  USING ((select auth.uid()) = requester_id OR (select auth.uid()) = receiver_id)
  WITH CHECK ((select auth.uid()) = requester_id OR (select auth.uid()) = receiver_id);
ALTER POLICY "Users can delete their friendships" ON public.friendships
  USING ((select auth.uid()) = requester_id OR (select auth.uid()) = receiver_id);

-- notifications
ALTER POLICY "Users can view own notifications" ON public.notifications
  USING ((select auth.uid()) = user_id);
ALTER POLICY "Users can read own notifications" ON public.notifications
  USING ((select auth.uid()) = user_id);
ALTER POLICY "Users can create own notifications" ON public.notifications
  WITH CHECK ((select auth.uid()) = user_id);
ALTER POLICY "Users can update own notifications" ON public.notifications
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);
ALTER POLICY "Users can delete own notifications" ON public.notifications
  USING ((select auth.uid()) = user_id);

-- referral_codes
ALTER POLICY "Users can view own referral codes" ON public.referral_codes
  USING ((select auth.uid()) = user_id);
ALTER POLICY "Users can read referral codes" ON public.referral_codes
  USING (user_id = (select auth.uid()) OR visibility = 'public');
ALTER POLICY "Users can create own referral codes" ON public.referral_codes
  WITH CHECK (user_id = (select auth.uid()));
ALTER POLICY "Users can update own referral codes" ON public.referral_codes
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));
ALTER POLICY "Users can delete own referral codes" ON public.referral_codes
  USING (user_id = (select auth.uid()));
ALTER POLICY "referrals_select" ON public.referral_codes
  USING (
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

-- push_notification_log
ALTER POLICY "users read own push log" ON public.push_notification_log
  USING ((select auth.uid()) = user_id);

-- push_subscriptions
ALTER POLICY "push_sub select" ON public.push_subscriptions
  USING ((select auth.uid()) = user_id);
ALTER POLICY "push_sub insert" ON public.push_subscriptions
  WITH CHECK ((select auth.uid()) = user_id);
ALTER POLICY "push_sub update" ON public.push_subscriptions
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);
ALTER POLICY "push_sub delete" ON public.push_subscriptions
  USING ((select auth.uid()) = user_id);

-- voucher_files
ALTER POLICY "voucher_files_select" ON public.voucher_files
  USING (user_id = (select auth.uid()));
ALTER POLICY "voucher_files_insert" ON public.voucher_files
  WITH CHECK (user_id = (select auth.uid()));
ALTER POLICY "voucher_files_update" ON public.voucher_files
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));
ALTER POLICY "voucher_files_delete" ON public.voucher_files
  USING (user_id = (select auth.uid()));

-- voucher_extraction_log
ALTER POLICY "extraction_log_select" ON public.voucher_extraction_log
  USING (user_id = (select auth.uid()));
ALTER POLICY "extraction_log_insert" ON public.voucher_extraction_log
  WITH CHECK (user_id = (select auth.uid()));

-- voucher_gifts
ALTER POLICY "voucher_gifts_select" ON public.voucher_gifts
  USING (sender_id = (select auth.uid()));
ALTER POLICY "voucher_gifts_insert" ON public.voucher_gifts
  WITH CHECK (
    sender_id = (select auth.uid())
    AND EXISTS (SELECT 1 FROM public.vouchers v WHERE v.id = voucher_id AND v.user_id = (select auth.uid()))
  );
ALTER POLICY "voucher_gifts_update" ON public.voucher_gifts
  USING (sender_id = (select auth.uid()))
  WITH CHECK (sender_id = (select auth.uid()));

-- brands
ALTER POLICY "brands_insert" ON public.brands
  WITH CHECK (created_by = (select auth.uid()));

-- referral_code_uses
ALTER POLICY "referral_code_uses_select" ON public.referral_code_uses
  USING (user_id = (select auth.uid()));
ALTER POLICY "referral_code_uses_insert" ON public.referral_code_uses
  WITH CHECK (
    user_id = (select auth.uid())
    AND user_id <> (SELECT rc.user_id FROM public.referral_codes rc WHERE rc.id = referral_id)
  );
ALTER POLICY "referral_code_uses_delete" ON public.referral_code_uses
  USING (user_id = (select auth.uid()));
