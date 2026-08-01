// Shared chrome: icon set, avatar, header/bottom-nav, and the brand
// autocomplete widget (input + its suggestion dropdown) used by both the
// wallet and referral forms.
import { state } from './state.js';
import { esc, initial } from './dom.js';
import { getBrandLogo } from './brands.js';

/* Global fallback called by onerror on brand logo <img> elements */
window.avatarError = function(img) {
  const el = img.parentElement;
  if (!el) return;
  const size  = parseInt(el.style.width) || 42;
  const name  = img.dataset.brandName || '?';
  el.style.background = '#13B5A2';
  el.style.color      = 'white';
  el.style.fontSize   = Math.round(size * 0.38) + 'px';
  el.style.display    = 'flex';
  el.style.alignItems = 'center';
  el.style.justifyContent = 'center';
  el.innerHTML = name.charAt(0).toUpperCase();
};

export const avatar = (name, size = 42) => {
  const logoUrl = getBrandLogo(name);
  if (logoUrl) {
    return `<div class="avatar" style="width:${size}px;height:${size}px;background:#f5f7fa;padding:3px;box-sizing:border-box;display:flex;align-items:center;justify-content:center">
      <img src="${esc(logoUrl)}" data-brand-name="${esc(name)}" alt="" onerror="avatarError(this)" style="width:100%;height:100%;object-fit:contain;display:block;border-radius:4px">
    </div>`;
  }
  return `<div class="avatar" style="background:#13B5A2;width:${size}px;height:${size}px;font-size:${Math.round(size * 0.38)}px">${esc(initial(name))}</div>`;
};

export function brandAutocomplete(currentValue = '') {
  return `
  <div style="position:relative">
    <input type="text" name="brand" data-brand-ac placeholder="Search or type a brand…" value="${esc(currentValue)}" required autocomplete="off" style="width:100%">
    <div id="brand-suggestions" style="display:none;position:absolute;top:calc(100% + 4px);left:0;right:0;background:var(--bg,#fff);border:1.5px solid var(--border,#e2e8f0);border-radius:10px;max-height:220px;overflow-y:auto;z-index:200;box-shadow:0 4px 20px rgba(34,51,130,0.12)"></div>
  </div>`;
}

// Populates the dropdown rendered by brandAutocomplete() above — called from
// core/events.js on focus/input of any [data-brand-ac] field.
export function showBrandSuggestions(value) {
  const el = document.getElementById('brand-suggestions');
  if (!el) return;
  const q = (value || '').toLowerCase();
  const filtered = q
    ? state.brands.filter(b => b.name.toLowerCase().includes(q)).slice(0, 20)
    : state.brands.slice(0, 20);
  if (filtered.length === 0) { el.style.display = 'none'; return; }
  el.innerHTML = filtered.map(b => {
    const logoUrl = getBrandLogo(b.name);
    const logoHtml = logoUrl
      ? `<img src="${esc(logoUrl)}" alt="" onerror="this.style.display='none'" style="width:22px;height:22px;object-fit:contain;margin-right:10px;flex-shrink:0;border-radius:3px">`
      : `<div style="width:22px;height:22px;background:#13B5A2;border-radius:5px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:10px;font-weight:700;margin-right:10px;flex-shrink:0">${esc(initial(b.name))}</div>`;
    return `<div data-brand-opt="${esc(b.name)}" data-brand-cat="${esc(b.category||'')}" style="padding:10px 14px;cursor:pointer;font-size:0.9375rem;border-bottom:1px solid var(--border-light,#f0f0f0);display:flex;align-items:center">${logoHtml}${esc(b.name)}</div>`;
  }).join('');
  el.style.display = 'block';
}

export const icon = {
  back:   `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>`,
  plus:   `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  search: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
  copy:   `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>`,
  check:  `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  trash:  `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>`,
  edit:   `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
  tag:    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>`,
  clock:  `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  link:   `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>`,
  logout: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`,
  info:   `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
  mail:   `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>`,
  undo:   `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>`,
  bell:   `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>`,
  users:  `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>`,
  eye:    `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`,
  eyeOff: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`,
  plus2:  `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  camera: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>`,
  file:   `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`,
  gift:   `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z"/></svg>`,
};

export const navIcons = {
  home:        `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
  vouchers:    `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>`,
  marketplace: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>`,
  discover:    `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>`,
  referrals:   `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>`,
  profile:     `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
};

export function renderBottomNav() {
  const items = [
    { id: 'home', label: 'Home' },
    { id: 'discover', label: 'Discover' },
    { id: 'vouchers', label: 'Wallet' },
    { id: 'marketplace', label: 'Market' },
    { id: 'referrals', label: 'Referrals' },
  ];
  return `
  <nav class="bottom-nav">
    ${items.map(it => `
      <button class="nav-item ${state.view === it.id ? 'active' : ''}" data-nav="${it.id}">
        <div style="position:relative;display:inline-flex">
          ${navIcons[it.id]}
        </div>
        <span class="nav-label">${it.label}</span>
      </button>
    `).join('')}
  </nav>`;
}

const LOGO_MARK_SVG = (size) => `
  <svg width="${size}" height="${size}" viewBox="0 0 72 72" fill="none">
    <rect width="72" height="72" rx="18" fill="#13B5A2"/>
    <rect x="11" y="8" width="50" height="30" rx="9" fill="#2BD4BE" opacity="0.6"/>
    <rect x="6" y="26" width="60" height="38" rx="11" fill="white"/>
    <rect x="38" y="35" width="22" height="14" rx="7" fill="#11233F"/>
  </svg>`;

const LOGO_LOCKUP = `
  <div style="flex:1;display:flex;align-items:center;justify-content:center;gap:8px">
    ${LOGO_MARK_SVG(28)}
    <span style="font-size:1.0625rem;font-weight:800;letter-spacing:-0.01em"><span style="color:#11233F">Voucher</span><span style="color:#13B5A2">Wise</span></span>
  </div>`;

export function renderHeader(title, backView, backParams = {}, rightAction = '') {
  const centerContent = title === 'VoucherWise'
    ? LOGO_LOCKUP
    : `<span class="header-title">${esc(title)}</span>`;
  return `
  <header class="app-header">
    <div class="header-left">
      ${backView ? `<button class="btn-back" data-nav="${backView}" ${backParams.id ? `data-id="${esc(backParams.id)}"` : ''}>${icon.back}</button>` : ''}
    </div>
    ${centerContent}
    <div class="header-right">${rightAction}</div>
  </header>`;
}
