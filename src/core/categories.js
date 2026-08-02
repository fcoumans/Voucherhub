// Per-category icon + color, used everywhere a category is a filterable
// facet (Referrals, Discover) rather than plain per-voucher data entry
// (Wallet's category <select> in the voucher form stays plain text).
import { esc } from './dom.js';

// Drawn line icons — stroke="currentColor" so each one automatically
// inherits the badge's own text color (set inline per category below),
// same 2px-stroke/round-cap language as the rest of the app's icon set in
// core/ui.js. Deliberately not emoji: emoji render as platform-specific
// full-color glyphs that clash with the app's drawn-icon voice.
const svg = (body) => `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

const ICONS = {
  cup:        svg('<path d="M17 8h1a4 4 0 010 8h-1"/><path d="M3 8h14v9a4 4 0 01-4 4H7a4 4 0 01-4-4V8z"/><line x1="6" y1="2" x2="6" y2="4"/><line x1="10" y1="2" x2="10" y2="4"/><line x1="14" y1="2" x2="14" y2="4"/>'),
  bag:        svg('<path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/>'),
  plane:      svg('<path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-1 .1-1.3.5l-.7.7c-.4.4-.3 1.1.2 1.4l5.9 3.3-3.8 3.8-2.6-.6a1 1 0 00-.8.3l-.4.4c-.4.4-.4 1 0 1.4l3 3c.4.4 1 .4 1.4 0l.4-.4a1 1 0 00.3-.8l-.6-2.6 3.8-3.8 3.3 5.9c.3.5 1 .6 1.4.2l.7-.7c.4-.3.6-.8.5-1.3z"/>'),
  ticket:     svg('<path d="M2 9a3 3 0 010 6v2a2 2 0 002 2h16a2 2 0 002-2v-2a3 3 0 010-6V7a2 2 0 00-2-2H4a2 2 0 00-2 2v2z"/><line x1="13" y1="5" x2="13" y2="7"/><line x1="13" y1="11" x2="13" y2="13"/><line x1="13" y1="17" x2="13" y2="19"/>'),
  card:       svg('<rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/>'),
  controller: svg('<rect x="2" y="6" width="20" height="12" rx="6"/><line x1="6" y1="12" x2="10" y2="12"/><line x1="8" y1="10" x2="8" y2="14"/><line x1="15" y1="13" x2="15.01" y2="13"/><line x1="18" y1="11" x2="18.01" y2="11"/>'),
  sparkle:    svg('<path d="M12 3l1.9 5.8a2 2 0 001.3 1.3L21 12l-5.8 1.9a2 2 0 00-1.3 1.3L12 21l-1.9-5.8a2 2 0 00-1.3-1.3L3 12l5.8-1.9a2 2 0 001.3-1.3L12 3z"/>'),
  leaf:       svg('<path d="M11 20A7 7 0 014 13c0-4 3-7 7-7 4 0 7 3 7 7a7 7 0 01-7 7z"/><path d="M11 13c0-4 3-7 7-7"/>'),
  car:        svg('<path d="M5 16h14M5 16a2 2 0 01-2-2v-2.5a1 1 0 01.4-.8l2-1.5.8-2.6A2 2 0 018.1 5h7.8a2 2 0 011.9 1.6l.8 2.6 2 1.5a1 1 0 01.4.8V14a2 2 0 01-2 2M5 16v2a1 1 0 001 1h1a1 1 0 001-1v-2m10 0v2a1 1 0 001 1h1a1 1 0 001-1v-2"/>'),
  tag:        svg('<path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>'),
};

// `label` is the short, lowercase word shown on the pill itself (matches
// the reference: "dining", "travel", "sports" — not the full formal
// CATEGORIES name). The full name is still what's stored/filtered/matched
// on; `label` is presentation-only.
// Muted, desaturated versions of a normal "tag palette" — closer to the
// soft coral/blue/lavender in the reference than a vivid Tailwind-style
// hue, so the badges read as calm identification, not alerts.
export const CATEGORY_META = {
  'Food & Drink':      { icon: ICONS.cup,        color: '#C1723F', label: 'food and drinks' },
  'Shopping':           { icon: ICONS.bag,        color: '#B15A93', label: 'shopping' },
  'Travel':             { icon: ICONS.plane,      color: '#5482C4', label: 'travel' },
  'Entertainment':      { icon: ICONS.ticket,     color: '#7069B8', label: 'entertainment' },
  'Finance':            { icon: ICONS.card,       color: '#3E8794', label: 'finance' },
  'Sports and Health':  { icon: ICONS.controller, color: '#8873C4', label: 'sports' },
  'Beauty & Wellness':  { icon: ICONS.sparkle,    color: '#C97AA0', label: 'wellness' },
  'Sustainability':     { icon: ICONS.leaf,       color: '#5F9E5F', label: 'sustainability' },
  'Mobility':           { icon: ICONS.car,        color: '#77839A', label: 'mobility' },
  'Other':               { icon: ICONS.tag,        color: '#9AA6B2', label: 'other' },
};

export const categoryMeta = (name) => CATEGORY_META[name] || CATEGORY_META.Other;

const hexToRgba = (hex, alpha) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

// Static, always-colored pill for displaying a category on a card preview
// (never interactive) — small and quiet on purpose, so it reads as
// metadata rather than competing with the brand name/value next to it.
export function categoryBadge(name, { style = '' } = {}) {
  const { icon, color, label } = categoryMeta(name);
  return `<span class="category-chip category-chip-badge" style="background:${hexToRgba(color, 0.14)};color:${color};${style}">${icon} ${esc(label)}</span>`;
}

const chevronIcon = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`;

// Category filter control (Wallet, Referrals, Discover, Marketplace all use
// this same component) — collapsed by default like a <select>, but built
// on <details>/<summary> instead of a native select so both the closed
// trigger and every open option can carry the category's real icon+color
// (a native <option> can't). No JS needed to open/close: selecting an
// option re-renders the page, which recreates the <details> closed with
// the new selection already reflected in the trigger.
export function categoryFilterDropdown(names, selected, dataAttr, { style = '' } = {}) {
  const isAll = selected === 'All' || !selected;
  const sel = isAll ? null : categoryMeta(selected);
  const triggerIcon  = isAll ? ICONS.tag : sel.icon;
  const triggerLabel = isAll ? 'All categories' : sel.label;
  const triggerColor = isAll ? 'var(--text-muted)' : sel.color;

  const options = names.map(n => {
    if (n === 'All') {
      return `<button type="button" class="category-dropdown-option ${isAll ? 'active' : ''}" data-${dataAttr}="All">
        <span class="category-dropdown-option-icon" style="color:var(--text-muted)">${ICONS.tag}</span>
        <span>All categories</span>
      </button>`;
    }
    const { icon, color, label } = categoryMeta(n);
    return `<button type="button" class="category-dropdown-option ${selected === n ? 'active' : ''}" data-${dataAttr}="${esc(n)}">
      <span class="category-dropdown-option-icon" style="color:${color}">${icon}</span>
      <span>${esc(label)}</span>
    </button>`;
  }).join('');

  return `
  <details class="category-dropdown" style="${style}">
    <summary class="category-dropdown-trigger">
      <span class="category-dropdown-trigger-icon" style="color:${triggerColor}">${triggerIcon}</span>
      <span class="category-dropdown-trigger-label">${esc(triggerLabel)}</span>
      <span class="category-dropdown-chevron">${chevronIcon}</span>
    </summary>
    <div class="category-dropdown-panel">${options}</div>
  </details>`;
}
