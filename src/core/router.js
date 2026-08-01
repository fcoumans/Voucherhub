// App shell: navigation (go), the view registry + render loop, and startup
// (init) — auth-session detection, gift-link/email-confirmation URL
// handling, and the Supabase auth-state-change listener.
import { supabase } from '../lib/supabase.js';
import { state } from './state.js';
import { showToast } from './toast.js';
import { fetchBrands } from './brands.js';
import { viewAuth, viewWelcome, viewVerifyEmail, viewForgotPassword, viewResetPassword } from '../features/auth/views.js';
import { mapUser, touchLastActive } from '../features/auth/auth.js';
import {
  fetchVouchers, fetchVoucherFiles, fileKind, randomId,
  loadVoucherFormAttachmentThumbs, loadVoucherDetailBarcode,
} from '../features/wallet/vouchers.js';
import { applyExtractedFields } from '../features/wallet/scanning.js';
import { voucherFormState } from '../features/wallet/voucher-form-state.js';
import { viewHome, viewVouchers, viewVoucherForm, viewVoucherDetail } from '../features/wallet/views.js';
import { fetchListings } from '../features/marketplace/marketplace.js';
import { viewMarketplace, viewListingDetail } from '../features/marketplace/views.js';
import { fetchFriendIds, fetchFriends, fetchPendingRequests } from '../features/social/friends.js';
import { fetchPendingGifts, tryClaimPendingGift } from '../features/social/gifting.js';
import { viewPendingGifts, viewFriends } from '../features/social/views.js';
import { fetchReminders } from '../features/notifications/reminders.js';
import { updatePushStatusLabel } from '../features/notifications/push.js';
import { fetchDiscoveryBrands } from '../features/discover/discover.js';
import { viewDiscover, viewDiscoverDetail } from '../features/discover/views.js';
import { fetchReferrals } from '../features/referrals/referrals.js';
import { viewReferrals, viewReferralForm } from '../features/referrals/views.js';
import { viewProfile } from './profile-view.js';
import { attachListeners } from './events.js';

export async function go(view, params = {}) {
  state.view = view;
  state.params = params;
  state.searchQuery = '';
  if (view !== 'referral-form') state.referralBrandFilter = null;
  if (!state.currentUser) { render(); return; }

  switch (view) {
    case 'home':
      // vouchers first so mapReminder can look up brand names
      await fetchVouchers();
      await Promise.all([fetchReminders(), fetchListings(), fetchFriendIds(), fetchPendingRequests(), fetchPendingGifts()]);
      break;
    case 'vouchers':
      await Promise.all([fetchVouchers(), fetchPendingGifts()]);
      break;
    case 'pending-gifts':
      await Promise.all([fetchVouchers(), fetchPendingGifts()]);
      break;
    case 'voucher-detail':
      await Promise.all([fetchVouchers(), fetchReminders()]);
      state.voucherFiles = params.id ? await fetchVoucherFiles(params.id) : [];
      break;
    case 'voucher-form':
      voucherFormState.pendingNewFiles.forEach(f => { if (f.previewUrl) URL.revokeObjectURL(f.previewUrl); });
      voucherFormState.pendingNewFiles  = [];
      voucherFormState.removedFileIds   = [];
      if (voucherFormState.pendingExtractionFiles) {
        // Arriving from startVoucherScan — voucherFormState.pendingBarcode/voucherFormState.pendingExtractionResult
        // were already resolved before this navigation, so leave them intact
        // for the template/render() hook below to consume.
        for (const { file, mimeType } of voucherFormState.pendingExtractionFiles) {
          const kind = fileKind(mimeType);
          const entry = {
            localId: randomId(),
            file,
            mimeType,
            kind,
            previewUrl: kind === 'image' ? URL.createObjectURL(file) : null,
          };
          voucherFormState.pendingNewFiles.push(entry);
          voucherFormState.pendingExtractionEntry = entry; // truthiness gate consumed once in render(); last entry wins, doesn't matter which
        }
        voucherFormState.pendingExtractionFiles = null;
      } else {
        // Plain navigation (Manual Entry / Edit) — clear any leftover scan state.
        if (voucherFormState.pendingBarcode?.previewUrl) URL.revokeObjectURL(voucherFormState.pendingBarcode.previewUrl);
        voucherFormState.pendingBarcode           = null;
        voucherFormState.barcodeRemoved           = false;
        voucherFormState.pendingExtractionResult  = null;
        voucherFormState.barcodeScanState         = null;
      }
      await Promise.all([fetchVouchers(), fetchBrands()]);
      state.voucherFiles = params.id ? await fetchVoucherFiles(params.id) : [];
      break;
    case 'marketplace':
    case 'listing-detail':
      await Promise.all([fetchListings(), fetchFriendIds()]);
      break;
    case 'discover':
    case 'discover-detail':
      await fetchDiscoveryBrands();
      break;
    case 'referrals':
      await Promise.all([fetchFriendIds(), fetchBrands()]);
      await fetchReferrals();
      break;
    case 'referral-form':
      await fetchBrands();
      break;
    case 'friends':
      await Promise.all([fetchFriends(), fetchPendingRequests()]);
      break;
    case 'profile':
      await Promise.all([fetchVouchers(), fetchListings(), fetchFriendIds(), fetchPendingRequests(), fetchPendingGifts()]);
      await fetchReferrals();
      break;
  }
  render();
  window.scrollTo(0, 0);
}

const VIEWS = {
  welcome:          viewWelcome,
  auth:             viewAuth,
  'verify-email':   viewVerifyEmail,
  'forgot-password': viewForgotPassword,
  'reset-password':  viewResetPassword,
  home:             viewHome,
  vouchers:         viewVouchers,
  'pending-gifts':  viewPendingGifts,
  'voucher-form':   viewVoucherForm,
  'voucher-detail': viewVoucherDetail,
  marketplace:      viewMarketplace,
  'listing-detail': viewListingDetail,
  discover:         viewDiscover,
  'discover-detail': viewDiscoverDetail,
  referrals:        viewReferrals,
  'referral-form':  viewReferralForm,
  friends:          viewFriends,
  profile:          viewProfile,
};

export function render() {
  const el = document.getElementById('app');
  if (!el) return;
  el.innerHTML = (!state.currentUser ? (VIEWS[state.view] || viewAuth)() : (VIEWS[state.view] || viewHome)());
  attachListeners();
  if (state.view === 'profile') updatePushStatusLabel();
  if (state.view === 'voucher-form') loadVoucherFormAttachmentThumbs();
  if (state.view === 'voucher-detail') loadVoucherDetailBarcode();
  if (state.view === 'voucher-form' && voucherFormState.pendingExtractionEntry) {
    // AI fields and the barcode crop are already resolved by startVoucherScan
    // before this render — just apply the fields (the barcode preview is
    // already part of the template itself, via voucherFormState.pendingBarcode).
    voucherFormState.pendingExtractionEntry = null; // consume once so re-renders (e.g. brand typing) don't re-apply
    if (voucherFormState.pendingExtractionResult) applyExtractedFields(voucherFormState.pendingExtractionResult);
    voucherFormState.pendingExtractionResult = null;
  }
}

export async function init() {
  // Detect email confirmation / password-reset / gift-claim links in URL
  const urlSearch = new URLSearchParams(window.location.search);
  const urlHash   = new URLSearchParams(window.location.hash.replace('#', '?'));
  const confirmType = urlSearch.get('type') || urlHash.get('type');
  const isEmailConfirm = confirmType === 'email' || confirmType === 'signup';
  const isRecovery    = confirmType === 'recovery';
  const authError     = urlHash.get('error') || urlSearch.get('error');
  const authErrorDesc = urlHash.get('error_description') || urlSearch.get('error_description');
  const giftId        = urlSearch.get('gift') || urlHash.get('gift');
  if (giftId) localStorage.setItem('pendingGiftId', giftId);
  if (isEmailConfirm || isRecovery || authError || giftId) window.history.replaceState(null, '', import.meta.env.BASE_URL);

  const { data: { session } } = await supabase.auth.getSession();
  if (isRecovery && session) {
    // Recovery link established a session — show the reset form, not Home
    state.view = 'reset-password';
  } else if (session) {
    state.currentUser = mapUser(session.user);
    touchLastActive(session.user.id);
    state.view = 'home';
    await tryClaimPendingGift();
    // vouchers first so mapReminder can look up brand names
    await fetchVouchers();
    await Promise.all([fetchBrands(), fetchListings(), fetchFriendIds(), fetchPendingRequests(), fetchReminders(), fetchPendingGifts()]);
  } else if (authError) {
    state.view = 'forgot-password';
  } else {
    state.view = isEmailConfirm ? 'auth' : 'welcome';
    state.params = { tab: 'login' };
  }
  render();

  if (authError) {
    const msg = authErrorDesc
      ? authErrorDesc.replace(/\+/g, ' ')
      : 'This link is invalid or has expired. Please request a new one.';
    setTimeout(() => showToast(msg), 300);
  }

  if (isEmailConfirm && session) {
    setTimeout(() => showToast('Email confirmed! Welcome to VoucherWise.'), 300);
  }

  // Handle email confirmation / password-recovery links — session fires here if not already caught above
  supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'PASSWORD_RECOVERY') {
      state.view = 'reset-password';
      render();
      return;
    }
    if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session && !state.currentUser && state.view !== 'reset-password') {
      state.currentUser = mapUser(session.user);
      touchLastActive(session.user.id);
      state.view = 'home';
      await tryClaimPendingGift();
      await fetchVouchers();
      await Promise.all([fetchBrands(), fetchListings(), fetchFriendIds(), fetchPendingRequests(), fetchReminders(), fetchPendingGifts()]);
      render();
      if (isEmailConfirm) {
        setTimeout(() => showToast('Email confirmed! Welcome to VoucherWise.'), 300);
      }
    }
  });
}
