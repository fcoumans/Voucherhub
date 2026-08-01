// Home dashboard, wallet list, voucher form (add/edit), and voucher detail
// — including the inline Sell/Gift/Reminder action buttons and forms on the
// detail page (their submit handlers live in app.js's event listeners for
// now; this module only renders the markup).
//
import { state, CATEGORIES } from '../../core/state.js';
import { esc, daysUntil, formatDate, formatCurrency, initial } from '../../core/dom.js';
import { icon, avatar, renderHeader, renderBottomNav, navIcons, brandAutocomplete } from '../../core/ui.js';
import { voucherFormState } from './voucher-form-state.js';
import { formatVoucherValue, getStatus, formatMonthYear, STATUS_LABEL, STATUS_CLASS } from './vouchers.js';
import { nowDateTimeLocalStr, defaultReminderDateTimeStr } from '../notifications/reminders.js';

const badge = (status) =>
  `<span class="badge ${STATUS_CLASS[status] || 'badge-gray'}">${STATUS_LABEL[status] || esc(status)}</span>`;

// Small authored "×" glyph used on remove/dismiss buttons — replaces the
// literal "✕" text character so these read as drawn icons (2px stroke,
// round caps) consistent with the rest of the icon system, not a unicode
// glyph standing in for one.
const closeIcon = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

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
  ${renderHeader('VoucherWise')}
  <main class="content">
    <div class="home-header">
      <div>
        <p class="greeting">${greeting},</p>
        <h2>${esc(state.currentUser.name.split(' ')[0])}</h2>
      </div>
      <button class="btn-icon" data-nav="profile" style="border-radius:50%;position:relative">
        <div class="avatar" style="background:linear-gradient(150deg,#D6710A 0%,#F98513 100%);width:38px;height:38px;font-size:15px">
          ${esc(initial(state.currentUser.name))}
        </div>
        ${state.pendingRequests.length > 0 ? `<span style="position:absolute;top:-2px;right:-2px;width:10px;height:10px;background:var(--danger);border-radius:50%;border:1.5px solid #fff"></span>` : ''}
      </button>
    </div>


    <div class="stats-card">
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
        <span class="stat-value ${expiring.length > 0 ? 'text-warning' : ''}">${expiring.length}</span>
        <span class="stat-label">Expiring</span>
      </div>
    </div>

    ${expiring.length > 0 ? `
    <section class="home-section">
      <h3 class="section-title">${icon.clock} Expiring Soon</h3>
      <div class="voucher-list" style="margin-top:10px">
        ${expiring.map(v => voucherCard(v)).join('')}
      </div>
    </section>
    ` : ''}

    <section class="home-section">
      <h3 class="section-title">Quick Actions</h3>
      <div class="quick-actions" style="margin-top:10px">
        <button class="quick-action" data-action="add-voucher-menu">
          <div class="qa-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/><line x1="12" y1="14" x2="12" y2="18"/><line x1="10" y1="16" x2="14" y2="16"/></svg>
          </div>
          <span>Add Voucher</span>
        </button>
        <button class="quick-action" data-nav="marketplace">
          <div class="qa-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>
          </div>
          <span>Marketplace</span>
        </button>
        <button class="quick-action" data-nav="friends">
          <div class="qa-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
          </div>
          <span>Friends</span>
        </button>
      </div>
    </section>

    ${active.length > 0 ? `
    <section class="home-section">
      <div class="section-header">
        <h3 class="section-title">My Wallet</h3>
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
      <div class="vc-code">${v.code ? '•••• ' + esc(v.code.slice(-4)) : '<span style="opacity:0.5">No code</span>'}</div>
      ${isGifted ? `<div class="vc-listed-hint">Tap to manage gift</div>`
        : s === 'listed' ? `<div class="vc-listed-hint">Tap to unlist</div>`
        : v.giftMessage || v.giftSender ? `<div class="vc-note-hint">💌 Has a note</div>` : ''}
    </div>
    <div class="vc-right">
      <div class="vc-value${v.valueDescription ? ' vc-value-text' : ''}">${formatVoucherValue(v, displayAmount, false)}</div>
      <div class="vc-meta">${expiryMeta}</div>
      ${v.expiryDate ? `<div style="font-size:0.7rem;color:var(--text-muted);margin-top:2px">${formatMonthYear(v.expiryDate)}</div>` : ''}
    </div>
  </div>`;
}

export function viewVouchers() {
  const q      = state.searchQuery.toLowerCase();
  const filter = state.activeFilter;
  const sort   = state.activeSort;
  // Vouchers with a pending gift are hidden from the normal wallet — they
  // live in the Pending Gifts list until claimed or cancelled.
  const giftedIds = new Set(state.pendingGifts.map(g => g.voucher_id));
  let vouchers = filter === 'gifted'
    ? state.vouchers.filter(v => giftedIds.has(v.id))
    : state.vouchers.filter(v => !giftedIds.has(v.id));

  if (q) vouchers = vouchers.filter(v => v.brand.toLowerCase().includes(q) || (v.code||'').toLowerCase().includes(q));
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
  const counts = { all: allV.length, active: 0, expiring: 0, expired: 0, used: 0, listed: 0, gifted: giftedIds.size };
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
      ${icon.gift} ${state.pendingGifts.length} pending gift${state.pendingGifts.length !== 1 ? 's' : ''}, waiting to be claimed
    </button>
    ` : ''}

    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
      <div class="filter-chips" style="flex:1;margin-bottom:0">
        ${[
          { id: 'all',      label: `All (${counts.all})` },
          { id: 'active',   label: `Active (${counts.active})` },
          { id: 'expiring', label: `Expiring (${counts.expiring})` },
          { id: 'expired',  label: `Expired (${counts.expired})` },
          { id: 'used',     label: `Used (${counts.used})` },
          { id: 'listed',   label: `Listed (${counts.listed})` },
          { id: 'gifted',   label: `Gifted (${counts.gifted})` },
        ].map(f => `<button class="chip ${filter === f.id ? 'active' : ''}" data-filter="${f.id}">${f.label}</button>`).join('')}
      </div>
      <select class="sort-select" data-sort title="Sort">
        <option value="expiry" ${sort==='expiry'?'selected':''}>Soonest expiry</option>
        <option value="value"  ${sort==='value'?'selected':''}>Highest value</option>
        <option value="added"  ${sort==='added'?'selected':''}>Newest</option>
      </select>
    </div>

    ${vouchers.length > 0
      ? `<div class="voucher-list">${vouchers.map(v => voucherCard(v, filter === 'gifted')).join('')}</div>`
      : `<div class="empty-state">
          <div class="empty-icon">${filter === 'gifted' ? icon.gift : (counts.all === 0 ? navIcons.vouchers : icon.search)}</div>
          <h3>${filter === 'gifted' ? 'No pending gifts' : (counts.all === 0 ? 'No vouchers yet' : 'No results found')}</h3>
          <p>${filter === 'gifted' ? 'Vouchers you gift will show here until claimed' : (counts.all === 0 ? 'Add vouchers to manage them in one place' : 'Try a different search or filter')}</p>
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
    <label>Value <span style="color:var(--danger)">*</span></label>
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
        <label>Brand / Store <span style="color:var(--danger)">*</span></label>
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
  const showSellForm     = state.params.sellForm;
  const showReminderForm = state.params.reminderForm;
  const showDeductForm   = state.params.deductForm;

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

  const activeReminder = state.reminders.find(r => r.voucherId === id && !r.dismissed);

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

    ${activeReminder ? `
    <div class="reminder-info-bar">
      ${icon.bell}
      <span>Reminder set for <strong>${formatDate(activeReminder.reminderDate)}</strong>${activeReminder.reminderTime ? ` at ${activeReminder.reminderTime}` : ''}</span>
      <button class="btn-icon" data-action="dismiss-reminder" data-id="${esc(activeReminder.id)}" title="Remove reminder" style="margin-left:auto;opacity:0.6">${closeIcon}</button>
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
      <button class="btn btn-secondary btn-sm" data-action="copy" data-copy="${esc(v.pin)}" data-toast="PIN copied!">${icon.copy} Copy</button>
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
        : `<button class="btn btn-success" data-action="mark-used" data-id="${esc(id)}">${icon.check} Mark Used</button>`
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
      <button class="btn btn-ghost btn-full" data-action="${showDeductForm ? 'hide-deduct' : 'show-deduct'}" data-id="${esc(id)}">
        ${icon.tag} ${showDeductForm ? 'Cancel' : 'Deduct Amount Used'}
      </button>
    </div>

    ${showDeductForm ? `
    <div class="sell-form" style="margin-top:12px">
      <form id="form-deduct">
        <input type="hidden" name="voucherId" value="${esc(id)}">
        <div class="form-group">
          <label>Amount spent (${v.currency||'EUR'}) <span style="color:var(--danger)">*</span></label>
          <input type="text" name="amount" placeholder="e.g. 12,50" required autofocus>
          <span class="form-hint">Remaining: ${formatCurrency(v.balance ?? v.value, v.currency)}</span>
        </div>
        <div style="display:flex;gap:10px">
          <button type="button" class="btn btn-ghost" data-action="hide-deduct">Cancel</button>
          <button type="submit" class="btn btn-primary btn-full">Update Balance</button>
        </div>
      </form>
    </div>
    ` : ''}
    ` : ''}

    ${s !== 'expired' && s !== 'used' && s !== 'sold' ? `
    <div style="margin-top:10px">
      <button class="btn btn-ghost btn-full" data-action="${showReminderForm ? 'hide-reminder' : 'show-reminder'}" data-id="${esc(id)}">
        ${icon.bell} ${showReminderForm ? 'Cancel' : 'Schedule Reminder'}
      </button>
    </div>
    ` : ''}

    ${showReminderForm ? `
    <div class="sell-form" style="margin-top:12px">
      <form id="form-reminder">
        <input type="hidden" name="voucherId" value="${esc(id)}">
        <div class="form-group" style="margin-bottom:8px">
          <label>When should we remind you?</label>
          <input type="datetime-local" name="reminderDateTime" required
            min="${nowDateTimeLocalStr()}"
            value="${defaultReminderDateTimeStr()}">
        </div>
        <p class="form-hint" style="margin-bottom:12px;font-size:0.75rem">
          ${icon.bell} Push notification at this time${v.expiryDate ? ` · Expires ${formatDate(v.expiryDate)}` : ''}
        </p>
        <div style="display:flex;gap:8px">
          <button type="button" class="btn btn-ghost" data-action="hide-reminder" style="flex:0 0 auto">Cancel</button>
          <button type="submit" class="btn btn-primary btn-full">Save Reminder</button>
        </div>
      </form>
    </div>
    ` : ''}

    ${showSellForm ? `
    <div class="sell-form">
      <div class="sell-hint">${icon.info} Buyer contacts you by email. No payment processing in MVP.</div>
      <form id="form-sell">
        <input type="hidden" name="voucherId" value="${esc(id)}">
        <div class="form-group">
          <label>Selling Price (${v.currency||'EUR'}) <span style="color:var(--danger)">*</span></label>
          <input type="text" name="price" placeholder="e.g. 40,00" required>
          <span class="form-hint">Original value: ${formatCurrency(v.value, v.currency)}</span>
        </div>
        <div class="form-group">
          <label>Who can see this listing?</label>
          <select name="visibility">
            <option value="public">Public (visible to everyone browsing the marketplace)</option>
            <option value="friends_only">Trusted Community only (friends &amp; friends of friends)</option>
          </select>
          <span class="form-hint">Trusted Community listings never appear in public Browse</span>
        </div>
        <div style="display:flex;gap:10px">
          <button type="button" class="btn btn-ghost" data-action="hide-sell">Cancel</button>
          <button type="submit" class="btn btn-primary btn-full">List for Sale</button>
        </div>
      </form>
    </div>
    ` : ''}

    <div class="divider"></div>
    <button class="btn btn-danger btn-full" data-action="confirm-delete" data-id="${esc(id)}">${icon.trash} Delete Voucher</button>
    ` : ''}
  </main>
  ${renderBottomNav()}`;
}
