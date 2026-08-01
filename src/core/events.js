// Global event delegation: one click/submit/input/change/focus listener per
// event type on `document`, dispatching by data-action/data-nav/form id.
// This is the app's composition root for user interaction — it necessarily
// imports from every feature, calling into their already-extracted actions;
// a handful of small one-off snippets (password-reset flow, resend-email,
// remove-listing) remain inline here rather than as named feature functions,
// since they're single call sites with no reuse.
import { supabase } from '../lib/supabase.js';
import { state } from './state.js';
import { formData, normalizeAmount } from './dom.js';
import { showToast } from './toast.js';
import { copyText } from './clipboard.js';
import { showConfirm } from './confirm-dialog.js';
import { fetchBrands } from './brands.js';
import { icon, showBrandSuggestions } from './ui.js';
import { go, render } from './router.js';
import { mapUser, markActivity, login, register, logout } from '../features/auth/auth.js';
import { voucherFormState } from '../features/wallet/voucher-form-state.js';
import {
  fetchVouchers, saveVoucher, deleteVoucher, markUsed, markUnused, deductBalance, incrementCopyCount,
  uploadVoucherFile, uploadBarcodeBlob, deleteVoucherFileObject, getVoucherFileUrl,
  resolveMimeType, ALLOWED_FILE_TYPES, fileKind, randomId,
} from '../features/wallet/vouchers.js';
import { maybeAutoDetectBarcode, renderBarcodeGroupNow, showAddVoucherMenu } from '../features/wallet/scanning.js';
import { attachmentTileHtml } from '../features/wallet/views.js';
import { fetchListings, listForSale, unlist } from '../features/marketplace/marketplace.js';
import { fetchFriendIds, fetchPendingRequests, addFriend, acceptFriendRequest, declineFriendRequest, removeFriend } from '../features/social/friends.js';
import { sendVoucherGift, cancelVoucherGift, showGiftShareScreen } from '../features/social/gifting.js';
import { fetchReminders, setReminder, dismissReminder } from '../features/notifications/reminders.js';
import { subscribeToPush, unsubscribeFromPush, getPushStatus, updatePushStatusLabel } from '../features/notifications/push.js';
import { fetchReferrals, saveReferral, updateReferral, deleteReferral, toggleReferralUse } from '../features/referrals/referrals.js';

let _listenersAttached = false;

export function attachListeners() {
  if (_listenersAttached) return;
  _listenersAttached = true;
  document.addEventListener('click',    handleClick,   true);
  document.addEventListener('submit',   handleSubmit,  true);
  document.addEventListener('input',    handleInput,   true);
  document.addEventListener('change',   handleChange,  true);
  document.addEventListener('focusin',  handleFocusIn, true);
  document.addEventListener('focusout', handleFocusOut,true);
}

function handleFocusIn(e) {
  if (e.target.closest('[data-brand-ac]')) showBrandSuggestions(e.target.value);
}

function handleFocusOut(e) {
  if (e.target.closest('[data-brand-ac]')) {
    setTimeout(() => {
      const el = document.getElementById('brand-suggestions');
      if (el) el.style.display = 'none';
    }, 200);
  }
}

function handleClick(e) {
  markActivity();
  const brandOpt = e.target.closest('[data-brand-opt]');
  if (brandOpt) {
    const input = document.querySelector('[data-brand-ac]');
    if (input) input.value = brandOpt.dataset.brandOpt;
    // Auto-fill category select if present and brand has a category
    const catSel = document.getElementById('brand-category');
    if (catSel && brandOpt.dataset.brandCat) {
      const opt = [...catSel.options].find(o => o.value === brandOpt.dataset.brandCat);
      if (opt) catSel.value = brandOpt.dataset.brandCat;
    }
    const el = document.getElementById('brand-suggestions');
    if (el) el.style.display = 'none';
    e.preventDefault();
    return;
  }

  const pwBtn = e.target.closest('[data-pw-id]');
  if (pwBtn) {
    const input = document.getElementById(pwBtn.dataset.pwId);
    if (input) {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      pwBtn.innerHTML = show ? icon.eyeOff : icon.eye;
    }
    return;
  }

  const navEl = e.target.closest('[data-nav]');
  if (navEl) {
    e.preventDefault();
    const view = navEl.dataset.nav;
    const params = {};
    if (navEl.dataset.id) params.id = navEl.dataset.id;
    if (navEl.dataset.tab) {
      state.view = view;
      state.params = { tab: navEl.dataset.tab };
      render();
      return;
    }
    if (navEl.dataset.marketplaceTabInit) state.marketplaceTab = navEl.dataset.marketplaceTabInit;
    if (navEl.dataset.referralTabInit)    state.referralTab    = navEl.dataset.referralTabInit;
    go(view, params);
    return;
  }

  const chipEl = e.target.closest('[data-filter]');
  if (chipEl) { state.activeFilter = chipEl.dataset.filter; render(); return; }

  const mktTab = e.target.closest('[data-marketplace-tab]');
  if (mktTab) { state.marketplaceTab = mktTab.dataset.marketplaceTab; render(); return; }

  const refTab = e.target.closest('[data-referral-tab]');
  if (refTab) { state.referralTab = refTab.dataset.referralTab; render(); return; }

  const refCat = e.target.closest('[data-referral-cat]');
  if (refCat) { state.referralCategoryFilter = refCat.dataset.referralCat; render(); return; }

  const refBrand = e.target.closest('[data-referral-brand]');
  if (refBrand) { state.referralBrandFilter = refBrand.dataset.referralBrand; render(); return; }


  const actionEl = e.target.closest('[data-action]');
  if (actionEl) { handleAction(actionEl, e); return; }
}

async function handleAction(el, e) {
  const action = el.dataset.action;
  const id     = el.dataset.id;

  switch (action) {
    case 'copy':
      e.preventDefault();
      copyText(el.dataset.copy, el.dataset.toast || 'Copied!');
      break;

    case 'copy-voucher-code':
      e.preventDefault();
      copyText(el.dataset.copy, 'Code copied!');
      incrementCopyCount(id);
      render();
      break;

    case 'mark-used':
      showConfirm({ title: 'Mark as Used?', message: 'This will move the voucher out of your active wallet.', confirmLabel: 'Mark Used', confirmClass: 'btn-success', onConfirm: () => markUsed(id) });
      break;

    case 'mark-unused':
      markUnused(id);
      break;

    case 'show-sell':
      state.params = { id, sellForm: true };
      render();
      break;

    case 'hide-sell':
      state.params = { id };
      render();
      break;

    case 'show-deduct':
      state.params = { id, deductForm: true };
      render();
      break;

    case 'hide-deduct':
      state.params = { id };
      render();
      break;

    case 'show-reminder':
      state.params = { id, reminderForm: true };
      render();
      break;

    case 'hide-reminder':
      state.params = { id };
      render();
      break;

    case 'dismiss-reminder':
      dismissReminder(id);
      break;

    case 'unlist':
      showConfirm({ title: 'Remove Listing?', message: 'Your voucher will be removed from the marketplace.', confirmLabel: 'Remove', onConfirm: () => unlist(id) });
      break;

    case 'clear-expiry-date': {
      e.preventDefault();
      const input = document.getElementById('voucher-expiry-input');
      if (input) input.value = '';
      break;
    }

    // Plain DOM show/hide, not a state-driven re-render — the voucher form
    // isn't backed by state.params, so a render() here would rebuild the
    // whole form from the original voucher and drop any unsaved typing.
    case 'set-value-mode': {
      const mode = el.dataset.mode;
      const form = el.closest('#form-voucher');
      if (!form) break;
      form.querySelectorAll('.value-mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
      const modeInput = form.querySelector('[name="valueMode"]');
      if (modeInput) modeInput.value = mode;
      const amountPanel = form.querySelector('#value-amount-panel');
      const descPanel   = form.querySelector('#value-description-panel');
      const balanceGroup = form.querySelector('#balance-group');
      if (amountPanel)  amountPanel.style.display  = mode === 'amount' ? '' : 'none';
      if (descPanel)    descPanel.style.display    = mode === 'description' ? '' : 'none';
      if (balanceGroup) balanceGroup.style.display = mode === 'description' ? 'none' : '';
      break;
    }

    case 'toggle-gift-note': {
      el.style.display = 'none';
      const fields = document.getElementById('gift-note-fields');
      if (fields) {
        fields.style.display = '';
        fields.querySelector('[name="giftMessage"]')?.focus();
      }
      break;
    }

    case 'remove-gift-note': {
      const fields = document.getElementById('gift-note-fields');
      if (fields) {
        fields.style.display = 'none';
        fields.querySelector('[name="giftMessage"]').value = '';
        fields.querySelector('[name="giftSender"]').value = '';
      }
      document.querySelector('.gift-note-prompt')?.style.setProperty('display', '');
      break;
    }

    case 'send-gift':
      showConfirm({
        title: 'Send this voucher?',
        message: "It'll leave your wallet and you'll get a QR code / link to share. Your friend receives it the moment they claim it, even if they don't have an account yet.",
        confirmLabel: 'Send',
        confirmClass: 'btn-primary',
        onConfirm: () => sendVoucherGift(id),
      });
      break;

    case 'cancel-gift':
      showConfirm({ title: 'Cancel this gift?', message: 'The voucher will move back into your wallet and the link will stop working.', confirmLabel: 'Cancel Gift', onConfirm: () => cancelVoucherGift(id) });
      break;

    case 'show-gift-qr': {
      const v = state.vouchers.find(x => x.id === el.dataset.voucherId);
      if (v) showGiftShareScreen(id, v);
      break;
    }

    case 'confirm-delete':
      showConfirm({ title: 'Delete Voucher?', message: 'This cannot be undone.', confirmLabel: 'Delete', onConfirm: () => deleteVoucher(id) });
      break;

    case 'pick-photo': {
      e.preventDefault();
      const input = document.getElementById('voucher-file-input');
      if (input) input.click();
      break;
    }

    case 'add-voucher-menu':
      e.preventDefault();
      showAddVoucherMenu();
      break;

    case 'remove-existing-file': {
      e.preventDefault();
      voucherFormState.removedFileIds.push(el.dataset.fileId);
      el.closest('.attachment-tile')?.remove();
      break;
    }

    case 'remove-pending-file': {
      e.preventDefault();
      const localId = el.dataset.localId;
      const entry = voucherFormState.pendingNewFiles.find(f => f.localId === localId);
      if (entry?.previewUrl) URL.revokeObjectURL(entry.previewUrl);
      voucherFormState.pendingNewFiles = voucherFormState.pendingNewFiles.filter(f => f.localId !== localId);
      el.closest('.attachment-tile')?.remove();
      break;
    }

    case 'view-attachment': {
      e.preventDefault();
      const url = await getVoucherFileUrl(el.dataset.path);
      if (url) window.open(url, '_blank', 'noopener');
      else showToast('Could not open file');
      break;
    }

    case 'remove-barcode': {
      e.preventDefault();
      if (voucherFormState.pendingBarcode?.previewUrl) URL.revokeObjectURL(voucherFormState.pendingBarcode.previewUrl);
      voucherFormState.pendingBarcode   = null;
      voucherFormState.barcodeRemoved   = true;
      voucherFormState.barcodeScanState = null;
      renderBarcodeGroupNow(state.vouchers.find(x => x.id === state.params.id));
      break;
    }

    case 'edit-referral':
      go('referral-form', { id });
      break;

    case 'delete-referral':
      showConfirm({ title: 'Delete Referral Code?', message: 'This code will be permanently removed.', confirmLabel: 'Delete', onConfirm: () => deleteReferral(id) });
      break;

    case 'increment-referral':
      toggleReferralUse(id);
      break;

    case 'vote-referral': {
      const vote = el.dataset.vote;
      state.referralVotes[id] = state.referralVotes[id] === vote ? null : vote;
      render();
      break;
    }

    case 'resend-email': {
      const email = state.params?.email;
      if (!email) break;
      const btn = document.getElementById('btn-resend-email');
      const msg = document.getElementById('resend-msg');
      if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
      const { error: rErr } = await supabase.auth.resend({ type: 'signup', email });
      if (btn) { btn.disabled = false; btn.textContent = 'Resend Email'; }
      if (msg) {
        if (rErr) { msg.style.color = 'var(--danger)'; msg.textContent = rErr.message; }
        else { msg.style.color = 'var(--success)'; msg.textContent = 'Email sent! Check your inbox.'; }
      }
      break;
    }

    case 'clear-referral-brand':
      state.referralBrandFilter = null;
      render();
      break;

    case 'remove-listing': {
      const vId = el.dataset.voucherId;
      showConfirm({ title: 'Remove Listing?', message: 'This listing will be removed from the marketplace.', confirmLabel: 'Remove', onConfirm: async () => {
        const { error: lErr } = await supabase.from('marketplace_listings').update({ status: 'cancelled' }).eq('id', id);
        if (lErr) { console.error('remove-listing error:', lErr); showToast('Error removing listing'); return; }
        if (vId) {
          const { error: vErr } = await supabase.from('vouchers').update({ status: 'active' }).eq('id', vId);
          if (vErr) { console.error('remove-listing voucher error:', vErr); showToast('Error removing listing'); return; }
        }
        showToast('Listing removed');
        go('marketplace');
      }});
      break;
    }

    case 'unfollow':
      removeFriend(id);
      break;

    case 'accept-request':
      acceptFriendRequest(id);
      break;

    case 'decline-request':
      declineFriendRequest(id);
      break;

    case 'toggle-push': {
      const status = await getPushStatus();
      if (status === 'unsupported') { showToast('Not supported on this device'); break; }
      if (status === 'denied') { showToast('Enable notifications in your browser/phone settings'); break; }
      if (status === 'subscribed') {
        await unsubscribeFromPush();
      } else {
        await subscribeToPush();
      }
      updatePushStatusLabel();
      break;
    }

    case 'logout':
      showConfirm({ title: 'Log Out?', message: 'You will be returned to the login screen.', confirmLabel: 'Log Out', onConfirm: logout });
      break;
  }
}

function handleInput(e) {
  const searchEl = e.target.closest('[data-search]');
  if (searchEl) {
    const type = searchEl.dataset.search;
    const val  = searchEl.value;
    state.searchQuery = val;
    render();
    const restored = document.querySelector(`[data-search="${type}"]`);
    if (restored) { restored.focus(); restored.setSelectionRange(val.length, val.length); }
    return;
  }

  if (e.target.closest('[data-brand-ac]')) { showBrandSuggestions(e.target.value); }
}

function handleChange(e) {
  const sortEl = e.target.closest('[data-sort]');
  if (sortEl) { state.activeSort = sortEl.value; render(); }

  const discCatSel = e.target.closest('[data-discover-cat-select]');
  if (discCatSel) { state.discoveryCategoryFilter = discCatSel.value; render(); return; }

  const discRegionSel = e.target.closest('[data-discover-region-select]');
  if (discRegionSel) { state.discoveryRegionFilter = discRegionSel.value; render(); return; }

  if (e.target.id === 'voucher-file-input') {
    const grid = document.getElementById('attachment-grid');
    const addTile = grid?.querySelector('.attachment-add');
    const existingBarcodePath = state.params.id ? (state.vouchers.find(v => v.id === state.params.id)?.barcodePath || null) : null;
    for (const file of e.target.files) {
      const mimeType = resolveMimeType(file);
      if (!ALLOWED_FILE_TYPES.includes(mimeType)) { showToast('Unsupported file type'); continue; }
      if (file.size > 10 * 1024 * 1024) { showToast(`${file.name} is over 10MB`); continue; }
      const kind = fileKind(mimeType);
      const entry = { localId: randomId(), file, mimeType, kind, previewUrl: kind === 'image' ? URL.createObjectURL(file) : null };
      voucherFormState.pendingNewFiles.push(entry);
      if (addTile) addTile.insertAdjacentHTML('beforebegin', attachmentTileHtml(entry));
      maybeAutoDetectBarcode(file, mimeType, existingBarcodePath);
    }
    e.target.value = '';
  }
}

async function handleSubmit(e) {
  e.preventDefault();
  markActivity();
  const form = e.target;

  if (form.id === 'form-login') {
    const d = formData(form);
    const btn = form.querySelector('[type=submit]');
    if (btn) { btn.disabled = true; btn.textContent = 'Logging in…'; }
    const err = await login(d.email, d.password);
    if (err) {
      const el = form.querySelector('#auth-error');
      if (el) { el.textContent = err; el.style.display = ''; }
      if (btn) { btn.disabled = false; btn.textContent = 'Log In'; }
    }
    return;
  }

  if (form.id === 'form-signup') {
    const d = formData(form);
    const btn = form.querySelector('[type=submit]');
    if (btn) { btn.disabled = true; btn.textContent = 'Creating account…'; }
    const err = await register(d.firstName, d.lastName, d.email, d.password);
    if (err) {
      const el = form.querySelector('#auth-error');
      if (el) { el.textContent = err; el.style.display = ''; }
      if (btn) { btn.disabled = false; btn.textContent = 'Create Account'; }
    }
    return;
  }

  if (form.id === 'form-forgot') {
    const d = formData(form);
    const btn = form.querySelector('[type=submit]');
    const errEl = document.getElementById('forgot-error');
    const okEl  = document.getElementById('forgot-success');
    if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
    const { error } = await supabase.auth.resetPasswordForEmail(d.email, {
      redirectTo: `${window.location.origin}${import.meta.env.BASE_URL}`,
    });
    if (btn) { btn.disabled = false; btn.textContent = 'Send Reset Link'; }
    if (error) {
      if (errEl) { errEl.textContent = error.message; errEl.style.display = ''; }
    } else {
      if (errEl) errEl.style.display = 'none';
      if (okEl)  { okEl.textContent = 'Check your email for a password reset link.'; okEl.style.display = ''; }
      form.querySelector('input[type=email]').disabled = true;
      if (btn) btn.style.display = 'none';
    }
    return;
  }

  if (form.id === 'form-reset-password') {
    const d = formData(form);
    const btn = form.querySelector('[type=submit]');
    const errEl = document.getElementById('reset-error');
    if (d.password.length < 8) { if (errEl) { errEl.textContent = 'Password must be at least 8 characters.'; errEl.style.display = ''; } return; }
    if (d.password !== d.passwordConfirm) { if (errEl) { errEl.textContent = 'Passwords do not match.'; errEl.style.display = ''; } return; }
    if (errEl) errEl.style.display = 'none';
    if (btn) { btn.disabled = true; btn.textContent = 'Updating…'; }
    const { error } = await supabase.auth.updateUser({ password: d.password });
    if (error) {
      if (errEl) { errEl.textContent = error.message; errEl.style.display = ''; }
      if (btn) { btn.disabled = false; btn.textContent = 'Update Password'; }
      return;
    }
    showToast('Password updated');
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      state.currentUser = mapUser(session.user);
      state.view = 'home';
      await fetchVouchers();
      await Promise.all([fetchBrands(), fetchListings(), fetchFriendIds(), fetchPendingRequests(), fetchReminders()]);
      render();
    } else {
      go('auth');
    }
    return;
  }

  if (form.id === 'form-voucher') {
    const d = formData(form);
    const valueMode = d.valueMode === 'description' ? 'description' : 'amount';
    let amount = '', valueDescription = '', balance = null;
    if (valueMode === 'amount') {
      amount = normalizeAmount(d.amount);
      if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) { showToast('Enter a valid amount'); return; }
      balance = d.balance !== '' ? normalizeAmount(d.balance) : null;
      if (balance !== null && (isNaN(parseFloat(balance)) || parseFloat(balance) < 0)) { showToast('Enter a valid balance'); return; }
    } else {
      valueDescription = (d.valueDescription || '').trim();
      if (!valueDescription) { showToast('Describe what this voucher is for'); return; }
    }
    const btn = form.querySelector('[type=submit]');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    const data = {
      brand:            d.brand.trim(),
      valueMode,
      value:            amount,
      valueDescription,
      balance:          balance,
      expiryDate:       d.expiryDate || null,
      code:             d.code.trim(),
      pin:              d.pin.trim(),
      notes:            d.notes.trim(),
      category:         d.category || 'Other',
      voucherType:      d.voucherType || 'gift_card',
      giftMessage:      (d.giftMessage || '').trim(),
      giftSender:       (d.giftSender || '').trim(),
    };
    if (d.voucherId) data.id = d.voucherId;
    const existingBarcodePath = d.voucherId ? (state.vouchers.find(v => v.id === d.voucherId)?.barcodePath || null) : null;
    try {
      if (voucherFormState.pendingBarcode) {
        data.barcodePath = await uploadBarcodeBlob(voucherFormState.pendingBarcode.blob);
      } else if (voucherFormState.barcodeRemoved) {
        data.barcodePath = null;
      }

      const voucherId = await saveVoucher(data);

      for (const fileId of voucherFormState.removedFileIds) {
        const f = state.voucherFiles.find(x => x.id === fileId);
        await supabase.from('voucher_files').delete().eq('id', fileId);
        if (f) deleteVoucherFileObject(f.file_path);
      }

      const keptCount = state.voucherFiles.length - voucherFormState.removedFileIds.length;
      for (let i = 0; i < voucherFormState.pendingNewFiles.length; i++) {
        const entry = voucherFormState.pendingNewFiles[i];
        const path = await uploadVoucherFile(entry.file, entry.mimeType);
        const { error: fileErr } = await supabase.from('voucher_files').insert({
          voucher_id: voucherId,
          user_id:    state.currentUser.id,
          file_path:  path,
          file_type:  entry.kind,
          position:   keptCount + i,
        });
        if (fileErr) { console.error('voucher_files insert error:', fileErr); throw fileErr; }
        if (entry.previewUrl) URL.revokeObjectURL(entry.previewUrl);
      }

      if (existingBarcodePath && data.barcodePath !== undefined && data.barcodePath !== existingBarcodePath) {
        deleteVoucherFileObject(existingBarcodePath);
      }
      if (voucherFormState.pendingBarcode?.previewUrl) URL.revokeObjectURL(voucherFormState.pendingBarcode.previewUrl);
      voucherFormState.pendingBarcode  = null;
      voucherFormState.barcodeRemoved  = false;

      voucherFormState.pendingNewFiles = [];
      voucherFormState.removedFileIds  = [];
      showToast(data.id ? 'Voucher updated' : 'Voucher saved');
      go(data.id ? 'voucher-detail' : 'vouchers', data.id ? { id: voucherId } : {});
    } catch (err) {
      console.error('saveVoucher exception:', err);
      showToast('Error saving voucher');
      if (btn) { btn.disabled = false; btn.textContent = data.id ? 'Save Changes' : 'Add Voucher'; }
    }
    return;
  }

  if (form.id === 'form-sell') {
    const d = formData(form);
    const price = parseFloat(normalizeAmount(d.price));
    if (!price || price <= 0) return;
    listForSale(d.voucherId, price, d.visibility);
    return;
  }

  if (form.id === 'form-deduct') {
    const d = formData(form);
    if (!d.amount) return;
    await deductBalance(d.voucherId, normalizeAmount(d.amount));
    return;
  }

  if (form.id === 'form-reminder') {
    const d = formData(form);
    if (!d.reminderDateTime) return;
    const [date, time] = d.reminderDateTime.split('T');
    await setReminder(d.voucherId, date, time);
    return;
  }

  if (form.id === 'form-referral') {
    const d = formData(form);
    if (!d.brand.trim()) { showToast('Please enter a brand name'); return; }
    if (!d.code.trim() && !(d.link || '').trim()) { showToast('Please enter a referral code or link'); return; }
    const btn = form.querySelector('[type=submit]');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    const payload = {
      brand:           d.brand.trim(),
      brandCategory:   d.brandCategory || null,
      code:            d.code.trim(),
      link:            (d.link || '').trim(),
      benefitNew:      (d.benefitNew || '').trim(),
      benefitReferrer: (d.benefitReferrer || '').trim(),
      terms:           (d.terms || '').trim(),
      visibility:      d.visibility,
      expirationDate:  d.expirationDate || null,
    };
    if (d.referralId) {
      await updateReferral(d.referralId, payload);
    } else {
      await saveReferral(payload);
    }
    if (btn) { btn.disabled = false; btn.textContent = 'Save Code'; }
    return;
  }

  if (form.id === 'form-add-friend') {
    const d   = formData(form);
    const btn = form.querySelector('[type=submit]');
    if (btn) { btn.disabled = true; btn.textContent = 'Following…'; }
    const err = await addFriend(d.email);
    const errEl = form.querySelector('#friend-error');
    if (err) {
      if (errEl) { errEl.textContent = err; errEl.style.display = ''; }
      if (btn) { btn.disabled = false; btn.textContent = 'Follow'; }
    } else {
      if (errEl) errEl.style.display = 'none';
      form.reset();
      await go('friends');
    }
    return;
  }
}
