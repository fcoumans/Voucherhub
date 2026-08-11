-- Onboarding: personalization quiz + welcome-gift flow.
-- interests: category names (subset of core/state.js CATEGORIES) the user
-- picked on the post-signup "what are you into?" screen — drives which
-- welcome-gift voucher onboarding grants and, later, can drive
-- personalized Discover/Marketplace surfacing. Empty array = skipped.
-- onboarding_completed_at: set the moment the user finishes or skips the
-- interests step, so a page reload / second device never re-shows it.
ALTER TABLE public.users
  ADD COLUMN interests jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN onboarding_completed_at TIMESTAMPTZ;
