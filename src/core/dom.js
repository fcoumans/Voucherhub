// Feature-agnostic formatting/escaping primitives used across every
// feature module — no dependency on `state` or any one feature's data shape.

export const esc = (str) =>
  String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export const formatDate = (dateStr) => {
  if (!dateStr) return 'N/A';
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

// Shared by wallet (voucher expiry) and marketplace (listing expiry).
export const daysUntil = (dateStr) => {
  if (!dateStr) return Infinity;
  const [y, m, d] = dateStr.split('-').map(Number);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(y, m - 1, d);
  return Math.round((exp - today) / 86400000);
};

export const initial = (name) => (name || '?').charAt(0).toUpperCase();

// Title-cases every space/hyphen-separated segment (e.g. "jean-pierre" ->
// "Jean-Pierre", "van der berg" -> "Van Der Berg") — matches the initcap()
// normalization applied server-side in the handle_new_user trigger.
export const toTitleCase = (str) =>
  String(str ?? '').trim().split(/\s+/).filter(Boolean)
    .map(word => word.split('-').map(seg => seg ? seg.charAt(0).toUpperCase() + seg.slice(1).toLowerCase() : seg).join('-'))
    .join(' ');

// public_profiles rows expose first_name/last_name instead of a single name.
export const fullName = (row) => [row?.first_name, row?.last_name].filter(Boolean).join(' ').trim();

export const formatCurrency = (amount, currency = 'EUR', showDecimals = true) => {
  const sym = { EUR: '€', USD: '$', GBP: '£', CHF: 'CHF ', SEK: 'kr', NOK: 'kr', DKK: 'kr' };
  const digits = showDecimals ? 2 : 0;
  const formatted = parseFloat(amount || 0).toLocaleString('nl-NL', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return (sym[currency] || currency + ' ') + formatted;
};

// Native number inputs always require a period; this lets users type a comma (European style) instead.
export const normalizeAmount = (str) => String(str ?? '').trim().replace(',', '.');

export const formData = (form) => Object.fromEntries(new FormData(form));

// Shared bottom-sheet mount/close pair for every `.overlay`/`.dialog` popup
// (confirm dialog, add-voucher menu, gift share screen). `.overlay`/`.dialog`
// render off-screen by default (see style.css) so the transition has
// somewhere to animate from — `.show` must be added on a later frame than
// the insert, or the browser coalesces both styles into one paint and the
// transition never runs.
export function mountOverlay(overlay) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => overlay.classList.add('show'));
  });
}

export function closeOverlay(overlay, after) {
  if (overlay.dataset.closing) return;
  overlay.dataset.closing = 'true';
  overlay.classList.add('closing');
  overlay.classList.remove('show');
  const onEnd = (e) => {
    if (e.target !== overlay) return;
    overlay.removeEventListener('transitionend', onEnd);
    overlay.remove();
    after?.();
  };
  overlay.addEventListener('transitionend', onEnd);
}
