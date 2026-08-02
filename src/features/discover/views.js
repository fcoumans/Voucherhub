// Discover browse list and brand detail page.
import { state } from '../../core/state.js';
import { esc, initial } from '../../core/dom.js';
import { LOGODEV_TOKEN } from '../../core/brands.js';
import { icon, renderHeader, renderBottomNav, navIcons } from '../../core/ui.js';
import { categoryBadge, categoryFilterDropdown } from '../../core/categories.js';
import { getDiscoveryCategories, getDiscoveryRegions } from './discover.js';

function discoveryLogoUrl(b) {
  if (b.logoUrl) return b.logoUrl;
  if (b.domain && LOGODEV_TOKEN) return `https://img.logo.dev/${b.domain}?token=${LOGODEV_TOKEN}`;
  return null;
}

function hostnameOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return null; }
}

const discoveryAvatar = (b, size = 46) => {
  const logoUrl = discoveryLogoUrl(b);
  if (logoUrl) {
    return `<div class="avatar" style="width:${size}px;height:${size}px;background:#f5f7fa;padding:3px;box-sizing:border-box;display:flex;align-items:center;justify-content:center">
      <img src="${esc(logoUrl)}" data-brand-name="${esc(b.name)}" alt="" onerror="avatarError(this)" style="width:100%;height:100%;object-fit:contain;display:block;border-radius:4px">
    </div>`;
  }
  return `<div class="avatar" style="background:#13B5A2;width:${size}px;height:${size}px;font-size:${Math.round(size * 0.38)}px">${esc(initial(b.name))}</div>`;
};

/* ============================================================
   VIEW: DISCOVER
   ============================================================ */
function discoveryBrandCard(b) {
  return `
  <div class="voucher-card" data-nav="discover-detail" data-id="${esc(b.id)}">
    ${discoveryAvatar(b, 46)}
    <div class="vc-info">
      <div class="vc-brand">${esc(b.name)}</div>
      <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:3px">${b.categories.map(c => categoryBadge(c)).join('')}</div>
      <div style="font-size:0.75rem;color:var(--text-muted);margin-top:3px">${esc(b.regions.join(', '))}</div>
    </div>
    <div class="vc-right" style="color:var(--secondary);display:flex;transform:scaleX(-1)">${icon.back}</div>
  </div>`;
}

export function viewDiscover() {
  const q             = state.searchQuery.toLowerCase();
  const catFilter    = state.discoveryCategoryFilter || 'All';
  const regionFilter = state.discoveryRegionFilter || 'All';

  let list = state.discoveryBrands;
  if (catFilter !== 'All') list = list.filter(b => b.categories.includes(catFilter));
  if (regionFilter !== 'All') list = list.filter(b => b.regions.includes(regionFilter));
  if (q) list = list.filter(b => b.name.toLowerCase().includes(q));

  const regionOptions = getDiscoveryRegions().map(r =>
    `<option value="${esc(r)}" ${regionFilter===r?'selected':''}>${r==='All'?'All regions':esc(r)}</option>`
  ).join('');

  return `
  ${renderHeader('Discover')}
  <main class="content">
    <p class="text-muted" style="font-size:0.875rem;margin-bottom:14px">Browse brands and buy a fresh gift card straight from the source.</p>
    <div class="search-bar" style="margin-bottom:12px">
      <span class="search-icon">${icon.search}</span>
      <input type="search" placeholder="Search brand…" value="${esc(state.searchQuery)}" data-search="discover">
    </div>
    <div style="display:flex;gap:10px;margin-bottom:16px">
      ${categoryFilterDropdown(getDiscoveryCategories(), catFilter, 'discover-cat', { style: 'flex:1' })}
      <select class="sort-select" style="flex:1" data-discover-region-select>${regionOptions}</select>
    </div>
    ${list.length > 0
      ? `<div class="voucher-list">${list.map(discoveryBrandCard).join('')}</div>`
      : `<div class="empty-state">
           <div class="empty-icon">${navIcons.discover}</div>
           <h3>No brands match</h3>
           <p>${q || catFilter !== 'All' || regionFilter !== 'All' ? 'Try a different search term or filter' : 'Check back soon — new brands are added regularly'}</p>
         </div>`
    }
  </main>
  ${renderBottomNav()}`;
}

/* ============================================================
   VIEW: DISCOVER BRAND DETAIL
   ============================================================ */
export function viewDiscoverDetail() {
  const id = state.params.id;
  const b  = state.discoveryBrands.find(x => x.id === id);
  const hostname = b ? hostnameOf(b.websiteUrl) : null;

  if (!b) {
    return `
    ${renderHeader('Discover', 'discover')}
    <main class="content">
      <div class="empty-state">
        <div class="empty-icon">${navIcons.discover}</div>
        <h3>Brand not found</h3>
        <p>It may have been removed from the catalog</p>
        <button class="btn btn-primary" data-nav="discover">Back to Discover</button>
      </div>
    </main>
    ${renderBottomNav()}`;
  }

  return `
  ${renderHeader(b.name, 'discover')}
  <main class="content">
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:18px">
      ${discoveryAvatar(b, 64)}
      <div>
        <div style="font-family:var(--font-display);font-size:1.25rem;font-weight:800;letter-spacing:-0.01em">${esc(b.name)}</div>
        <div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:5px">${b.categories.map(c => categoryBadge(c)).join('')}</div>
      </div>
    </div>
    <div class="detail-grid">
      <div class="detail-item" style="grid-column:span 2">
        <div class="detail-item-label">Region</div>
        <div class="detail-item-value">${esc(b.regions.join(', ') || 'N/A')}</div>
      </div>
    </div>
    ${b.location ? `<div class="text-muted" style="font-size:0.8125rem;margin-bottom:16px">${esc(b.location)}</div>` : ''}
    <p style="font-size:0.9375rem;line-height:1.6;margin:16px 0">${esc(b.description)}</p>
    ${b.funFact ? `<div class="sell-hint" style="background:var(--success-light);color:var(--text)">${icon.info} ${esc(b.funFact)}</div>` : ''}
    <a class="btn btn-primary btn-full" style="margin-top:8px;display:flex" href="${esc(b.websiteUrl)}" target="_blank" rel="noopener noreferrer">${icon.link} Buy Gift Card</a>
    ${hostname ? `<p class="text-muted" style="font-size:0.75rem;text-align:center;margin-top:8px">Opens ${esc(hostname)} in a new tab — you'll pay the brand directly</p>` : ''}
  </main>
  ${renderBottomNav()}`;
}
