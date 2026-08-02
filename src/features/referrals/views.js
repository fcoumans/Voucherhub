// Referral codes browse (public/friends/mine tabs, brand grid + drill-down)
// and the add/edit form.
import { state, CATEGORIES } from '../../core/state.js';
import { esc } from '../../core/dom.js';
import { getBrandDescription } from '../../core/brands.js';
import { icon, avatar, renderHeader, renderBottomNav, navIcons, brandAutocomplete } from '../../core/ui.js';
import { categoryBadge, categoryFilterDropdown } from '../../core/categories.js';

/* ============================================================
   VIEW: REFERRALS
   ============================================================ */
function referralCard(r, isOwn = false) {
  const vote = state.referralVotes[r.id] || null;
  const usedByMe = state.myReferralUses.has(r.id);
  return `
  <div class="referral-card">
    <div class="rc-header">
      ${avatar(r.brand, 40)}
      <div class="rc-info">
        <div class="rc-brand">${esc(r.brand)}</div>
        <div class="rc-owner">${isOwn ? 'Your code' : esc(r.ownerName || 'Community')}
          ${r.visibility === 'friends' ? ' · <span class="badge badge-primary" style="font-size:0.6rem;padding:2px 5px">Friends</span>' : ''}
        </div>
        ${r.category ? `<div style="margin-top:5px">${categoryBadge(r.category)}</div>` : ''}
      </div>
      <div style="display:flex;align-items:center;gap:4px">
        ${isOwn ? `
          <button class="btn-icon" data-action="edit-referral" data-id="${esc(r.id)}" title="Edit">${icon.edit}</button>
          <button class="btn-icon" style="color:var(--danger)" data-action="delete-referral" data-id="${esc(r.id)}" title="Delete">${icon.trash}</button>
        ` : ''}
      </div>
    </div>
    <div class="rc-code-row">
      <span class="rc-code">${esc(r.code)}</span>
      <button class="btn btn-secondary btn-sm" data-action="copy" data-copy="${esc(r.code)}" data-copied-label="Code copied">${icon.copy} Copy</button>
    </div>
    ${r.link ? `<a href="${esc(r.link)}" target="_blank" rel="noopener" class="btn btn-outline btn-sm btn-full" style="margin-bottom:8px">${icon.link} Open Referral Link</a>` : ''}
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px">
      <div class="rc-benefits">
        ${r.benefitNew      ? `<span class="rc-benefit">New user: ${esc(r.benefitNew)}</span>` : ''}
        ${r.benefitReferrer ? `<span class="rc-benefit">Referrer: ${esc(r.benefitReferrer)}</span>` : ''}
      </div>
      <div class="usage-count">
        ${icon.users} <span>${r.usedCount || 0} use${(r.usedCount||0)!==1?'s':''}</span>
      </div>
    </div>
    ${!isOwn ? `
    <div style="display:flex;gap:6px;align-items:center;margin-top:8px;flex-wrap:wrap">
      <button class="btn btn-sm ${usedByMe?'btn-success':''}" style="padding:4px 10px;gap:5px;${usedByMe?'background:var(--success-light);color:var(--success)':'background:var(--gray-light)'};border-radius:6px" data-action="increment-referral" data-id="${esc(r.id)}" title="${usedByMe ? 'Remove your use mark' : 'Mark that you used this code'}">${usedByMe ? icon.check : ''}${usedByMe ? 'Used' : '+1 Use'}</button>
      <button class="btn btn-sm ${vote==='up'?'btn-success':'btn-ghost'}" style="padding:3px 10px;gap:5px;font-size:0.8rem" data-action="vote-referral" data-id="${esc(r.id)}" data-vote="up" title="Works for me">${icon.thumbsUp} Works</button>
      <button class="btn btn-sm ${vote==='down'?'btn-danger':'btn-ghost'}" style="padding:3px 10px;gap:5px;font-size:0.8rem" data-action="vote-referral" data-id="${esc(r.id)}" data-vote="down" title="Doesn't work">${icon.thumbsDown} Expired</button>
    </div>
    ` : ''}
    <div class="rc-terms"><strong>Terms &amp; Conditions:</strong> ${r.terms ? esc(r.terms) : 'No terms specified'}</div>
  </div>`;
}

export function viewReferrals() {
  const tab       = state.referralTab || 'public';
  const q         = state.searchQuery.toLowerCase();
  const uid       = state.currentUser.id;
  const friendIds = state.friendIds;
  const all       = state.referrals;
  const brand     = state.referralBrandFilter;
  const catFilter = state.referralCategoryFilter || 'All';

  // Pool of referrals visible to the current user (before brand/search filter)
  let pool = [];
  if (tab === 'public') {
    pool = all.filter(r => r.visibility === 'public');
  } else if (tab === 'friends') {
    // All non-private codes from friends (they can see public + friends-only)
    pool = all.filter(r => friendIds.includes(r.userId) || (r.userId === uid && r.visibility === 'friends'));
  } else {
    pool = all.filter(r => r.userId === uid);
  }

  // Tab counts scope to the selected brand once you've drilled into one, or
  // to the selected category chip while still browsing the brand grid.
  const countPool    = brand
    ? all.filter(r => r.brand === brand)
    : catFilter !== 'All' ? all.filter(r => r.category === catFilter) : all;
  const myCount      = countPool.filter(r => r.userId === uid).length;
  const friendsCount = countPool.filter(r => friendIds.includes(r.userId) || (r.userId === uid && r.visibility === 'friends')).length;
  const publicCount  = countPool.filter(r => r.visibility === 'public').length;

  const tabs = `
  <div class="inline-tabs" style="margin-bottom:12px">
    <button class="inline-tab ${tab==='public'?'active':''}" data-referral-tab="public">Public (${publicCount})</button>
    <button class="inline-tab ${tab==='friends'?'active':''}" data-referral-tab="friends">Friends (${friendsCount})</button>
    <button class="inline-tab ${tab==='mine'?'active':''}" data-referral-tab="mine">Mine (${myCount})</button>
  </div>`;

  /* ---- CODE LIST (brand drill-down) ---- */
  if (brand) {
    let visible = pool.filter(r => r.brand === brand);
    if (q) visible = visible.filter(r => r.code.toLowerCase().includes(q) || r.brand.toLowerCase().includes(q));
    visible = [...visible].sort((a, b) => (b.usedCount || 0) - (a.usedCount || 0));
    const brandDesc = getBrandDescription(brand);

    return `
    <header class="app-header">
      <div class="header-left"><button class="btn-back" data-action="clear-referral-brand">${icon.back}</button></div>
      <span class="header-title">${esc(brand)}</span>
      <div class="header-right"></div>
    </header>
    <main class="content">
      ${brandDesc ? `<p class="text-muted" style="font-size:0.875rem;margin-bottom:14px">${esc(brandDesc)}</p>` : ''}
      ${tabs}
      <div class="search-bar" style="margin-bottom:16px">
        <span class="search-icon">${icon.search}</span>
        <input type="search" placeholder="Search code…" value="${esc(state.searchQuery)}" data-search="referrals">
      </div>
      <button class="btn btn-ghost btn-sm" style="margin-bottom:12px" data-action="clear-referral-brand">← All brands</button>
      ${visible.length > 0
        ? visible.map(r => referralCard(r, r.userId === uid)).join('')
        : `<div class="empty-state"><div class="empty-icon">${navIcons.referrals}</div><h3>No codes for ${esc(brand)}</h3><p>${q ? 'Try a different search' : 'No referral codes match this filter'}</p></div>`
      }
    </main>
    <button class="fab" data-nav="referral-form" title="Add referral code">${icon.plus}</button>
    ${renderBottomNav()}`;
  }

  /* ---- BRAND GRID (default view) ---- */
  // Compute unique brands in pool, apply category filter
  let filtered = pool;
  if (catFilter !== 'All') filtered = filtered.filter(r => r.category === catFilter);
  if (q) filtered = filtered.filter(r => r.brand.toLowerCase().includes(q));

  // Group by brand name
  const brandMap = new Map();
  for (const r of filtered) {
    if (!brandMap.has(r.brand)) brandMap.set(r.brand, []);
    brandMap.get(r.brand).push(r);
  }
  const brandList = [...brandMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  const brandCards = brandList.map(([brandName, codes]) => `
    <div class="voucher-card" style="cursor:pointer" data-referral-brand="${esc(brandName)}">
      ${avatar(brandName, 42)}
      <div class="vc-info">
        <div class="vc-brand">${esc(brandName)}</div>
        <div class="vc-code" style="font-size:0.8rem;opacity:0.7">${codes.length} code${codes.length!==1?'s':''}</div>
      </div>
      <div class="vc-right" style="color:var(--primary)">›</div>
    </div>`
  ).join('');

  return `
  ${renderHeader('Referral Codes')}
  <main class="content">
    ${tabs}
    <div class="search-bar" style="margin-bottom:12px">
      <span class="search-icon">${icon.search}</span>
      <input type="search" placeholder="Search brand…" value="${esc(state.searchQuery)}" data-search="referrals">
    </div>
    <div style="margin-bottom:16px">${categoryFilterDropdown(['All', ...CATEGORIES], catFilter, 'referral-cat')}</div>
    ${brandList.length > 0
      ? `<div class="voucher-list">${brandCards}</div>`
      : `<div class="empty-state">
           <div class="empty-icon">${navIcons.referrals}</div>
           <h3>${q || catFilter !== 'All' ? 'No results' : tab === 'mine' ? 'No codes yet' : tab === 'friends' ? 'No friends\' codes' : 'No public codes yet'}</h3>
           <p>${tab === 'mine' && !q ? 'Add your first referral code' : 'Try a different filter or tab'}</p>
           ${tab === 'mine' && !q ? '<button class="btn btn-primary" data-nav="referral-form">Add Referral Code</button>' : ''}
           ${tab === 'friends' && !q ? '<button class="btn btn-primary" data-nav="friends">Manage Friends</button>' : ''}
         </div>`
    }
  </main>
  <button class="fab" data-nav="referral-form" title="Add referral code">${icon.plus}</button>
  ${renderBottomNav()}`;
}

/* ============================================================
   VIEW: REFERRAL FORM (add / edit)
   ============================================================ */
export function viewReferralForm() {
  const id = state.params.id;
  const r  = id ? state.referrals.find(x => x.id === id) : null;
  const title = r ? 'Edit Referral Code' : 'Add Referral Code';

  return `
  ${renderHeader(title, 'referrals')}
  <main class="content">
    <form id="form-referral" autocomplete="off">
      ${r ? `<input type="hidden" name="referralId" value="${esc(r.id)}">` : ''}
      <div class="form-group">
        <label>Brand / App <span style="color:var(--warning)">*</span></label>
        ${brandAutocomplete(r?.brand || '')}
      </div>
      <div class="form-group">
        <label>Category</label>
        <select name="brandCategory" id="brand-category">
          ${CATEGORIES.map(c =>
            `<option value="${esc(c)}" ${(r?.category||'Other')===c?'selected':''}>${esc(c)}</option>`
          ).join('')}
        </select>
        <span class="form-hint">Auto-filled when you pick a known brand · you can also set it manually</span>
      </div>
      <div class="form-group">
        <label>Referral Code <span style="color:var(--text-muted);font-weight:400;font-size:0.8125rem">or link below</span></label>
        <input type="text" name="code" placeholder="Your referral code" value="${esc(r?.code||'')}">
      </div>
      <div class="form-group">
        <label>Referral Link <span style="color:var(--text-muted);font-weight:400;font-size:0.8125rem">or code above</span></label>
        <input type="url" name="link" placeholder="https://…" value="${esc(r?.link||'')}">
        <span class="form-hint">Use this when there's no code, just a signup link</span>
      </div>
      <div class="form-group">
        <label>Benefit for New User</label>
        <input type="text" name="benefitNew" placeholder="e.g. €10 welcome bonus" value="${esc(r?.benefitNew||'')}">
      </div>
      <div class="form-group">
        <label>Benefit for You (Referrer)</label>
        <input type="text" name="benefitReferrer" placeholder="e.g. €5 for each signup" value="${esc(r?.benefitReferrer||'')}">
      </div>
      <div class="form-group">
        <label>Terms &amp; Conditions</label>
        <textarea name="terms" placeholder="e.g. New customers only, one code per household, valid 30 days">${esc(r?.terms||'')}</textarea>
      </div>
      <div class="form-group">
        <label>Who can see this?</label>
        <select name="visibility">
          <option value="public" ${(r?.visibility||'public')==='public'?'selected':''}>Public (visible to everyone)</option>
          <option value="friends" ${r?.visibility==='friends'?'selected':''}>Friends only (visible to people you follow)</option>
          <option value="private" ${r?.visibility==='private'?'selected':''}>Private (only you)</option>
        </select>
        <span class="form-hint">Public codes are shown in the community feed</span>
      </div>
      <div class="form-group">
        <label>Expiry Date</label>
        <input type="date" name="expirationDate" value="${esc(r?.expirationDate||'')}">
        <span class="form-hint">Leave blank if the code has no expiry</span>
      </div>
      <div style="display:flex;gap:10px;margin-top:4px">
        <button type="button" class="btn btn-ghost btn-full" data-nav="referrals">Cancel</button>
        <button type="submit" class="btn btn-primary btn-full">${r ? 'Save Changes' : 'Save Code'}</button>
      </div>
    </form>
  </main>
  ${renderBottomNav()}`;
}
