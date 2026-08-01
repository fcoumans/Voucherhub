// Session lifecycle: sign up, log in, log out, and the activity-touch
// heartbeat used to keep last_active_at fresh.
//
// `go`/`render` (router) still live in app.js at this point in the module
// split — imported from there for now, repointed once core/router.js exists.
import { supabase } from '../../lib/supabase.js';
import { state } from '../../core/state.js';
import { toTitleCase } from '../../core/dom.js';
import { go, render } from '../../core/router.js';
import { tryClaimPendingGift } from '../social/gifting.js';

export function mapUser(supabaseUser) {
  const meta = supabaseUser.user_metadata || {};
  let firstName = meta.first_name || '';
  let lastName  = meta.last_name || '';
  if (!firstName && meta.name) {
    // Accounts created before the first_name/last_name split only have a
    // single "name" in auth metadata — split it so the greeting still
    // shows a first name instead of falling through to the email prefix.
    const parts = String(meta.name).trim().split(/\s+/);
    firstName = parts[0] || '';
    lastName  = parts.slice(1).join(' ');
  }
  return {
    id:        supabaseUser.id,
    firstName, lastName,
    name:      [firstName, lastName].filter(Boolean).join(' ').trim() || supabaseUser.email.split('@')[0],
    email:     supabaseUser.email,
  };
}

// Fire-and-forget: stamps last_active_at whenever a session starts (login,
// signup, or an existing session resuming on app load). Never blocks the
// auth flow on this — a failure here shouldn't stop the user from logging in.
let _lastActivityTouchAt = 0;
export function touchLastActive(userId) {
  _lastActivityTouchAt = Date.now();
  supabase.from('users').update({ last_active_at: new Date().toISOString() }).eq('id', userId)
    .then(({ error }) => { if (error) console.error('touchLastActive error:', error); });
}

// The Supabase session itself can stay signed in for weeks, so a fresh
// login is a poor proxy for "still using the app" — this keeps
// last_active_at fresh on real interaction (adding/editing a voucher,
// copying a code, accepting a friend request, ...) instead. Called from the
// global click/submit handlers; throttled so a burst of clicks doesn't spam
// the DB with writes.
const ACTIVITY_TOUCH_INTERVAL_MS = 5 * 60 * 1000;
export function markActivity() {
  if (!state.currentUser) return;
  if (Date.now() - _lastActivityTouchAt < ACTIVITY_TOUCH_INTERVAL_MS) return;
  touchLastActive(state.currentUser.id);
}

export async function login(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return error.message;
  state.currentUser = mapUser(data.user);
  touchLastActive(data.user.id);
  await tryClaimPendingGift();
  go('home');
  return null;
}

export async function register(firstName, lastName, email, password) {
  if (password.length < 8) return 'Password must be at least 8 characters.';
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { first_name: toTitleCase(firstName), last_name: toTitleCase(lastName) },
      emailRedirectTo: `${window.location.origin}${import.meta.env.BASE_URL}`,
    },
  });
  if (error) return error.message;
  // Supabase returns no error but empty identities when email is already registered
  if (data.user && (!data.user.identities || data.user.identities.length === 0)) {
    return 'This email address is already registered. Please log in instead.';
  }
  // Email confirmation required — session is null until user clicks the link
  if (!data.session) {
    state.view = 'verify-email';
    state.params = { email };
    render();
    return null;
  }
  state.currentUser = mapUser(data.user);
  await tryClaimPendingGift();
  go('home');
  return null;
}

export async function logout() {
  await supabase.auth.signOut();
  // Full reload rather than resetting individual state fields — this is a
  // long-lived in-memory `state` object with many fields (caches, lists,
  // maps), and a partial reset here has already drifted out of sync with
  // it once (new fields keep getting added elsewhere without updating this
  // list). A stale reset risks a second account, signing in on the same
  // tab/device, briefly rendering with the previous user's leftover data.
  // A reload guarantees a clean slate every time. Note: location.reload(),
  // not location.href = BASE_URL — assigning href to the URL the page is
  // already at is a no-op in browsers and won't actually navigate.
  window.location.reload();
}
