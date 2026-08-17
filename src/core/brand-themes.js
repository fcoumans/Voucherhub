// One-off bespoke brand treatment for a real-world Discover catalog entry
// that deserves to look like itself rather than the generic brand-detail
// template — currently just Planet B (public.discovery_brands). Kept
// separate from core/categories.js (per-category styling, applies to every
// brand) since this is per-brand and only exists where we've deliberately
// hand-styled one.
//
// Deliberately does NOT fabricate a logo or product photography — the logo
// is passed in by the caller (discoveryAvatar() in
// features/discover/views.js, backed by discovery_brands.domain via
// logo.dev), and the banner/sub-brand cutouts below hotlink Planet B's own
// live CDN assets (planetb.care/cdn/shop/files/...), the same way the logo
// is already hotlinked rather than re-hosted or redrawn.
import { esc, formatCurrency } from './dom.js';

export const PLANET_B_BRAND = 'Planet B';
export const isPlanetB = (name) => name === PLANET_B_BRAND;

// Stable-sorts a list so any Planet B entry(ies) lead, otherwise leaving
// order untouched — used to pin it to the top of the Discover and
// Referrals brand lists. `getName` reads the brand name off whatever
// shape the caller's list items are.
export function pinPlanetBFirst(list, getName) {
  return [...list].sort((a, b) => {
    const aFirst = isPlanetB(getName(a));
    const bFirst = isPlanetB(getName(b));
    if (aFirst === bFirst) return 0;
    return aFirst ? -1 : 1;
  });
}

// Inline "Community Favorite" tag — sits in the card's own text flow
// (next to/under the brand name) like any other small pill in the app, not
// a floating ribbon or badge. The star is a drawn icon (stroke/fill
// currentColor, matches core/ui.js's icon language) rather than an emoji.
const starIcon = `<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7-6.2-3.7-6.2 3.7 1.6-7L2 9.2l7.1-.6z"/></svg>`;

export function planetBFavoriteTag() {
  return `<span class="pb-favorite-tag">${starIcon}Community Favorite</span>`;
}

// Planet B's actual logomark — the exact path data from their own
// Pb-logo-white.svg (planetb.care/cdn/shop/files/Pb-logo-white.svg),
// recolored via currentColor instead of their hardcoded white fill so it
// reads on a light background (their file only ships a white variant, for
// their own dark nav bar). Real vector artwork, not redrawn — just
// recolored for this page's own header.
export function planetBLogoMark(size = 28) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 70 70" fill="currentColor"><path d="M35.6,56.8h-1.7c-.2,0-.4,0-.7,0-5.4-.4-10.4-2.7-14.2-6.5s-6.4-9.7-6.4-15.6,2.3-11.2,6.3-15.3c3.9-3.9,9.1-6.2,14.6-6.6h.4c.5,0,1.1,0,1.6,0h.4c2.7.2,5.4.8,7.9,2,5.1,2.3,9.1,6.4,11.3,11.5,2.2,5.3,2.3,11.2.2,16.6-2.1,5.4-6.2,9.7-11.5,12.1-2.4,1.1-4.9,1.7-7.5,1.9s-.5,0-.7,0ZM54.5,35.8c.2-3.1-.5-6-1.9-8.7-1-2-2.5-3.7-4.2-5.2-5.3-4.6-12.8-6.1-19.5-4.2v28.3c5.2-8.9,15.7-13,25.5-10.2ZM16.6,41.8c1.8,3.8,5,6.8,8.8,8.6l-.9-31c-3.5,1.9-6.4,4.9-8,8.5-2,4.4-1.9,9.4.2,13.8ZM46.3,49.2c3.4-2.2,6-5.4,7.3-9.2-1.9-.5-3.9-.7-5.8-.7-8.3,0-16,4.8-19.5,12.3,6,1.9,12.7,1.1,18-2.4Z"/></svg>`;
}

// Shared header lockup (logomark + "Planet B" wordmark, bold navy) for any
// screen that puts a branded pink header up top — the Discover detail page
// and the Referrals brand drill-down (see features/discover/views.js and
// features/referrals/views.js). Centered via flex:1 so it drops straight
// into renderHeader()'s centerHtml slot or an equivalent custom header.
export function planetBHeaderLogoHtml() {
  return `
  <div style="flex:1;display:flex;align-items:center;justify-content:center;gap:9px;color:#151F3A">
    ${planetBLogoMark(38)}
    <span style="font-family:var(--font-display);font-weight:800;font-size:1.375rem;letter-spacing:-0.015em">Planet B</span>
  </div>`;
}

// A shorter, punchier stand-in for discovery_brands.description (which is
// a full paragraph, right for a text-heavy generic brand page but too much
// for this hand-styled one) — the full description stays intact in Supabase.
export const PLANET_B_SHORT_DESCRIPTION =
  "A Ghent-based, Certified B Corporation making plastic-free, non-toxic everyday care — because there's no Planet B.";

// Real product-lineup photo from Planet B's own CDN, used as-is.
const PLANET_B_BANNER_URL = 'https://planetb.care/cdn/shop/files/Powr-Bundle-PlanetB-Bundle-SMS-1-1.png?v=1781103003&width=900';

// Fallback "Shop" destination for callers that don't have their own
// discovery_brands.website_url handy (the Referrals brand drill-down has
// no such field — referral_codes carries no website URL).
export const PLANET_B_WEBSITE_URL = 'https://planetb.care/products/gift-card?variant=32604608528458';

// The two sub-brands sold through Planet B's own webshop (see
// discovery_brands.description) — real product cutouts from their CDN,
// English copy summarizing their own site's per-brand blurbs.
const PLANET_B_SUBBRANDS = [
  {
    key: 'wondr',
    name: 'WONDR',
    pill: 'Selfcare',
    bg: '#F9EDA8',
    desc: 'Solid-first care with natural ingredients and (almost) no plastic.',
    img: 'https://planetb.care/cdn/shop/files/wondr-cutout.png?v=1785404832&width=300',
  },
  {
    key: 'powr',
    name: 'POWR',
    pill: 'Homecare',
    bg: '#D8EEF6',
    desc: 'Plastic-free laundry and cleaning that still gets the job done.',
    img: 'https://planetb.care/cdn/shop/files/powr-cutout.png?v=1785404832&width=300',
  },
];

// The gift-card visual: a navy top carrying the voucher's own balance
// (top-left, the way a real gift card leads with its amount) and the
// slogan (top-right), a purple wave band carrying the *real* logo (passed
// in as `logoHtml`, never fabricated here) and a plain "Gift Card" label —
// echoes the layout of Planet B's own printed gift card without tracing
// their actual artwork. Used by the Wallet voucher-detail page (owned
// vouchers) — no longer shown on the Discover catalog page, which has no
// specific denomination to display.
export function planetBCardHtml(logoHtml, balanceText) {
  return `
  <div class="pb-card">
    <div class="pb-card-top">
      ${balanceText ? `<span class="pb-card-balance">${esc(balanceText)}</span>` : '<span></span>'}
      <div class="pb-card-slogan">Be part<br>of the<br>change</div>
    </div>
    <svg class="pb-card-wave" viewBox="0 0 400 100" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0,58 C70,18 130,78 210,40 C280,10 330,50 400,28 L400,100 L0,100 Z" fill="#4B3FE6"/>
    </svg>
    <div class="pb-card-bottom">
      <div class="pb-card-brand">${logoHtml}<span>Planet B</span></div>
      <span class="pb-card-pill">Gift Card</span>
    </div>
  </div>`;
}

// What the card's top-left balance shows for a specific owned voucher: a
// short "10% OFF" pulled out of a free-text value description (the
// onboarding welcome-gift's shape) if there is one, otherwise the
// voucher's actual remaining balance (a manually-added Planet B voucher's
// shape) formatted as currency, otherwise the generic "Gift Card" fallback.
export function planetBCardPill(v) {
  const pctMatch = /(\d+%)/.exec(v.valueDescription || '');
  if (pctMatch) return `${pctMatch[1]} OFF`;
  const amount = v.balance != null ? v.balance : v.value;
  if (amount !== '' && amount != null && !isNaN(parseFloat(amount))) return formatCurrency(amount, v.currency);
  return 'Gift Card';
}

// The WONDR / POWR sub-brand cards — both "Shop" links point at Planet B's
// own site (the only URL discovery_brands has; both sub-brands sell
// through Planet B's own webshop, not separate stores).
function planetBSubBrandsHtml(websiteUrl) {
  return `
  <div class="pb-subbrands">
    ${PLANET_B_SUBBRANDS.map(s => `
    <a class="pb-subbrand" style="background:${s.bg}" href="${esc(websiteUrl)}" target="_blank" rel="noopener noreferrer">
      <span class="pb-subbrand-pill">${esc(s.pill)}</span>
      <span class="pb-subbrand-name">${esc(s.name)}</span>
      <span class="pb-subbrand-desc">${esc(s.desc)}</span>
      <span class="pb-subbrand-cta">Shop ${esc(s.name)} →</span>
      <img class="pb-subbrand-img" src="${esc(s.img)}" alt="" loading="lazy">
    </a>`).join('')}
  </div>`;
}

// Full branded header block for the Discover brand-detail page — tagline,
// the real product-lineup banner, the mission line, and the WONDR/POWR
// sub-brand cards. No gift-card visual here — Discover has no specific
// denomination to show; that's reserved for an owned voucher in the
// Wallet (see planetBCardHtml() there). Everything below this block on the
// page (description, fun fact, the "Buy Gift Card" CTA) stays the shared
// template, just with a shorter description and no Region row — see
// features/discover/views.js.
export function planetBHeroHtml(websiteUrl = PLANET_B_WEBSITE_URL) {
  return `
  <div class="pb-page">
    <p class="pb-page-tagline">The future of everyday care</p>
    <img class="pb-banner" src="${PLANET_B_BANNER_URL}" alt="WONDR and POWR products by Planet B" loading="lazy">
    <p class="pb-page-mission">There's no Planet B — every small swap adds up. Be part of the change.</p>
    ${planetBSubBrandsHtml(websiteUrl)}
  </div>`;
}
