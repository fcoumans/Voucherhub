// The Profile page is a dashboard aggregating KPIs from every feature
// (wallet, marketplace, referrals, social) plus account actions (logout,
// push toggle) — it doesn't belong to any single feature, so it lives here
// rather than under features/.
import { state } from './state.js';
import { esc, initial, formatCurrency } from './dom.js';
import { icon, navIcons, renderHeader, renderBottomNav } from './ui.js';
import { getStatus } from '../features/wallet/vouchers.js';

export function viewProfile() {
  const u           = state.currentUser;
  const giftedIds   = new Set(state.pendingGifts.map(g => g.voucher_id));
  const vouchers    = state.vouchers.filter(v => !giftedIds.has(v.id));
  const expiring    = vouchers.filter(v => getStatus(v) === 'expiring');
  const activeOnly  = vouchers.filter(v => getStatus(v) === 'active' || getStatus(v) === 'expiring');
  const listed      = vouchers.filter(v => getStatus(v) === 'listed');
  const giftedVouchers = state.pendingGifts
    .map(g => state.vouchers.find(v => v.id === g.voucher_id))
    .filter(Boolean);
  const myListings  = state.listings.filter(l => l.sellerId === u.id);
  const myReferrals = state.referrals.filter(r => r.userId === u.id);
  const following   = state.friendIds.length;
  const valueOf     = list => list.reduce((s, v) => s + parseFloat((v.balance ?? v.value) || 0), 0);

  const kpiCard = (label, list, navView, navParams = {}) => `
    <button type="button" class="kpi-card" ${navView ? `data-nav="${navView}"` : ''} ${navParams.id ? `data-id="${esc(navParams.id)}"` : ''}>
      <div class="kpi-label">${label}</div>
      <div class="kpi-row">
        <div class="kpi-stat">
          <div class="kpi-value">${list.length}</div>
          <div class="kpi-unit">voucher${list.length !== 1 ? 's' : ''}</div>
        </div>
        <div class="kpi-stat">
          <div class="kpi-value">${formatCurrency(valueOf(list), 'EUR', false)}</div>
          <div class="kpi-unit">value</div>
        </div>
      </div>
    </button>`;

  return `
  ${renderHeader('Profile')}
  <main class="content">
    <div class="profile-header">
      <div class="profile-avatar" style="background:linear-gradient(150deg,#D6710A 0%,#F98513 100%)">${esc(initial(u.name))}</div>
      <div class="profile-name">${esc(u.name)}</div>
      <div class="profile-email">${esc(u.email)}</div>
    </div>

    <div class="kpi-grid">
      ${kpiCard('Active', activeOnly, 'vouchers')}
      ${kpiCard('Expiring', expiring, 'vouchers')}
      ${kpiCard('Listed', listed, 'marketplace')}
      ${kpiCard('Gifted', giftedVouchers, 'pending-gifts')}
    </div>

    <div class="settings-list">
      <button class="settings-item" data-nav="vouchers">
        <div class="si-icon" style="background:#CFF1E8">${navIcons.vouchers.replace(/currentColor/g,'#13B5A2')}</div>
        <div class="si-text"><div class="si-title">My Wallet</div><div class="si-subtitle">${vouchers.length} total</div></div>
      </button>
      <button class="settings-item" data-nav="marketplace" data-marketplace-tab-init="mine">
        <div class="si-icon" style="background:#CFF1E8">${navIcons.marketplace.replace(/currentColor/g,'#13B5A2')}</div>
        <div class="si-text"><div class="si-title">My Listings</div><div class="si-subtitle">${myListings.length} active</div></div>
      </button>
      <button class="settings-item" data-nav="referrals" data-referral-tab-init="mine">
        <div class="si-icon" style="background:#CFF1E8">${navIcons.referrals.replace(/currentColor/g,'#13B5A2')}</div>
        <div class="si-text"><div class="si-title">Referral Codes</div><div class="si-subtitle">${myReferrals.length} codes, ${myReferrals.reduce((s,r)=>s+(r.usedCount||0),0)} total uses</div></div>
      </button>
      <button class="settings-item" data-nav="friends">
        <div style="position:relative;display:inline-flex">
          <div class="si-icon" style="background:#CFF1E8;color:#13B5A2">${icon.users}</div>
          ${state.pendingRequests.length > 0 ? `<span style="position:absolute;top:-2px;right:-2px;width:8px;height:8px;background:var(--warning);border-radius:50%;border:1.5px solid #fff"></span>` : ''}
        </div>
        <div class="si-text">
          <div class="si-title">Friends</div>
          <div class="si-subtitle">${state.friendIds.length} friends${state.pendingRequests.length > 0 ? ` · <span style="color:var(--warning);font-weight:600">${state.pendingRequests.length} pending</span>` : ''}</div>
        </div>
      </button>
      <button class="settings-item" data-nav="pending-gifts">
        <div class="si-icon" style="background:#CFF1E8;color:#13B5A2">${icon.gift}</div>
        <div class="si-text"><div class="si-title">Pending Gifts</div><div class="si-subtitle">${state.pendingGifts.length} waiting to be claimed</div></div>
      </button>
      <button class="settings-item" data-nav="notifications">
        <div style="position:relative;display:inline-flex">
          <div class="si-icon" style="background:#CFF1E8;color:#13B5A2">${icon.bell}</div>
          ${state.activityNotifications.some(n => !n.read) ? `<span style="position:absolute;top:-2px;right:-2px;width:8px;height:8px;background:var(--warning);border-radius:50%;border:1.5px solid #fff"></span>` : ''}
        </div>
        <div class="si-text">
          <div class="si-title">Notifications</div>
          <div class="si-subtitle">${state.activityNotifications.length} total${state.activityNotifications.some(n => !n.read) ? ` · <span style="color:var(--warning);font-weight:600">${state.activityNotifications.filter(n => !n.read).length} unread</span>` : ''}</div>
        </div>
      </button>
    </div>

    <div class="settings-list" style="margin-top:16px">
      <button class="settings-item" data-action="toggle-push" id="btn-push-toggle">
        <div class="si-icon" style="background:#FFF3E0">${icon.bell}</div>
        <div class="si-text"><div class="si-title">Push Notifications</div><div class="si-subtitle" id="push-status-label">Loading…</div></div>
        <div class="push-toggle" id="push-toggle-track"><div class="push-toggle-thumb"></div></div>
      </button>
      <button class="settings-item danger" data-action="logout">
        <div class="si-icon" style="background:var(--danger-light)">${icon.logout}</div>
        <div class="si-text"><div class="si-title">Log Out</div></div>
      </button>
    </div>

  </main>
  ${renderBottomNav()}`;
}
