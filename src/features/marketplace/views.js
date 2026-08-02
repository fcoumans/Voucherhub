// Marketplace browse/community/mine tabs and the listing detail page.
import { state, CATEGORIES } from '../../core/state.js';
import { esc, daysUntil, formatCurrency, formatDate } from '../../core/dom.js';
import { getBrandDescription } from '../../core/brands.js';
import { icon, avatar, navIcons, renderHeader, renderBottomNav } from '../../core/ui.js';
import { categoryBadge, categoryFilterDropdown } from '../../core/categories.js';
import { discountPct } from './marketplace.js';

/* ============================================================
   VIEW: MARKETPLACE
   ============================================================ */
export function listingCard(l, isOwn = false) {
  const disc = discountPct(l.originalValue, l.sellingPrice);
  const days = l.expiryDate ? daysUntil(l.expiryDate) : null;

  return `
  <div class="listing-card" data-nav="listing-detail" data-id="${esc(l.id)}">
    ${avatar(l.brand, 46)}
    <div class="lc-info">
      <div class="lc-brand">${esc(l.brand)}${l.visibility === 'friends_only' ? ' <span class="lc-tag">Trusted Community</span>' : ''}</div>
      <div class="lc-seller">${isOwn ? 'Your listing' : esc(l.sellerName)}</div>
      ${l.category ? `<div style="margin-top:3px">${categoryBadge(l.category)}</div>` : ''}
      ${days !== null && days >= 0 && days <= 14 ? `<div class="text-xs text-warning" style="margin-top:2px">Expires in ${days}d</div>` : ''}
      ${days !== null && days < 0 ? `<div class="text-xs text-danger" style="margin-top:2px">Expired</div>` : ''}
    </div>
    <div class="lc-right">
      <div class="lc-original">${formatCurrency(l.originalValue, l.currency, false)}</div>
      <div class="lc-price-row">
        <div class="lc-price">${formatCurrency(l.sellingPrice, l.currency, false)}</div>
        ${disc > 0 ? `<div class="discount-badge">-${disc}%</div>` : ''}
      </div>
    </div>
  </div>`;
}

export function viewMarketplace() {
  const tab = state.marketplaceTab || 'browse';
  const q   = state.searchQuery.toLowerCase();
  const catFilter = state.marketplaceCategoryFilter || 'All';
  const uid = state.currentUser.id;
  const friendIds        = state.friendIds;
  const trustedNetworkIds = state.trustedNetworkIds;

  // Browse: public listings only, open to everyone. Friends' public
  // listings are boosted to the top but strangers' are included too.
  let browseListings = state.listings.filter(l => l.sellerId !== uid && l.visibility === 'public');
  if (q) browseListings = browseListings.filter(l => l.brand.toLowerCase().includes(q));
  if (catFilter !== 'All') browseListings = browseListings.filter(l => (l.category || 'Other') === catFilter);
  browseListings.sort((a, b) => {
    const aF = friendIds.includes(a.sellerId) ? 0 : 1;
    const bF = friendIds.includes(b.sellerId) ? 0 : 1;
    return aF - bF;
  });

  // Trusted Community: everything from your network (friends + friends of
  // friends), public or trusted-only — a network member's public listing
  // still belongs here too, direct friends surfaced first.
  let communityListings = state.listings.filter(l => l.sellerId !== uid && trustedNetworkIds.includes(l.sellerId));
  if (q) communityListings = communityListings.filter(l => l.brand.toLowerCase().includes(q));
  if (catFilter !== 'All') communityListings = communityListings.filter(l => (l.category || 'Other') === catFilter);
  communityListings.sort((a, b) => {
    const aF = friendIds.includes(a.sellerId) ? 0 : 1;
    const bF = friendIds.includes(b.sellerId) ? 0 : 1;
    return aF - bF;
  });

  const myListings = state.listings.filter(l => l.sellerId === uid);

  return `
  ${renderHeader('Marketplace')}
  <main class="content">
    <div class="inline-tabs">
      <button class="inline-tab ${tab==='browse'?'active':''}" data-marketplace-tab="browse">Browse</button>
      <button class="inline-tab ${tab==='community'?'active':''}" data-marketplace-tab="community">Trusted Community (${communityListings.length})</button>
      <button class="inline-tab ${tab==='mine'?'active':''}" data-marketplace-tab="mine">My Listings (${myListings.length})</button>
    </div>

    ${tab === 'browse' ? `
    <div class="search-bar" style="margin-bottom:12px">
      <span class="search-icon">${icon.search}</span>
      <input type="search" placeholder="Search brand…" value="${esc(state.searchQuery)}" data-search="marketplace">
    </div>
    <div style="margin-bottom:16px">${categoryFilterDropdown(['All', ...CATEGORIES], catFilter, 'market-cat')}</div>
    ${browseListings.length > 0
      ? browseListings.map(l => listingCard(l)).join('')
      : `<div class="empty-state"><div class="empty-icon">${navIcons.marketplace}</div><h3>${q||catFilter!=='All'?'No results':'Marketplace is empty'}</h3><p>${q||catFilter!=='All'?'Try a different search or filter':'Be the first to list a voucher for sale'}</p></div>`
    }
    ` : tab === 'community' ? `
    ${trustedNetworkIds.length > 0 ? `<div class="sell-hint">${icon.info} Trusted Community shows listings from your friends and friends of friends.</div>` : ''}
    ${trustedNetworkIds.length > 0 ? `
    <div class="search-bar" style="margin-bottom:12px">
      <span class="search-icon">${icon.search}</span>
      <input type="search" placeholder="Search brand…" value="${esc(state.searchQuery)}" data-search="marketplace">
    </div>
    <div style="margin-bottom:16px">${categoryFilterDropdown(['All', ...CATEGORIES], catFilter, 'market-cat')}</div>
    ` : ''}
    ${communityListings.length > 0
      ? communityListings.map(l => listingCard(l)).join('')
      : trustedNetworkIds.length === 0
      ? `<div class="empty-state">
           <div class="empty-icon">${icon.users}</div>
           <h3>Build your Trusted Community</h3>
           <p>Add friends to unlock a smaller, more trusted resale circle — listings marked "Trusted Community" only show up here, for your friends and friends of friends.</p>
           <button class="btn btn-primary" data-nav="friends">Add Friends</button>
         </div>`
      : `<div class="empty-state">
           <div class="empty-icon">${icon.tag}</div>
           <h3>${q || catFilter !== 'All' ? 'No results' : 'No listings from your network yet'}</h3>
           <p>${q || catFilter !== 'All' ? 'Try a different search or filter' : 'When someone in your network lists a voucher for resale, it shows up here.'}</p>
           ${!q && catFilter === 'All' ? '<button class="btn btn-secondary" data-marketplace-tab="browse">Browse Marketplace</button>' : ''}
         </div>`
    }
    ` : `
    ${myListings.length > 0
      ? myListings.map(l => listingCard(l, true)).join('')
      : `<div class="empty-state"><div class="empty-icon">${icon.tag}</div><h3>No active listings</h3><p>Open a voucher and tap "Sell" to list it here</p><button class="btn btn-primary" data-nav="vouchers">Go to My Wallet</button></div>`
    }
    `}
  </main>
  ${renderBottomNav()}`;
}

/* ============================================================
   VIEW: LISTING DETAIL
   ============================================================ */
export function viewListingDetail() {
  const id = state.params.id;
  const l  = state.listings.find(x => x.id === id);
  if (!l || l.status !== 'available') {
    return `
    ${renderHeader('Listing', 'marketplace')}
    <main class="content">
      <div class="empty-state">
        <div class="empty-icon">${icon.tag}</div>
        <h3>This listing is no longer available</h3>
        <p>It's likely been sold or taken down by the seller.</p>
        <button class="btn btn-primary" data-nav="marketplace">Back to Marketplace</button>
      </div>
    </main>
    ${renderBottomNav()}`;
  }

  const disc  = discountPct(l.originalValue, l.sellingPrice);
  const isOwn = l.sellerId === state.currentUser.id;
  const days  = l.expiryDate ? daysUntil(l.expiryDate) : null;

  const brandDesc = getBrandDescription(l.brand);

  return `
  ${renderHeader(l.brand, 'marketplace')}
  <main class="content">
    <div class="listing-detail-header">
      <div class="ld-brand">${esc(l.brand)}</div>
      <div class="ld-original">${formatCurrency(l.originalValue, l.currency)} original value</div>
      <div class="ld-price-row">
        <div class="ld-price">${formatCurrency(l.sellingPrice, l.currency)}</div>
        ${disc > 0 ? `<div class="discount-badge">-${disc}%</div>` : ''}
      </div>
    </div>

    ${brandDesc ? `<p class="text-muted" style="font-size:0.875rem;margin-bottom:16px">${esc(brandDesc)}</p>` : ''}

    <div class="detail-grid">
      <div class="detail-item">
        <div class="detail-item-label">Original Value</div>
        <div class="detail-item-value">${formatCurrency(l.originalValue, l.currency)}</div>
      </div>
      <div class="detail-item">
        <div class="detail-item-label">You Save</div>
        <div class="detail-item-value text-success">${formatCurrency(l.originalValue - l.sellingPrice, l.currency)}</div>
      </div>
      <div class="detail-item">
        <div class="detail-item-label">Expiry Date</div>
        <div class="detail-item-value ${days !== null && days <= 7 && days >= 0 ? 'text-warning' : days !== null && days < 0 ? 'text-danger' : ''}">${l.expiryDate ? formatDate(l.expiryDate) : 'N/A'}</div>
      </div>
      <div class="detail-item">
        <div class="detail-item-label">Seller</div>
        <div class="detail-item-value">${esc(l.sellerName)}</div>
      </div>
      ${l.notes ? `<div class="detail-item" style="grid-column:span 2"><div class="detail-item-label">Notes</div><div class="detail-item-value" style="font-weight:400;font-size:0.875rem">${esc(l.notes)}</div></div>` : ''}
    </div>

    ${isOwn ? `
    <div class="sell-hint">${icon.info} This is your listing — buyers will contact you directly at <strong>${esc(l.sellerEmail)}</strong>.</div>
    <button class="btn btn-danger btn-full" data-action="remove-listing" data-id="${esc(l.id)}" data-voucher-id="${esc(l.voucherId)}">${icon.trash} Remove Listing</button>
    ` : `
    <div class="sell-hint" style="margin-bottom:16px">${icon.info} Payment is arranged directly with the seller. No payment processing in this MVP.</div>
    <a href="mailto:${esc(l.sellerEmail)}?subject=${encodeURIComponent('Interested in your ' + l.brand + ' voucher on VoucherWise')}" class="btn btn-primary btn-full" style="display:flex">
      ${icon.mail} Contact Seller
    </a>
    ${state.interestedListingIds.has(l.id)
      ? `<button type="button" class="btn btn-ghost btn-full" style="margin-top:10px" disabled>${icon.check} Seller notified</button>`
      : `<button type="button" class="btn btn-secondary btn-full" style="margin-top:10px" data-action="express-interest" data-id="${esc(l.id)}">${icon.bell} I'm Interested</button>`
    }
    `}
  </main>
  ${renderBottomNav()}`;
}
