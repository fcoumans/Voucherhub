import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'https://esm.sh/web-push@3';

const SUPABASE_URL        = Deno.env.get('SUPABASE_URL')!;
// SUPABASE_SERVICE_ROLE_KEY is a reserved, platform-managed secret name that
// can't be overridden from the dashboard, and on this project now resolves
// to the new sb_secret_... key format, which doesn't carry service_role
// (RLS-bypassing) privileges the way the legacy JWT does. Using our own
// secret name instead, holding that legacy service_role JWT explicitly.
const SUPABASE_SERVICE_KEY = Deno.env.get('SERVICE_ROLE_KEY')!;
const VAPID_PUBLIC_KEY    = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE_KEY   = Deno.env.get('VAPID_PRIVATE_KEY')!;

webpush.setVapidDetails('mailto:fien.coumans@gmail.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// A month, a week, and a day before expiry.
const THRESHOLDS = [30, 7, 1];

// Reminder date/time is stored exactly as picked in the user's own local
// wall-clock (from a <input type="datetime-local">, which carries no
// timezone info) — so "now" must be read in that same timezone, not UTC,
// or every comparison is off by the local UTC offset.
const APP_TIMEZONE = 'Europe/Brussels';

function todayLocalDateStr(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function nowLocalHHMM(): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: APP_TIMEZONE, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
}

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const expiry = new Date(dateStr);
  expiry.setUTCHours(0, 0, 0, 0);
  return Math.round((expiry.getTime() - today.getTime()) / 86_400_000);
}

function buildMessage(brand: string, days: number): { title: string; body: string } {
  if (days === 1) return { title: 'VoucherWise', body: `Your ${brand} voucher expires tomorrow!` };
  if (days === 7) return { title: 'VoucherWise', body: `Your ${brand} voucher expires in 1 week.` };
  return { title: 'VoucherWise', body: `Your ${brand} voucher expires in 1 month.` };
}

async function sendPush(userId: string, payload: string): Promise<number> {
  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', userId);

  let count = 0;
  for (const sub of (subs ?? [])) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      );
      count++;
    } catch (err: any) {
      console.error('push error:', err.statusCode, sub.endpoint);
      if (err.statusCode === 404 || err.statusCode === 410) {
        await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
      }
    }
  }
  return count;
}

Deno.serve(async (req) => {
  const auth = req.headers.get('Authorization');
  if (auth !== `Bearer ${SUPABASE_SERVICE_KEY}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const todayStr = todayLocalDateStr();
  let sent = 0;
  let skipped = 0;

  // --- Expiry reminders ---
  const { data: vouchers, error: vErr } = await supabase
    .from('vouchers')
    .select('id, user_id, brand, expiration_date')
    .eq('status', 'active')
    .not('expiration_date', 'is', null);

  if (vErr) return new Response(JSON.stringify({ error: vErr.message }), { status: 500 });

  for (const voucher of (vouchers ?? [])) {
    const days = daysUntil(voucher.expiration_date);
    if (!THRESHOLDS.includes(days)) { skipped++; continue; }

    const { data: logged } = await supabase
      .from('push_notification_log')
      .select('id')
      .eq('user_id', voucher.user_id)
      .eq('voucher_id', voucher.id)
      .eq('days_before', days)
      .maybeSingle();

    if (logged) { skipped++; continue; }

    const { title, body } = buildMessage(voucher.brand, days);
    const payload = JSON.stringify({ title, body, url: '/' });
    const n = await sendPush(voucher.user_id, payload);
    sent += n;

    await supabase.from('push_notification_log').insert({
      user_id:    voucher.user_id,
      voucher_id: voucher.id,
      days_before: days,
    });
  }

  // --- Manual reminders ---
  const { data: manualReminders, error: rErr } = await supabase
    .from('notifications')
    .select('id, user_id, voucher_id, reminder_time')
    .eq('notification_type', 'reminder')
    .eq('sent', false)
    .lte('reminder_date', todayStr);

  if (rErr) console.error('fetchReminders error:', rErr.message);

  for (const r of (manualReminders ?? [])) {
    // If a specific time was set, only send once we've passed that local hour.
    if (r.reminder_time && r.reminder_time.slice(0, 5) > nowLocalHHMM()) { skipped++; continue; }

    const { data: voucher } = await supabase
      .from('vouchers')
      .select('brand')
      .eq('id', r.voucher_id)
      .maybeSingle();

    const brand = voucher?.brand || 'voucher';
    const payload = JSON.stringify({
      title: 'VoucherWise',
      body: `Reminder: your ${brand} voucher`,
      url: `/`,
    });

    const n = await sendPush(r.user_id, payload);
    sent += n;

    await supabase
      .from('notifications')
      .update({ sent: true, sent_at: new Date().toISOString() })
      .eq('id', r.id);
  }

  return new Response(JSON.stringify({ sent, skipped, manualProcessed: manualReminders?.length ?? 0 }), { status: 200 });
});
