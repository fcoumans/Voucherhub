import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'https://esm.sh/web-push@3';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_EMAIL = 'mailto:fien.coumans@gmail.com';

webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

Deno.serve(async (req) => {
  // Verify the request comes from Supabase cron (or a manual call with the service key)
  const authHeader = req.headers.get('Authorization');
  if (authHeader !== `Bearer ${SUPABASE_SERVICE_KEY}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const today = new Date().toISOString().slice(0, 10);

  // Find due reminders that haven't been sent yet
  const { data: reminders, error: remErr } = await supabase
    .from('notifications')
    .select('id, user_id, voucher_id, reminder_date')
    .eq('notification_type', 'reminder')
    .eq('sent', false)
    .lte('reminder_date', today);

  if (remErr) {
    console.error('fetch reminders error:', remErr);
    return new Response(JSON.stringify({ error: remErr.message }), { status: 500 });
  }

  if (!reminders || reminders.length === 0) {
    return new Response(JSON.stringify({ sent: 0 }), { status: 200 });
  }

  // Get voucher names for better notification text
  const voucherIds = [...new Set(reminders.map(r => r.voucher_id).filter(Boolean))];
  const { data: vouchers } = await supabase
    .from('vouchers')
    .select('id, brand')
    .in('id', voucherIds);
  const voucherMap = Object.fromEntries((vouchers || []).map(v => [v.id, v.brand]));

  let sent = 0;
  let failed = 0;

  for (const reminder of reminders) {
    // Get this user's push subscriptions
    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('user_id', reminder.user_id);

    if (!subs || subs.length === 0) continue;

    const brand = voucherMap[reminder.voucher_id] || 'a voucher';
    const payload = JSON.stringify({
      title: 'VoucherWise Reminder',
      body: `Your ${brand} voucher expires today!`,
      url: '/',
    });

    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
        sent++;
      } catch (err: any) {
        console.error('sendNotification error:', err.statusCode, sub.endpoint);
        // Remove expired/invalid subscriptions
        if (err.statusCode === 404 || err.statusCode === 410) {
          await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
        }
        failed++;
      }
    }

    // Mark reminder as sent
    await supabase.from('notifications').update({ sent: true, sent_at: new Date().toISOString() }).eq('id', reminder.id);
  }

  return new Response(JSON.stringify({ sent, failed }), { status: 200 });
});
