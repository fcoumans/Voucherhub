// Notifications tab feed — public.activity_notifications rows. Distinct
// from reminders.js's public.notifications (user-scheduled voucher
// reminders); this is the general "things that happened" feed: expiry
// pushes, friend requests, referral code uses, marketplace interest.
import { supabase } from '../../lib/supabase.js';
import { state } from '../../core/state.js';
import { render } from '../../core/router.js';

export function mapActivityNotification(row) {
  return {
    id:        row.id,
    type:      row.type,
    title:     row.title,
    body:      row.body,
    linkView:  row.link_view,
    linkId:    row.link_id,
    read:      !!row.read_at,
    createdAt: row.created_at,
  };
}

export async function fetchActivityNotifications() {
  if (!state.currentUser) return;
  const { data, error } = await supabase
    .from('activity_notifications')
    .select('*')
    .eq('user_id', state.currentUser.id)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) { console.error('fetchActivityNotifications error:', error); return; }
  state.activityNotifications = (data || []).map(mapActivityNotification);
}

export async function markActivityNotificationRead(id) {
  const n = state.activityNotifications.find(x => x.id === id);
  if (!n || n.read) return;
  n.read = true;
  render();
  const { error } = await supabase
    .from('activity_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id);
  if (error) console.error('markActivityNotificationRead error:', error);
}

export async function markAllActivityNotificationsRead() {
  const unread = state.activityNotifications.filter(n => !n.read);
  if (unread.length === 0) return;
  unread.forEach(n => { n.read = true; });
  render();
  const { error } = await supabase
    .from('activity_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', state.currentUser.id)
    .is('read_at', null);
  if (error) console.error('markAllActivityNotificationsRead error:', error);
}
