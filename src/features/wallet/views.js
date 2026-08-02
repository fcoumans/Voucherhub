// Home dashboard, wallet list, voucher form (add/edit), and voucher detail
// — including the inline Sell/Gift action buttons and forms on the detail
// page (their submit handlers live in app.js's event listeners for now;
// this module only renders the markup).
//
import { state, CATEGORIES } from '../../core/state.js';
import { esc, daysUntil, formatDate, formatCurrency, initial } from '../../core/dom.js';
import { icon, avatar, renderHeader, renderBottomNav, navIcons, brandAutocomplete } from '../../core/ui.js';
import { categoryBadge, categoryFilterDropdown } from '../../core/categories.js';
import { voucherFormState } from './voucher-form-state.js';
import { formatVoucherValue, getStatus, formatMonthYear, formatFullDate, STATUS_LABEL, STATUS_CLASS } from './vouchers.js';

const badge = (status) =>
  `<span class="badge ${STATUS_CLASS[status] || 'badge-gray'}">${STATUS_LABEL[status] || esc(status)}</span>`;

// Small authored "×" glyph used on remove/dismiss buttons — replaces the
// literal "✕" text character so these read as drawn icons (2px stroke,
// round caps) consistent with the rest of the icon system, not a unicode
// glyph standing in for one.
const closeIcon = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

// Authored warning-triangle glyph for the home "Expiring soon" alert card.
const warningIcon = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;

// Trending-up glyph for the home "Portfolio" card header.
const trendingUpIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>`;

// Dark-to-light Emerald Sea ramp for the portfolio donut, assigned by rank
// (largest category first) so the chart always reads darkest-to-lightest.
const PORTFOLIO_RAMP = ['#3AAE9C', '#5CC2AE', '#7ED3C0', '#A3E0D0', '#C4EBE0', '#DFF5EE'];

// Category breakdown donut + legend for the home "Portfolio" card — grouped
// from the same active+expiring vouchers the stats banner totals up.
function portfolioCard(vouchers, total) {
  const byCategory = new Map();
  for (const v of vouchers) {
    const cat = v.category || 'Other';
    const amount = parseFloat((v.balance ?? v.value) || 0);
    byCategory.set(cat, (byCategory.get(cat) || 0) + amount);
  }
  const data = [...byCategory.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .map((d, i) => ({ ...d, color: PORTFOLIO_RAMP[i % PORTFOLIO_RAMP.length] }));

  // Equal-width gap at every boundary, including the seam where the last
  // slice meets the first (split as a half-gap at 0% and a half-gap at
  // 100% so it reads the same as the internal gaps once the ring closes).
  const n = data.length;
  const gapPct = n > 1 ? 0.6 : 0;
  const available = 100 - n * gapPct;
  const stops = [];
  let p = gapPct / 2;
  if (gapPct > 0) stops.push(`transparent 0% ${p}%`);
  data.forEach((d, i) => {
    const width = (d.value / total) * available;
    const segEnd = p + width;
    stops.push(`${d.color} ${p}% ${segEnd}%`);
    p = segEnd;
    if (i < n - 1) {
      const gapEnd = p + gapPct;
      stops.push(`transparent ${p}% ${gapEnd}%`);
      p = gapEnd;
    } else if (gapPct > 0) {
      stops.push(`transparent ${p}% 100%`);
    }
  });

  return `
  <div class="portfolio-card">
    <div class="portfolio-header">
      <h3 class="section-title"><span style="color:var(--primary);display:inline-flex">${trendingUpIcon}</span> Portfolio</h3>
      <span class="portfolio-total">€${total.toLocaleString('nl-NL', { maximumFractionDigits: 0 })} total</span>
    </div>
    <div class="portfolio-body">
      <div class="donut" style="background:conic-gradient(${stops.join(', ')})"></div>
      <div class="donut-legend">
        ${data.map(d => `
        <div class="donut-legend-row">
          <span class="donut-dot" style="background:${d.color}"></span>
          <span class="donut-legend-label">${esc(d.label)}</span>
          <span class="donut-legend-value">€${d.value.toLocaleString('nl-NL', { maximumFractionDigits: 0 })}</span>
        </div>`).join('')}
      </div>
    </div>
  </div>`;
}

// Compact alert-row used for the single most urgent expiring voucher on the
// home banner — distinct from the fuller voucherCard used in wallet lists.
function expiringAlertCard(v) {
  const displayAmount = v.balance != null ? v.balance : v.value;
  return `
  <div class="expiring-alert" data-nav="voucher-detail" data-id="${esc(v.id)}">
    <div class="expiring-alert-icon">${warningIcon}</div>
    <div class="expiring-alert-body">
      <div class="expiring-alert-title">Expiring soon</div>
      <div class="expiring-alert-sub">${esc(v.brand)} • ${formatVoucherValue(v, displayAmount, false)}${v.expiryDate ? ` expires ${formatMonthYear(v.expiryDate)}` : ''}</div>
    </div>
    <button class="expiring-alert-cta" data-nav="voucher-detail" data-id="${esc(v.id)}">Use now</button>
  </div>`;
}

/* ============================================================
   VIEW: HOME
   ============================================================ */
export function viewHome() {
  const giftedIds = new Set(state.pendingGifts.map(g => g.voucher_id));
  const vouchers  = state.vouchers.filter(v => !giftedIds.has(v.id));
  const expiring  = vouchers.filter(v => getStatus(v) === 'expiring');
  const active    = vouchers.filter(v => getStatus(v) === 'active');
  const total     = [...active, ...expiring].reduce((s, v) => s + parseFloat((v.balance ?? v.value) || 0), 0);
  const hour      = new Date().getHours();
  const greeting  = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return `
  <div class="home-hero">
    <div class="home-hero-top">
      <div>
        <p class="greeting">${greeting},</p>
        <h2>${esc(state.currentUser.name.split(' ')[0])}</h2>
      </div>
      <div class="home-hero-actions">
        <button class="hero-icon-btn" data-nav="notifications" aria-label="Notifications">
          ${icon.bell}
          ${state.pendingRequests.length > 0 || state.activityNotifications.some(n => !n.read) ? `<span class="hero-dot"></span>` : ''}
        </button>
        <button class="hero-icon-btn" data-nav="profile" aria-label="Profile">
          <span class="hero-avatar-initial">${esc(initial(state.currentUser.name))}</span>
        </button>
      </div>
    </div>

    <div class="home-hero-stats">
      <div class="stat">
        <span class="stat-value">${active.length + expiring.length}</span>
        <span class="stat-label">Active</span>
      </div>
      <div class="stat-divider"></div>
      <div class="stat">
        <span class="stat-value">€${total.toLocaleString('nl-NL', { maximumFractionDigits: 0 })}</span>
        <span class="stat-label">Total Value</span>
      </div>
      <div class="stat-divider"></div>
      <div class="stat">
        <span class="stat-value">${expiring.length}</span>
        <span class="stat-label">Expiring</span>
      </div>
    </div>
  </div>

  <main class="content content--home">
    ${expiring.length > 0 ? `
    <section class="home-section">
      <div class="voucher-list" style="margin-top:0">
        ${expiring.map(v => expiringAlertCard(v)).join('')}
      </div>
    </section>
    ` : ''}

    <section class="home-section">
      <h3 class="section-title-caps">Quick Actions</h3>
      <div class="quick-actions" style="margin-top:10px">
        <button class="quick-action" data-action="add-voucher-menu">
          <div class="qa-icon">${icon.plus}</div>
          <span>Add Voucher</span>
        </button>
        <button class="quick-action" data-nav="marketplace">
          <div class="qa-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>
          </div>
          <span>Marketplace</span>
        </button>
        <button class="quick-action" data-nav="referrals">
          <div class="qa-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
          </div>
          <span>Referrals</span>
        </button>
      </div>
    </section>

    ${total > 0 ? `
    <section class="home-section">
      ${portfolioCard([...active, ...expiring], total)}
    </section>
    ` : ''}

    ${active.length > 0 ? `
    <section class="home-section">
      <div class="section-header">
        <h3 class="section-title-caps">My Wallet</h3>
        <button class="link-btn" data-nav="vouchers">See all</button>
      </div>
      <div class="voucher-list">
        ${active.slice(0, 3).map(v => voucherCard(v)).join('')}
      </div>
    </section>
    ` : vouchers.length === 0 ? `
    <section class="home-section">
      <div class="card" style="text-align:center;padding:32px 16px">
        <div style="color:var(--secondary);display:flex;justify-content:center;margin-bottom:12px"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg></div>
        <h3 style="margin-bottom:8px">No vouchers yet</h3>
        <p style="color:var(--text-muted);font-size:0.875rem;margin-bottom:16px">Add your first voucher to start managing your wallet</p>
        <button class="btn btn-primary" data-action="add-voucher-menu">Add Voucher</button>
      </div>
    </section>
    ` : ''}
  </main>
  ${renderBottomNav()}`;
}

/* ============================================================
   VIEW: VOUCHERS
   ============================================================ */
export function voucherCard(v, isGifted) {
  const s = getStatus(v);
  const days = v.expiryDate ? daysUntil(v.expiryDate) : null;
  let expiryMeta = badge(s);
  if (isGifted) {
    expiryMeta = `<span class="text-xs" style="color:var(--accent)">${icon.gift} Gifted</span>`;
  } else if (s !== 'listed' && days !== null) {
    if (days < 0)        expiryMeta = `<span class="text-danger text-xs">Expired</span>`;
    else if (days === 0) expiryMeta = `<span class="text-warning text-xs">Today!</span>`;
    else if (days <= 7)  expiryMeta = `<span class="text-warning text-xs">${days}d left</span>`;
    else if (days <= 30) expiryMeta = `<span class="text-warning text-xs">${days}d left</span>`;
    else                 expiryMeta = badge(s);
  }
  const displayAmount = v.balance != null ? v.balance : v.value;
  const nav = isGifted ? 'pending-gifts' : 'voucher-detail';

  return `
  <div class="voucher-card status-${s}" data-nav="${nav}" data-id="${esc(v.id)}">
    ${avatar(v.brand)}
    <div class="vc-info">
      <div class="vc-brand">${esc(v.brand)}</div>
      <div class="vc-meta" style="margin-top:3px">${expiryMeta}</div>
      <div class="vc-hint-slot">${isGifted ? `<div class="vc-listed-hint">Tap to manage gift</div>`
        : s === 'listed' ? `<div class="vc-listed-hint">Tap to unlist</div>`
        : v.giftMessage ? `<div class="vc-note-hint">${esc(v.giftMessage)}</div>`
        : v.giftSender ? `<div class="vc-note-hint">From ${esc(v.giftSender)}</div>` : ''}</div>
    </div>
    <div class="vc-right">
      <div class="vc-value${v.valueDescription ? ' vc-value-text' : ''}">${formatVoucherValue(v, displayAmount, false)}</div>
      <div class="vc-category-slot">${v.category ? categoryBadge(v.category) : ''}</div>
      <div class="vc-expiry-slot">${v.expiryDate ? formatFullDate(v.expiryDate) : ''}</div>
    </div>
  </div>`;
}

// Compact card for a sent gift a friend has already claimed. The voucher
// itself has transferred away (claim_voucher_gift reassigns its user_id), so
// unlike voucherCard() this renders from the send-time snapshot columns on
// the gift row rather than a live voucher object — and isn't tappable, since
// there's nothing left here to manage (see fetchSentGifts).
function claimedGiftCard(g) {
  return `
  <div class="voucher-card status-active" style="cursor:default">
    ${avatar(g.voucher_brand)}
    <div class="vc-info">
      <div class="vc-brand">${esc(g.voucher_brand)}</div>
      <div class="vc-listed-hint">Claimed by your friend</div>
    </div>
    <div class="vc-right">
      <div class="vc-value${g.voucher_value_description ? ' vc-value-text' : ''}">${g.voucher_value_description ? esc(g.voucher_value_description) : formatCurrency(g.voucher_value, g.voucher_currency, false)}</div>
      <div class="vc-meta"><span class="text-xs" style="color:var(--accent)">${icon.gift} Gifted</span></div>
    </div>
  </div>`;
}

export function viewVouchers() {
  const q       = state.searchQuery.toLowerCase();
  const filter  = state.activeFilter;
  const sort    = state.activeSort;
  const catFilter = state.walletCategoryFilter || 'All';
  // Vouchers with a pending gift are hidden from the normal wallet — they
  // live in the Pending Gifts list until claimed or cancelled.
  const giftedIds = new Set(state.pendingGifts.map(g => g.voucher_id));
  // Sent gifts a friend has already claimed — ownership has since
  // transferred (claim_voucher_gift), so these are no longer in
  // state.vouchers at all; rendered from their send-time snapshot instead.
  let claimedGifts = state.sentGifts.filter(g => g.status === 'claimed');
  let vouchers = filter === 'gifted'
    ? state.vouchers.filter(v => giftedIds.has(v.id))
    : state.vouchers.filter(v => !giftedIds.has(v.id));

  if (q) vouchers = vouchers.filter(v => v.brand.toLowerCase().includes(q) || (v.code||'').toLowerCase().includes(q));
  if (q) claimedGifts = claimedGifts.filter(g => (g.voucher_brand||'').toLowerCase().includes(q));
  if (catFilter !== 'All') vouchers = vouchers.filter(v => (v.category || 'Other') === catFilter);
  if (filter !== 'all' && filter !== 'gifted') vouchers = vouchers.filter(v => {
    const s = getStatus(v);
    if (filter === 'active') return s === 'active' || s === 'expiring';
    return s === filter;
  });

  const statusOrder = { active: 0, expiring: 0, used: 1, sold: 1, expired: 2, listed: 0 };
  if (sort === 'expiry') {
    vouchers.sort((a, b) => {
      const sa = statusOrder[getStatus(a)] ?? 3;
      const sb = statusOrder[getStatus(b)] ?? 3;
      if (sa !== sb) return sa - sb;
      const da = a.expiryDate ? daysUntil(a.expiryDate) : Infinity;
      const db2 = b.expiryDate ? daysUntil(b.expiryDate) : Infinity;
      return da - db2;
    });
  } else if (sort === 'value') {
    vouchers.sort((a, b) => {
      const sa = statusOrder[getStatus(a)] ?? 3;
      const sb = statusOrder[getStatus(b)] ?? 3;
      if (sa !== sb) return sa - sb;
      return parseFloat(b.value || 0) - parseFloat(a.value || 0);
    });
  } else {
    vouchers.sort((a, b) => {
      const sa = statusOrder[getStatus(a)] ?? 3;
      const sb = statusOrder[getStatus(b)] ?? 3;
      if (sa !== sb) return sa - sb;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
  }

  const allV   = state.vouchers.filter(v => !giftedIds.has(v.id));
  const counts = { all: allV.length, active: 0, expiring: 0, expired: 0, used: 0, listed: 0, gifted: giftedIds.size + state.sentGifts.filter(g => g.status === 'claimed').length };
  allV.forEach(v => {
    const s = getStatus(v);
    if (s === 'active' || s === 'expiring') {
      counts.active++;
      if (s === 'expiring') counts.expiring++;
    } else if (s in counts) counts[s]++;
  });

  return `
  ${renderHeader('Wallet')}
  <main class="content">
    <div class="search-bar">
      <span class="search-icon">${icon.search}</span>
      <input type="search" placeholder="Search brand, code…" value="${esc(state.searchQuery)}" data-search="vouchers">
    </div>

    ${state.pendingGifts.length > 0 ? `
    <button type="button" class="pending-gifts-pill" data-nav="pending-gifts">
      ${icon.gift} ${state.pendingGifts.length} gift${state.pendingGifts.length !== 1 ? 's' : ''} sent, waiting to be claimed
    </button>
    ` : ''}

    <div class="wallet-filter-row">
      <select class="sort-select" data-status-select>
        ${[
          { id: 'all',      label: `All (${counts.all})` },
          { id: 'active',   label: `Active (${counts.active})` },
          { id: 'expiring', label: `Expiring (${counts.expiring})` },
          { id: 'expired',  label: `Expired (${counts.expired})` },
          { id: 'used',     label: `Used (${counts.used})` },
          { id: 'listed',   label: `Listed (${counts.listed})` },
          { id: 'gifted',   label: `Gifted (${counts.gifted})` },
        ].map(f => `<option value="${f.id}" ${filter===f.id?'selected':''}>${f.label}</option>`).join('')}
      </select>
      ${categoryFilterDropdown(['All', ...CATEGORIES], catFilter, 'wallet-cat', { style: 'flex:1' })}
    </div>

    <div class="wallet-sort-row">
      <span class="wallet-sort-icon">${icon.sort}</span>
      <select class="sort-select sort-select-quiet" data-sort>
        <option value="expiry" ${sort==='expiry'?'selected':''}>Soonest expiry</option>
        <option value="value"  ${sort==='value'?'selected':''}>Highest value</option>
        <option value="added"  ${sort==='added'?'selected':''}>Newest</option>
      </select>
    </div>

    ${vouchers.length > 0 || (filter === 'gifted' && claimedGifts.length > 0)
      ? `<div class="voucher-list">
          ${vouchers.map(v => voucherCard(v, filter === 'gifted')).join('')}
          ${filter === 'gifted' ? claimedGifts.map(g => claimedGiftCard(g)).join('') : ''}
        </div>`
      : `<div class="empty-state">
          <div class="empty-icon">${filter === 'gifted' ? icon.gift : (counts.all === 0 ? navIcons.vouchers : icon.search)}</div>
          <h3>${filter === 'gifted' ? 'No gifts sent yet' : (counts.all === 0 ? 'No vouchers yet' : 'No results found')}</h3>
          <p>${filter === 'gifted' ? 'Vouchers you gift will show here, including ones your friends have already claimed' : (counts.all === 0 ? 'Add vouchers to manage them in one place' : 'Try a different search or filter')}</p>
          ${counts.all === 0 && filter !== 'gifted' ? '<button class="btn btn-primary" data-action="add-voucher-menu">Add Your First Voucher</button>' : ''}
        </div>`
    }
  </main>
  <button class="fab" data-action="add-voucher-menu" title="Add voucher">${icon.plus}</button>
  ${renderBottomNav()}`;
}

/* ============================================================
   ATTACHMENT TILE (shared: server-rendered existing files +
   JS-inserted pending files use the same markup)
   ============================================================ */
export function attachmentTileHtml({ existingId, localId, path, kind, previewUrl }) {
  const removeAttr = existingId
    ? `data-action="remove-existing-file" data-file-id="${esc(existingId)}"`
    : `data-action="remove-pending-file" data-local-id="${esc(localId)}"`;
  const body = kind === 'pdf'
    ? `<div class="attachment-file-icon">${icon.file}<span>PDF</span></div>`
    : `<img class="attachment-thumb" ${previewUrl ? `src="${esc(previewUrl)}"` : `data-path="${esc(path)}"`} alt="Attachment">`;
  return `
  <div class="attachment-tile">
    ${body}
    <button type="button" class="attachment-remove" ${removeAttr} title="Remove">${closeIcon}</button>
  </div>`;
}

export function barcodeTileHtml({ path, previewUrl }) {
  return `
  <div class="barcode-tile">
    <img class="barcode-thumb" ${previewUrl ? `src="${esc(previewUrl)}"` : `data-path="${esc(path)}"`} alt="Barcode">
    <button type="button" class="attachment-remove" data-action="remove-barcode" title="Remove">${closeIcon}</button>
  </div>`;
}

// Shared by the initial template render and the imperative DOM updates in
// maybeAutoDetectBarcode/startVoucherScan, so a scan's status (in progress /
// found / not found) is never just... silent, wherever it's triggered from.
export function barcodePreviewHtml(v) {
  if (voucherFormState.pendingBarcode) return barcodeTileHtml({ previewUrl: voucherFormState.pendingBarcode.previewUrl });
  if (v?.barcodePath && !voucherFormState.barcodeRemoved) return barcodeTileHtml({ path: v.barcodePath });
  if (voucherFormState.barcodeScanState === 'scanning') return `<div class="barcode-scanning"><div class="scan-spinner-sm"></div><span>Scanning for a QR code…</span></div>`;
  if (voucherFormState.barcodeScanState === 'missing') return `<div class="barcode-not-found">${icon.info}<span>No QR code found in this photo — you can still add the code below by hand.</span></div>`;
  return '';
}

export function barcodeGroupVisible(v) {
  return !!(voucherFormState.pendingBarcode || (v?.barcodePath && !voucherFormState.barcodeRemoved) || voucherFormState.barcodeScanState);
}

// Not every voucher has a plain monetary value — some are for an experience
// or item ("weekend getaway for two"). The two panels below share one
// visible field at a time, switched client-side (see 'set-value-mode' in
// handleAction) so unsaved input elsewhere in the form is never lost to a
// re-render.
function valueFieldsHtml(v) {
  const mode = v?.valueDescription ? 'description' : 'amount';
  return `
  <div class="form-group" style="margin-bottom:8px">
    <label>Value <span style="color:var(--warning)">*</span></label>
    <div class="value-mode-toggle">
      <button type="button" class="value-mode-btn ${mode === 'amount' ? 'active' : ''}" data-action="set-value-mode" data-mode="amount">€ Amount</button>
      <button type="button" class="value-mode-btn ${mode === 'description' ? 'active' : ''}" data-action="set-value-mode" data-mode="description">Describe it</button>
    </div>
    <input type="hidden" name="valueMode" value="${mode}">
    <div id="value-amount-panel" ${mode === 'description' ? 'style="display:none"' : ''}>
      <input type="text" name="amount" placeholder="50,00" value="${esc(v?.value||'')}">
    </div>
    <div id="value-description-panel" ${mode === 'amount' ? 'style="display:none"' : ''}>
      <input type="text" name="valueDescription" placeholder="e.g. Weekend getaway for two, Movie ticket" value="${esc(v?.valueDescription||'')}" maxlength="150">
    </div>
  </div>`;
}

// Personal gift note — kept collapsed and out of the way for the (more
// common) plain voucher, so it never feels like a mandatory form field; it
// only opens up when there's actually a note to add.
function giftNoteFieldsHtml(v) {
  const hasNote = !!(v?.giftMessage || v?.giftSender);
  return `
  <div class="form-group">
    <div class="gift-note-prompt" data-action="toggle-gift-note" role="button" tabindex="0" ${hasNote ? 'style="display:none"' : ''}>
      <span class="gift-note-prompt-icon">💌</span>
      <div>
        <div class="gift-note-prompt-title">Add a personal message</div>
        <div class="gift-note-prompt-hint">Was this a gift? Save the note and who it's from</div>
      </div>
    </div>
    <div class="gift-note-card" id="gift-note-fields" ${hasNote ? '' : 'style="display:none"'}>
      <div class="gift-note-card-header">
        <span>💌 A personal note</span>
        <button type="button" class="gift-note-remove" data-action="remove-gift-note" title="Remove note">${closeIcon}</button>
      </div>
      <textarea name="giftMessage" class="gift-note-textarea" placeholder="Happy Birthday! Enjoy 🎉" rows="3" maxlength="500">${esc(v?.giftMessage||'')}</textarea>
      <input type="text" name="giftSender" class="gift-note-sender" placeholder="From… (e.g. Mom, Sarah &amp; Tom)" value="${esc(v?.giftSender||'')}" maxlength="100">
    </div>
  </div>`;
}

/* ============================================================
   VIEW: VOUCHER FORM (add / edit)
   ============================================================ */
export function viewVoucherForm() {
  const id = state.params.id;
  const v  = id ? state.vouchers.find(x => x.id === id) : null;
  const title = v ? 'Edit Voucher' : 'Add Voucher';

  return `
  ${renderHeader(title, id ? 'voucher-detail' : 'vouchers', id ? { id } : {})}
  <main class="content">
    <form id="form-voucher" autocomplete="off">
      ${v ? `<input type="hidden" name="voucherId" value="${esc(v.id)}">` : ''}
      <div class="form-group" id="barcode-group" ${barcodeGroupVisible(v) ? '' : 'style="display:none"'}>
        <label>QR Code</label>
        <div id="barcode-preview">${barcodePreviewHtml(v)}</div>
        <span class="form-hint">Auto-detected from your photo. Shown at the top of this voucher for quick scanning</span>
      </div>

      <div class="form-group">
        <label>Brand / Store <span style="color:var(--warning)">*</span></label>
        ${brandAutocomplete(v?.brand || '')}
      </div>

      <div class="form-group">
        <label>Photos or Files</label>
        <div class="attachment-grid" id="attachment-grid">
          ${state.voucherFiles.map(f => attachmentTileHtml({ existingId: f.id, path: f.file_path, kind: f.file_type })).join('')}
          ${voucherFormState.pendingNewFiles.map(f => attachmentTileHtml({ localId: f.localId, kind: f.kind, previewUrl: f.previewUrl })).join('')}
          <div class="attachment-tile attachment-add" data-action="pick-photo" role="button" tabindex="0">
            ${icon.camera}
            <span>Add</span>
          </div>
        </div>
        <input type="file" id="voucher-file-input" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf" multiple style="display:none">
        <span class="form-hint">Front &amp; back photos, or a PDF (JPG, PNG, WEBP, HEIC or PDF, max 10MB each)</span>
      </div>

      ${valueFieldsHtml(v)}

      <div class="form-group" id="balance-group" ${v?.valueDescription ? 'style="display:none"' : ''}>
        <label>Remaining Balance</label>
        <input type="text" name="balance" placeholder="Leave blank if full value remains" value="${esc(v?.balance??'')}">
        <span class="form-hint">Fill in only when a partial amount has already been used</span>
      </div>

      <div class="form-group" style="margin-top:8px">
        <label>Expiry Date</label>
        <div class="date-field-row">
          <input type="date" name="expiryDate" id="voucher-expiry-input" value="${esc(v?.expiryDate||'')}">
          <button type="button" class="btn btn-ghost btn-sm" data-action="clear-expiry-date">Clear</button>
        </div>
        <span class="form-hint">Leave blank if this voucher doesn't expire</span>
      </div>

      <div class="form-group" style="margin-top:8px;margin-bottom:8px">
        <label>Voucher Code</label>
        <input type="text" name="code" placeholder="e.g. SUMMER2024" value="${esc(v?.code||'')}">
        <span class="form-hint">The code you enter at checkout</span>
      </div>

      <div class="form-group">
        <label>PIN</label>
        <input type="text" name="pin" placeholder="Optional PIN or security code" value="${esc(v?.pin||'')}">
      </div>

      <div class="form-group" style="margin-top:8px">
        <label>Notes / Terms &amp; Conditions</label>
        <textarea name="notes" placeholder="Any extra info, or the voucher's terms &amp; conditions…" rows="3">${esc(v?.notes||'')}</textarea>
      </div>

      <div style="margin-top:12px">
        ${giftNoteFieldsHtml(v)}
      </div>

      <div style="display:flex;gap:10px;margin-top:8px">
        <div class="form-group" style="flex:1;margin-bottom:0">
          <label>Category</label>
          <select name="category">
            ${CATEGORIES.map(c => `<option value="${c}" ${(v?.category||'Other')===c?'selected':''}>${c}</option>`).join('')}
          </select>
        </div>
        <div class="form-group" style="flex:1;margin-bottom:0">
          <label>Voucher Type</label>
          <select name="voucherType">
            <option value="gift_card" ${(v?.voucherType||'gift_card')==='gift_card'?'selected':''}>Gift Card</option>
            <option value="store_credit" ${v?.voucherType==='store_credit'?'selected':''}>Store Credit</option>
          </select>
        </div>
      </div>

      <div style="display:flex;gap:10px;margin-top:24px">
        <button type="button" class="btn btn-ghost btn-full" data-nav="${id ? 'voucher-detail' : 'vouchers'}" ${id ? `data-id="${esc(id)}"` : ''}>Cancel</button>
        <button type="submit" class="btn btn-primary btn-full">${v ? 'Save Changes' : 'Add Voucher'}</button>
      </div>
    </form>
  </main>
  ${renderBottomNav()}`;
}

/* ============================================================
   VIEW: VOUCHER DETAIL
   ============================================================ */
export function viewVoucherDetail() {
  const id = state.params.id;
  const v  = state.vouchers.find(x => x.id === id);
  if (!v) return viewVouchers();

  const s = getStatus(v);
  const days = v.expiryDate ? daysUntil(v.expiryDate) : null;

  let expiryInfo = 'N/A';
  if (days !== null) {
    if (days < 0)        expiryInfo = `<span class="text-danger">Expired ${Math.abs(days)} day${Math.abs(days)!==1?'s':''} ago</span>`;
    else if (days === 0) expiryInfo = `<span class="text-warning fw-600">Expires today!</span>`;
    else if (days <= 7)  expiryInfo = `<span class="text-warning fw-600">In ${days} day${days!==1?'s':''}</span>`;
    else                 expiryInfo = `<span>${formatDate(v.expiryDate)}</span>`;
  }

  const isOwn = v.userId === state.currentUser.id;
  const rightAction = isOwn
    ? `<button class="btn-icon" data-nav="voucher-form" data-id="${esc(id)}" title="Edit">${icon.edit}</button>`
    : '';

  return `
  ${renderHeader(v.brand, 'vouchers', {}, rightAction)}
  <main class="content">
    <div class="voucher-detail-header">
      <div class="vd-brand">${esc(v.brand)}</div>
      <div class="vd-value${v.valueDescription ? ' vd-value-text' : ''}">${formatVoucherValue(v, v.balance != null ? v.balance : v.value)}</div>
      <div class="vd-status">${badge(s)}</div>
    </div>

    ${v.giftMessage || v.giftSender ? `
    <div class="gift-note-display">
      <div class="gift-note-display-icon">💌</div>
      ${v.giftMessage ? `<p class="gift-note-display-message">${esc(v.giftMessage)}</p>` : ''}
      ${v.giftSender ? `<p class="gift-note-display-sender">From ${esc(v.giftSender)}</p>` : ''}
    </div>
    ` : ''}

    ${v.barcodePath ? `
    <div class="barcode-display">
      <img data-path="${esc(v.barcodePath)}" alt="Barcode">
    </div>
    ` : ''}

    ${state.voucherFiles.length ? `
    <div class="attachment-list">
      ${state.voucherFiles.map((f, i) => `
      <button type="button" class="attachment-row" data-action="view-attachment" data-path="${esc(f.file_path)}">
        <span class="attachment-row-icon">${f.file_type === 'pdf' ? icon.file : icon.camera}</span>
        <span class="attachment-row-label">${f.file_type === 'pdf' ? 'PDF document' : `Photo ${i + 1}`}</span>
        <span class="attachment-row-view">${icon.eye} View</span>
      </button>`).join('')}
    </div>
    ` : ''}

    ${v.code ? `
    <p class="code-label">Voucher Code</p>
    <div class="code-display">
      <span class="code-text">${esc(v.code)}</span>
      <button class="btn btn-secondary btn-sm" data-action="copy-voucher-code" data-id="${esc(id)}" data-copy="${esc(v.code)}">${icon.copy} Copy</button>
    </div>
    ${(v.copyCount || 0) > 0 ? `<p class="text-xs text-muted" style="margin-top:4px;margin-left:2px">Copied ${v.copyCount} time${v.copyCount!==1?'s':''}</p>` : ''}
    ` : ''}

    ${v.pin ? `
    <p class="code-label" style="margin-top:10px">PIN</p>
    <div class="code-display">
      <span class="code-text">${esc(v.pin)}</span>
      <button class="btn btn-secondary btn-sm" data-action="copy" data-copy="${esc(v.pin)}" data-copied-label="PIN copied">${icon.copy} Copy</button>
    </div>
    ` : ''}

    <div class="detail-grid" style="margin-top:16px">
      <div class="detail-item">
        <div class="detail-item-label">Expiry Date</div>
        <div class="detail-item-value">${expiryInfo}</div>
      </div>
      <div class="detail-item">
        <div class="detail-item-label">Status</div>
        <div class="detail-item-value">${badge(s)}</div>
      </div>
      ${v.valueDescription ? `
      <div class="detail-item" style="grid-column:span 2">
        <div class="detail-item-label">Value</div>
        <div class="detail-item-value" style="font-weight:400;font-size:0.875rem">${esc(v.valueDescription)}</div>
      </div>
      ` : `
      <div class="detail-item">
        <div class="detail-item-label">Original Value</div>
        <div class="detail-item-value detail-item-value-money">${formatCurrency(v.value, v.currency)}</div>
      </div>
      <div class="detail-item">
        <div class="detail-item-label">Remaining Balance</div>
        <div class="detail-item-value detail-item-value-money">${v.balance != null ? formatCurrency(v.balance, v.currency) : formatCurrency(v.value, v.currency)}</div>
      </div>
      `}
      <div class="detail-item">
        <div class="detail-item-label">Category</div>
        <div class="detail-item-value">${esc(v.category || 'Other')}</div>
      </div>
      <div class="detail-item">
        <div class="detail-item-label">Type</div>
        <div class="detail-item-value">${v.voucherType === 'store_credit' ? 'Store Credit' : 'Gift Card'}</div>
      </div>
      ${v.notes ? `
      <div class="detail-item" style="grid-column:span 2">
        <div class="detail-item-label">Notes</div>
        <div class="detail-item-value" style="font-weight:400;font-size:0.875rem">${esc(v.notes)}</div>
      </div>` : ''}
    </div>

    ${isOwn ? `
    <div class="action-row">
      ${s === 'used' || s === 'sold'
        ? `<button class="btn btn-ghost" data-action="mark-unused" data-id="${esc(id)}">${icon.undo} Mark Active</button>`
        : `<button class="btn btn-secondary" data-action="mark-used" data-id="${esc(id)}">Mark Used</button>`
      }
      ${s === 'listed'
        ? `<button class="btn btn-ghost" data-action="unlist" data-id="${esc(id)}">${icon.tag} Remove Listing</button>`
        : (s === 'active' || s === 'expiring') && !v.valueDescription
          ? `<button class="btn btn-secondary" data-action="show-sell" data-id="${esc(id)}">${icon.tag} Sell</button>`
          : ''
      }
      ${s === 'active' || s === 'expiring'
        ? `<button class="btn btn-secondary" data-action="send-gift" data-id="${esc(id)}">${icon.gift} Gift</button>`
        : ''
      }
    </div>

    ${s !== 'used' && s !== 'sold' && !v.valueDescription ? `
    <div style="margin-top:10px">
      <button class="btn btn-secondary btn-full" data-action="show-deduct" data-id="${esc(id)}">
        ${icon.tag} Deduct Amount Used
      </button>
    </div>
    ` : ''}

    <div class="divider"></div>
    <button class="btn btn-danger btn-full" data-action="confirm-delete" data-id="${esc(id)}">${icon.trash} Delete Voucher</button>
    ` : ''}
  </main>
  ${renderBottomNav()}`;
}
