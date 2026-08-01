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
// (confirm dialog, add-voucher menu, gift share screen). Appending happens
// here (not at each call site) so a rapid double-tap that fires two `show*`
// calls before the first sheet has mounted can't stack two scrims — the
// second call is simply dropped. `.overlay`/`.dialog` render off-screen by
// default (see style.css) so the transition has somewhere to animate from —
// `.show` must be added on a later frame than the insert, or the browser
// coalesces both styles into one paint and the transition never runs.
export function mountOverlay(overlay, dismiss) {
  // Overlays already mid-close (closeOverlay set data-closing) are on their
  // way out via transitionend and don't count as "open" — e.g. a confirm
  // dialog's onConfirm synchronously opening the next sheet before the
  // confirm dialog's own close transition has finished removing it.
  if (document.querySelector('.overlay:not([data-closing]), .gift-reveal-overlay')) return false;
  document.body.appendChild(overlay);
  const dialog = overlay.querySelector('.dialog');
  if (dialog) enableSheetDrag(overlay, dialog, dismiss || (() => closeOverlay(overlay)));
  requestAnimationFrame(() => {
    requestAnimationFrame(() => overlay.classList.add('show'));
  });
  return true;
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

// Critically-damped-ish spring (damping ratio ~0.9): starts from the given
// velocity so a released drag hands off cleanly into the settle instead of
// cutting to a fixed-duration animation (see apple-design skill, §5 velocity
// handoff). `velocityPxMs` is the pointer's raw px/ms delta at release.
function springTranslateY(el, from, to, velocityPxMs, onSettle) {
  const stiffness = 420, damping = 38;
  let pos = from, vel = velocityPxMs * 1000, last = performance.now();
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 1 / 30);
    last = now;
    vel += (-stiffness * (pos - to) - damping * vel) * dt;
    pos += vel * dt;
    el.style.transform = `translateY(${pos}px)`;
    if (Math.abs(pos - to) < 0.5 && Math.abs(vel) < 30) {
      el.style.transform = to === 0 ? '' : `translateY(${to}px)`;
      onSettle?.();
      return;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

const SHEET_DISMISS_DISTANCE_RATIO = 0.35;
const SHEET_DISMISS_VELOCITY = 0.6; // px/ms

// Adds a grab handle to a sheet's `.dialog` and makes it swipe-to-dismiss:
// the sheet tracks the pointer 1:1 while dragging, then either springs back
// open or springs closed based on distance OR release velocity — never
// position alone (apple-design skill, §2-6: direct manipulation, momentum
// projection). Skipped under reduced motion, where sheets are dismissed by
// tap only (see the .dialog-handle reduced-motion rule in style.css).
function enableSheetDrag(overlay, dialog, dismiss) {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const handle = document.createElement('div');
  handle.className = 'dialog-handle';
  handle.setAttribute('aria-hidden', 'true');
  dialog.prepend(handle);

  let dragging = false, startY = 0, offsetY = 0, lastY = 0, lastT = 0, velocity = 0;

  handle.addEventListener('pointerdown', (e) => {
    if (overlay.dataset.closing) return;
    dragging = true;
    offsetY = 0;
    startY = lastY = e.clientY;
    lastT = performance.now();
    velocity = 0;
    dialog.style.transition = 'none';
    handle.setPointerCapture(e.pointerId);
  });

  handle.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const y = e.clientY;
    const now = performance.now();
    const dt = now - lastT;
    if (dt > 0) velocity = (y - lastY) / dt;
    lastY = y; lastT = now;
    offsetY = Math.max(0, y - startY); // sheets only dismiss downward, the direction they entered from
    dialog.style.transform = `translateY(${offsetY}px)`;
  });

  const onRelease = () => {
    if (!dragging) return;
    dragging = false;
    dialog.style.transition = '';
    const dialogHeight = dialog.getBoundingClientRect().height;
    const shouldDismiss = offsetY > dialogHeight * SHEET_DISMISS_DISTANCE_RATIO || velocity > SHEET_DISMISS_VELOCITY;
    if (shouldDismiss) springTranslateY(dialog, offsetY, dialogHeight, velocity, dismiss);
    else springTranslateY(dialog, offsetY, 0, velocity);
  };

  handle.addEventListener('pointerup', onRelease);
  handle.addEventListener('pointercancel', onRelease);
}
