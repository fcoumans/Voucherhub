// Web Push subscription management (browser Notification permission +
// service worker pushManager + the push_subscriptions table), and the
// Profile-page toggle's status label. The toggle button itself is rendered
// in app.js's Profile view for now; this module owns the behavior behind it.
import { supabase } from '../../lib/supabase.js';
import { state } from '../../core/state.js';
import { showToast } from '../../core/toast.js';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

export async function subscribeToPush() {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    showToast('Push notifications not supported on this device');
    return false;
  }
  if (!VAPID_PUBLIC_KEY) { console.error('VAPID_PUBLIC_KEY not set'); return false; }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    showToast('Notification permission denied');
    return false;
  }

  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }
    const { endpoint, keys } = sub.toJSON();
    const { error } = await supabase.from('push_subscriptions').upsert({
      user_id:  state.currentUser.id,
      endpoint,
      p256dh:   keys.p256dh,
      auth:     keys.auth,
    }, { onConflict: 'endpoint' });
    if (error) { console.error('push subscription save error:', error); showToast('Error enabling notifications'); return false; }
    showToast('Notifications enabled!');
    return true;
  } catch (err) {
    console.error('subscribeToPush error:', err);
    showToast('Could not enable notifications');
    return false;
  }
}

export async function unsubscribeFromPush() {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
      await sub.unsubscribe();
    }
    showToast('Notifications disabled');
  } catch (err) {
    console.error('unsubscribeFromPush error:', err);
  }
}

export async function getPushStatus() {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return sub ? 'subscribed' : 'unsubscribed';
  } catch {
    return 'unsubscribed';
  }
}

export async function updatePushStatusLabel() {
  const label  = document.getElementById('push-status-label');
  const track  = document.getElementById('push-toggle-track');
  if (!label) return;
  const status = await getPushStatus();
  if (status === 'unsupported') {
    label.textContent = 'Not supported on this device';
    if (track) track.classList.remove('on');
  } else if (status === 'denied') {
    label.textContent = 'Blocked in system settings';
    if (track) track.classList.remove('on');
  } else if (status === 'subscribed') {
    label.textContent = 'Reminders are enabled';
    if (track) track.classList.add('on');
  } else {
    label.textContent = 'Tap to enable reminders';
    if (track) track.classList.remove('on');
  }
}
