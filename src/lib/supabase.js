import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// PKCE instead of the (default) implicit flow: email links (signup
// confirm, password reset) carry a short-lived exchange code instead of
// the access token itself, so the token never sits in the URL — a link
// scanner or prefetcher visiting the URL can't extract a live session
// from it the way it could with a token in the fragment.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { flowType: 'pkce' },
});
