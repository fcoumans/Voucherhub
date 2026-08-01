// Voucher expiry reminders — stored in the `notifications` table. Rendered
// inline on the wallet's voucher-detail page (features/wallet/views.js),
// not a standalone view of their own.
//
// `go`/`render` (router) still live in app.js at this point in the module
// split — imported from there for now, repointed once core/router.js exists.
import { supabase } from '../../lib/supabase.js';
import { state } from '../../core/state.js';
import { showToast } from '../../core/toast.js';
import { go, render } from '../../core/router.js';

export const nowDateTimeLocalStr = () => {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const defaultReminderDateTimeStr = () => {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  // Default to 9AM today, or 9AM tomorrow if past 9AM
  if (d.getHours() >= 9) d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T09:00`;
};

/* ============================================================
   REMINDER FIELD MAPPING (Supabase ↔ frontend)
   ============================================================ */
export function mapReminder(row) {
  const voucher = state.vouchers.find(v => v.id === row.voucher_id);
  return {
    id:           row.id,
    userId:       row.user_id,
    voucherId:    row.voucher_id,
    brand:        voucher?.brand || '',
    reminderDate: row.reminder_date,
    reminderTime: row.reminder_time ? row.reminder_time.slice(0, 5) : null,
    note:         '',
    dismissed:    !!row.dismissed_at,
    createdAt:    row.created_at,
  };
}

/* ============================================================
   FETCH
   ============================================================ */
export async function fetchReminders() {
  if (!state.currentUser) return;
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', state.currentUser.id)
    .order('reminder_date', { ascending: true });
  if (error) { console.error('fetchReminders error:', error); return; }
  state.reminders = (data || []).map(mapReminder);
}

/* ============================================================
   REMINDER ACTIONS
   ============================================================ */
export async function setReminder(voucherId, date, time) {
  const { error } = await supabase.from('notifications').insert({
    user_id:           state.currentUser.id,
    voucher_id:        voucherId,
    notification_type: 'reminder',
    reminder_date:     date,
    reminder_time:     time || null,
    sent:              false,
  });
  if (error) { console.error('setReminder error:', error); showToast('Error setting reminder'); return; }
  showToast('Reminder saved!');
  go('voucher-detail', { id: voucherId });
}

export async function dismissReminder(id) {
  const { error } = await supabase
    .from('notifications')
    .update({ dismissed_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', state.currentUser.id);
  if (error) { console.error('dismissReminder error:', error); showToast('Error dismissing reminder'); return; }
  state.reminders = state.reminders.map(r => r.id === id ? { ...r, dismissed: true } : r);
  render();
}
