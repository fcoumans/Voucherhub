import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'https://esm.sh/web-push@3';

const SUPABASE_URL        = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PUBLIC_KEY    = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE_KEY   = Deno.env.get('VAPID_PRIVATE_KEY')!;

webpush.setVapidDetails('mailto:fien.coumans@gmail.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const THRESHOLDS = [30, 7, 2, 1];

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const expiry = new Date(dateStr);
  expiry.setUTCHours(0, 0, 0, 0);
  return Math.round((expiry.getTime() - today.getTime()) / 86_400_000);
}

function buildMessage(brand: string, days: number): { title: string; body: string } {
  if (days === 1) return { title: 'VoucherWise', body: `Your ${brand} voucher expires tomorrow!` };
  if (days === 2) return { title: 'VoucherWise', body: `Your ${brand} voucher expires in 2 days.` };
  if (days === 7) return { title: 'VoucherWise', body: `Your ${brand} voucher expires in 1 week.` };
  return { title: 'VoucherWise', body: `Your ${brand} voucher expires in 1 month.` };
}

Deno.serve(async (req) => {
  const auth = req.headers.get('Authorization');
  if (auth !== `Bearer ${SUPABASE_SERVICE_KEY}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { data: vouchers, error: vErr } = await supabase
    .from('vouchers')
    .select('id, user_id, brand, expiry_date')
    .eq('status', 'active')
    .not('expiry_date', 'is', null);

  if (vErr) return new Response(JSON.stringify({ error: vErr.message }), { status: 500 });

  let sent = 0;
  let skipped = 0;

  for (const voucher of (vouchers ?? [])) {
    const days = daysUntil(voucher.expiry_date);
    if (!THRESHOLDS.includes(days)) { skipped++; continue; }

    const { data: logged } = await supabase
      .from('push_notification_log')
      .select('id')
      .eq('user_id', voucher.user_id)
      .eq('voucher_id', voucher.id)
      .eq('days_before', days)
      .maybeSingle();

    if (logged) { skipped++; continue; }

    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('user_id', voucher.user_id);

    if (!subs?.length) { skipped++; continue; }

    const { title, body } = buildMessage(voucher.brand, days);
    const payload = JSON.stringify({ title, body, url: '/' });

    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
        sent++;
      } catch (err: any) {
        console.error('push error:', err.statusCode, sub.endpoint);
        if (err.statusCode === 404 || err.statusCode === 410) {
          await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
        }
      }
    }

    await supabase.from('push_notification_log').insert({
      user_id:    voucher.user_id,
      voucher_id: voucher.id,
      days_before: days,
    });
  }

  return new Response(JSON.stringify({ sent, skipped }), { status: 200 });
});
