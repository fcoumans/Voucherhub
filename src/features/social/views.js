// Pending Gifts (sent, unclaimed) and Friends list/requests.
import { state } from '../../core/state.js';
import { esc, formatCurrency, formatDate, initial } from '../../core/dom.js';
import { icon, renderHeader, renderBottomNav } from '../../core/ui.js';

const brandColor = () => '#13B5A2';

/* ============================================================
   VIEW: PENDING GIFTS
   ============================================================ */
export function viewPendingGifts() {
  const rows = state.pendingGifts.map(g => {
    const v = state.vouchers.find(x => x.id === g.voucher_id);
    if (!v) return '';
    return `
    <div class="card" style="margin-bottom:10px;padding:14px">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
        <div>
          <div style="font-weight:700">${esc(v.brand)}</div>
          <div class="text-muted text-xs">${formatCurrency(v.value, v.currency, false)} · sent ${formatDate(g.created_at?.slice(0, 10))}</div>
        </div>
        <div style="display:flex;gap:8px">
          <button type="button" class="btn btn-secondary btn-sm" data-action="show-gift-qr" data-id="${esc(g.id)}" data-voucher-id="${esc(v.id)}">${icon.link} Link</button>
          <button type="button" class="btn btn-ghost btn-sm" data-action="cancel-gift" data-id="${esc(g.id)}">${icon.trash} Cancel</button>
        </div>
      </div>
    </div>`;
  }).join('');

  return `
  ${renderHeader('Pending Gifts', 'vouchers')}
  <main class="content">
    <p class="text-muted text-xs" style="margin-bottom:14px">Vouchers you've sent that a friend hasn't claimed yet. Cancel to bring one back into your wallet.</p>
    ${rows || `<div class="empty-state">
      <div class="empty-icon">${icon.gift}</div>
      <h3>No pending gifts</h3>
      <p>Open a voucher and tap "Gift" to send it to a friend.</p>
    </div>`}
  </main>
  ${renderBottomNav()}`;
}

/* ============================================================
   VIEW: FRIENDS
   ============================================================ */
export function viewFriends() {
  const friends  = state.friends;
  const pending  = state.pendingRequests;

  return `
  ${renderHeader('Friends', 'profile')}
  <main class="content">
    <form id="form-add-friend">
      <div class="form-group">
        <label>Send Friend Request</label>
        <div style="display:flex;gap:8px">
          <input type="email" name="email" placeholder="friend@example.com" style="flex:1;padding:11px 14px;border:1.5px solid var(--border);border-radius:10px;font-size:0.9375rem;outline:none">
          <button type="submit" class="btn btn-primary">${icon.plus2} Send</button>
        </div>
        <span class="form-hint">They must have a VoucherWise account. They will need to accept your request.</span>
        <div id="friend-error" class="error-msg" style="display:none;margin-top:8px"></div>
      </div>
    </form>

    ${pending.length > 0 ? `
    <div class="divider"></div>
    <h3 style="margin-bottom:12px">Pending requests (${pending.length})</h3>
    <div class="settings-list">
      ${pending.map(r => `
      <div class="settings-item">
        <div class="si-icon" style="background:${brandColor(r.name)};border-radius:10px">
          <span style="color:white;font-weight:700;font-size:14px">${esc(initial(r.name))}</span>
        </div>
        <div class="si-text">
          <div class="si-title">${esc(r.name)}</div>
          <div class="si-subtitle">${esc(r.email)}</div>
        </div>
        <div style="display:flex;gap:6px">
          <button class="btn btn-sm btn-primary" data-action="accept-request" data-id="${esc(r.id)}">Accept</button>
          <button class="btn btn-sm btn-danger"  data-action="decline-request" data-id="${esc(r.id)}">Decline</button>
        </div>
      </div>`).join('')}
    </div>` : ''}

    <div class="divider"></div>

    <h3 style="margin-bottom:12px">Friends (${friends.length})</h3>

    ${friends.length > 0
      ? `<div class="settings-list">
          ${friends.map(f => `
          <div class="settings-item">
            <div class="si-icon" style="background:${brandColor(f.name)};border-radius:10px">
              <span style="color:white;font-weight:700;font-size:14px">${esc(initial(f.name))}</span>
            </div>
            <div class="si-text">
              <div class="si-title">${esc(f.name)}</div>
              <div class="si-subtitle">${esc(f.email)}</div>
            </div>
            <button class="btn btn-sm btn-danger" data-action="unfollow" data-id="${esc(f.id)}">Remove</button>
          </div>`).join('')}
        </div>`
      : `<div class="empty-state" style="padding:32px 0">
           <div class="empty-icon">${icon.users}</div>
           <h3>No friends yet</h3>
           <p>Send a friend request by entering their email above</p>
         </div>`
    }
  </main>
  ${renderBottomNav()}`;
}
