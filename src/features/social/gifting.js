// Voucher gifting: send a voucher to a friend via a claim link/QR code
// (works even before they have an account), and the claim/reveal flow on
// the receiving end. See claim_voucher_gift RPC and core/router.js init()'s
// ?gift= URL handling. `formatVoucherValue` is wallet's, imported directly
// since the gift-reveal card renders a voucher the same way the wallet does.
import { supabase } from '../../lib/supabase.js';
import { state } from '../../core/state.js';
import { esc } from '../../core/dom.js';
import { showToast } from '../../core/toast.js';
import { icon } from '../../core/ui.js';
import { go } from '../../core/router.js';
import { formatVoucherValue } from '../wallet/vouchers.js';
import { fetchFriends } from './friends.js';

/* ============================================================
   FETCH
   ============================================================ */
export async function fetchPendingGifts() {
  if (!state.currentUser) return;
  const { data, error } = await supabase
    .from('voucher_gifts')
    .select('id, voucher_id, created_at, expires_at')
    .eq('sender_id', state.currentUser.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  if (error) { console.error('fetchPendingGifts error:', error); return; }
  state.pendingGifts = data || [];
}

/* ============================================================
   SEND
   ============================================================ */
export async function sendVoucherGift(id) {
  const v = state.vouchers.find(x => x.id === id);
  if (!v) return;
  const { data, error } = await supabase
    .from('voucher_gifts')
    .insert({ voucher_id: id, sender_id: state.currentUser.id })
    .select('id')
    .single();
  if (error) { console.error('sendVoucherGift error:', error); showToast('Error creating gift link'); return; }
  showGiftShareScreen(data.id, v);
}

export async function cancelVoucherGift(giftId) {
  const { error } = await supabase.from('voucher_gifts').update({ status: 'cancelled' }).eq('id', giftId);
  if (error) { console.error('cancelVoucherGift error:', error); showToast('Error cancelling gift'); return; }
  showToast('Gift cancelled. Voucher is back in your wallet');
  go('pending-gifts');
}

// Shows the QR code + shareable link for a gift. Reused both right after
// creating a gift and from the Pending Gifts list ("Link" button).
export async function showGiftShareScreen(giftId, voucher) {
  const claimUrl = `${window.location.origin}${import.meta.env.BASE_URL}?gift=${giftId}`;
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `
  <div class="dialog">
    <h3>Send ${esc(voucher.brand)} to a friend</h3>
    <p>Have them scan this code, or share the link. Anyone with this link can claim it, so only share it with your friend.</p>
    <div class="gift-qr-wrap"><img id="gift-qr-img" alt="QR code to claim this voucher"></div>
    <div class="gift-link-row">
      <input type="text" readonly value="${esc(claimUrl)}" id="gift-link-input">
      <button type="button" class="btn btn-secondary btn-sm" id="gift-copy-btn">${icon.copy} Copy</button>
    </div>
    <div class="dialog-actions" style="margin-top:16px">
      ${typeof navigator.share === 'function' ? `<button type="button" class="btn btn-primary" id="gift-share-btn">Share</button>` : ''}
      <button type="button" class="btn btn-ghost" id="gift-done-btn">Done</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);

  const closeAndGo = () => { overlay.remove(); go('pending-gifts'); };
  overlay.querySelector('#gift-done-btn').addEventListener('click', closeAndGo);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeAndGo(); });

  overlay.querySelector('#gift-copy-btn').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(claimUrl);
      showToast('Link copied');
    } catch {
      showToast('Could not copy link');
    }
  });

  const shareBtn = overlay.querySelector('#gift-share-btn');
  if (shareBtn) {
    shareBtn.addEventListener('click', async () => {
      try {
        await navigator.share({ title: 'A gift voucher for you', text: `I'm sending you a ${voucher.brand} voucher!`, url: claimUrl });
      } catch {
        // user cancelled the share sheet — not an error
      }
    });
  }

  try {
    const qrModule = await import('qrcode');
    const QRCode = qrModule.default || qrModule;
    const dataUrl = await QRCode.toDataURL(claimUrl, { margin: 1, width: 240 });
    const img = document.getElementById('gift-qr-img');
    if (img) img.src = dataUrl;
  } catch (err) {
    console.error('gift QR generation error:', err);
  }
}

/* ============================================================
   CLAIM (recipient side — see app.js init()'s ?gift= URL handling)
   ============================================================ */
// Gift box opens -> confetti bursts -> the voucher card is revealed. Resolves
// once the user dismisses it, so the caller's normal fetchVouchers()/render()
// flow only continues afterward — by the time it's gone, the voucher is
// already sitting in the wallet like any other.
function showGiftRevealAnimation(voucher) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'gift-reveal-overlay';
    overlay.innerHTML = `
      <div class="gift-reveal-stage">
        <div class="confetti-layer" id="gift-confetti"></div>
        <div class="gift-box" id="gift-reveal-box">
          <div class="gift-box-lid"><div class="gift-box-bow"></div></div>
          <div class="gift-box-base"><div class="gift-box-ribbon"></div></div>
        </div>
        <div class="gift-reveal-card" id="gift-reveal-card">
          <div class="gift-reveal-card-brand">${esc(voucher.brand)}</div>
          <div class="gift-reveal-card-value">${formatVoucherValue(voucher, voucher.value, false)}</div>
        </div>
      </div>
      ${voucher.giftMessage || voucher.giftSender ? `
      <div class="gift-note-display gift-reveal-note">
        <div class="gift-note-display-icon">💌</div>
        ${voucher.giftMessage ? `<p class="gift-note-display-message">${esc(voucher.giftMessage)}</p>` : ''}
        ${voucher.giftSender ? `<p class="gift-note-display-sender">From ${esc(voucher.giftSender)}</p>` : ''}
      </div>
      ` : ''}
      <h3 class="gift-reveal-caption">You received a gift!</h3>
      <p class="gift-reveal-subcaption">${esc(voucher.brand)} is now in your wallet.</p>
      <button type="button" class="btn btn-primary gift-reveal-continue" id="gift-reveal-continue" style="visibility:hidden">Awesome!</button>
    `;
    document.body.appendChild(overlay);

    const confettiLayer = overlay.querySelector('#gift-confetti');
    const colors = ['#13B5A2', '#F98513', '#2BD4BE', '#D6710A', '#FFFFFF'];
    for (let i = 0; i < 44; i++) {
      const piece = document.createElement('div');
      piece.className = 'confetti-piece';
      const angle = Math.random() * Math.PI * 2;
      const distance = 90 + Math.random() * 160;
      piece.style.setProperty('--x', `${Math.cos(angle) * distance}px`);
      piece.style.setProperty('--y', `${Math.sin(angle) * distance - 40}px`);
      piece.style.setProperty('--rot', `${Math.random() * 720 - 360}deg`);
      piece.style.setProperty('--delay', `${Math.random() * 0.15}s`);
      piece.style.background = colors[i % colors.length];
      confettiLayer.appendChild(piece);
    }

    const boxEl  = overlay.querySelector('#gift-reveal-box');
    const cardEl = overlay.querySelector('#gift-reveal-card');
    const continueBtn = overlay.querySelector('#gift-reveal-continue');

    setTimeout(() => boxEl.classList.add('open'), 450);
    setTimeout(() => confettiLayer.classList.add('burst'), 500);
    setTimeout(() => cardEl.classList.add('revealed'), 850);
    setTimeout(() => { continueBtn.style.visibility = ''; }, 1600);

    const finish = () => { overlay.remove(); resolve(); };
    continueBtn.addEventListener('click', finish);
    overlay.addEventListener('click', e => { if (e.target === overlay) finish(); });
  });
}

// Called on app load (and right after login/signup) if a ?gift= link left a
// pendingGiftId in localStorage — before there's necessarily a session to
// claim it with, which is why app.js's init() only calls this once signed in.
export async function tryClaimPendingGift() {
  const giftId = localStorage.getItem('pendingGiftId');
  if (!giftId || !state.currentUser) return;
  localStorage.removeItem('pendingGiftId'); // clear regardless of outcome — avoid retry loops on a dead link
  const { data: voucherId, error } = await supabase.rpc('claim_voucher_gift', { p_gift_id: giftId });
  if (error) {
    console.error('claim_voucher_gift error:', error);
    setTimeout(() => showToast(error.message || 'This gift link is no longer valid'), 300);
    return;
  }
  await fetchFriends(); // claiming auto-friends sender and recipient server-side
  const { data: row, error: fetchErr } = await supabase
    .from('vouchers')
    .select('brand, amount, currency, value_description, gift_message, gift_sender')
    .eq('id', voucherId)
    .maybeSingle();
  if (fetchErr || !row) {
    setTimeout(() => showToast('🎁 You received a voucher from a friend!'), 300);
    return;
  }
  await showGiftRevealAnimation({
    brand:            row.brand,
    value:            row.amount,
    currency:         row.currency,
    valueDescription: row.value_description,
    giftMessage:      row.gift_message,
    giftSender:       row.gift_sender,
  });
}
