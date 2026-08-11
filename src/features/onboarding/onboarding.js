// Post-"Get started" onboarding: a skippable, brand-led value carousel
// (views.js#viewOnboardingIntro) shown before signup, and a skippable
// "what are you into?" interests screen (views.js#viewOnboardingInterests)
// shown right after a brand-new account is confirmed — never for a
// returning login, see router.js's isEmailConfirm-gated routing and
// auth.js's register(). Interests are saved to public.users.interests and,
// same trip, unlock a themed welcome-gift voucher dropped straight into the
// new user's wallet with the same gift-reveal treatment as a friend's gift
// (features/social/gifting.js) — VoucherWise's one other approved
// "rare, first-time celebratory moment" (see BRAND_GUIDELINES.md).
import { supabase } from '../../lib/supabase.js';
import { state } from '../../core/state.js';
import { esc, mountOverlay, closeOverlay, spawnConfetti } from '../../core/dom.js';
import { saveVoucher, formatVoucherValue } from '../wallet/vouchers.js';
import { categoryMeta } from '../../core/categories.js';
import { navIcons } from '../../core/ui.js';
import { go } from '../../core/router.js';

// Four dream-result slides, one per pillar — the headline is the outcome,
// never the feature name (that only appears as the small kicker tag above
// it). Each pillar carries its own accent color so the carousel reads as
// four distinct, vivid moments instead of one flat teal screen — approved
// product copy, do not rephrase.
export const ONBOARDING_SLIDES = [
  {
    icon: 'wallet',
    kicker: 'Wallet',
    title: 'Never let another gift card expire',
    body: 'All your vouchers, organised — one place for every gift card and code, with reminders before anything expires, and one tap to gift one on.',
    color: '#13B5A2',
    colorDark: '#0E9488',
  },
  {
    icon: 'link',
    kicker: 'Referral Hub',
    title: 'Discover and share codes',
    body: 'Find referral codes before you spend, and share your own — you and your friend both win.',
    color: '#8A6FE8',
    colorDark: '#6952C9',
  },
  {
    icon: 'exchange',
    kicker: 'Marketplace',
    title: 'Turn dead value into real value',
    body: "Sell a gift card you'll never use for cash, or buy someone else's at a discount.",
    color: '#FF7A59',
    colorDark: '#F5883C',
  },
  {
    icon: 'compass',
    kicker: 'Discovery Feed',
    title: 'Discover your next gift card',
    body: 'A browsable feed of vouchers and offers, filtered by the categories and region you care about.',
    color: '#3E8CE0',
    colorDark: '#2A6FC0',
  },
];

// Curated, thematically-matched welcome gifts — deliberately not one per
// CATEGORIES entry (some categories don't have a natural "discount" shape).
// Sustainability -> Planet B is the flagship, explicitly always granted
// when picked, regardless of what else was selected alongside it.
const CURATED_GIFTS = {
  'Sustainability': { brand: 'Planet B',           code: 'PLANETB10', valueDescription: '10% off your next eco-friendly voucher' },
  'Food & Drink':   { brand: 'Table For You',      code: 'TASTE10',   valueDescription: '10% off your next dining voucher' },
  'Travel':         { brand: 'Wanderline',         code: 'WANDER10',  valueDescription: '10% off your next travel voucher' },
  'Entertainment':  { brand: 'Encore',             code: 'PLAYON10',  valueDescription: '10% off your next entertainment voucher' },
  'Shopping':       { brand: 'VoucherWise Picks',  code: 'SHOP10',    valueDescription: '10% off your next shopping voucher' },
};
const FALLBACK_GIFT = { brand: 'VoucherWise', code: 'HELLO10', valueDescription: '10% welcome credit toward your next voucher' };

// Picking any interest always earns a gift (Skip earns none) — Sustainability
// wins if present (the flagship example from product), otherwise the first
// selected interest with a curated match, otherwise a generic fallback so
// "pick something, get a surprise" always holds true.
export function pickWelcomeGift(interests) {
  if (!interests.length) return null;
  const category = interests.includes('Sustainability') ? 'Sustainability' : (interests.find(i => CURATED_GIFTS[i]) || interests[0]);
  const gift = CURATED_GIFTS[category] || FALLBACK_GIFT;
  return { ...gift, category };
}

// Box opens -> confetti bursts -> the gift card is revealed — same choreography
// as gifting.js's showGiftRevealAnimation, kept as a separate function (not a
// shared one taking a "mode" flag) since the two moments have different
// copy/context and no other coupling; duplicating ~15 lines of markup here
// beats threading conditionals through the friend-gift code path.
function showWelcomeGiftReveal(gift, blurb) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'gift-reveal-overlay';
    overlay.innerHTML = `
      <div class="gift-reveal-stage">
        <div class="confetti-layer" id="ob-confetti"></div>
        <div class="gift-box" id="ob-gift-box">
          <div class="gift-box-lid"><div class="gift-box-bow"></div></div>
          <div class="gift-box-base"><div class="gift-box-ribbon"></div></div>
        </div>
        <div class="gift-reveal-card" id="ob-gift-card">
          <div class="gift-reveal-card-brand">${esc(gift.brand)}</div>
          <div class="gift-reveal-card-value">${formatVoucherValue({ valueDescription: gift.valueDescription }, null, false)}</div>
        </div>
      </div>
      <div class="gift-note-display gift-reveal-note">
        <div class="gift-note-display-icon">🎁</div>
        <p class="gift-note-display-message">${esc(blurb)}</p>
        <p class="gift-note-display-sender">From VoucherWise</p>
      </div>
      <h3 class="gift-reveal-caption">Your welcome gift!</h3>
      <p class="gift-reveal-subcaption">${esc(gift.brand)} is now in your wallet.</p>
      <button type="button" class="btn btn-primary gift-reveal-continue" id="ob-gift-continue">Awesome!</button>
    `;
    document.body.appendChild(overlay);

    const confettiLayer = overlay.querySelector('#ob-confetti');
    spawnConfetti(confettiLayer, ['#13B5A2', '#F98513', '#2BD4BE', '#D6710A', '#FFFFFF']);

    const boxEl  = overlay.querySelector('#ob-gift-box');
    const cardEl = overlay.querySelector('#ob-gift-card');
    const continueBtn = overlay.querySelector('#ob-gift-continue');

    const timers = [
      setTimeout(() => boxEl.classList.add('open'), 450),
      setTimeout(() => confettiLayer.classList.add('burst'), 500),
      setTimeout(() => cardEl.classList.add('revealed'), 850),
      setTimeout(() => { continueBtn.classList.add('show'); }, 1600),
    ];

    const finish = () => { timers.forEach(clearTimeout); overlay.remove(); resolve(); };
    continueBtn.addEventListener('click', finish);
    overlay.addEventListener('click', e => { if (e.target === overlay) finish(); });
  });
}

// One-time "here's what else is in here" moment shown right after a brand-new
// user lands on Home — three dream-result teasers (not a feature list) the
// user taps to go find themselves, satisfying "discovery sheets" without
// listing every screen in the app. Only ever called once, from the tail end
// of finishOnboardingInterests(), so no extra shown-before flag is needed.
function showDiscoverySheet() {
  const rows = [
    { nav: 'marketplace', icon: navIcons.marketplace, title: 'Sell what you won’t use', body: 'List a spare voucher and let someone else enjoy the value.' },
    { nav: 'discover',    icon: navIcons.discover,    title: 'Fresh gift cards, sourced for you', body: 'Buy straight from the brand — no waiting for a sale.' },
    { nav: 'referrals',   icon: navIcons.referrals,   title: 'Perks your friends are sharing', body: 'Browse referral codes across your trusted community.' },
  ];
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `
  <div class="dialog">
    <h3>There's more to discover</h3>
    <p>A few places worth a look, whenever you're ready.</p>
    <div class="discovery-sheet-rows">
      ${rows.map(r => `
      <button type="button" class="discovery-sheet-row" data-nav="${r.nav}">
        <span class="discovery-sheet-row-icon">${r.icon}</span>
        <span class="discovery-sheet-row-text">
          <span class="discovery-sheet-row-title">${esc(r.title)}</span>
          <span class="discovery-sheet-row-body">${esc(r.body)}</span>
        </span>
      </button>`).join('')}
    </div>
    <div class="dialog-actions">
      <button type="button" class="btn btn-ghost btn-full" id="discovery-sheet-done">Got it</button>
    </div>
  </div>`;
  const close = () => closeOverlay(overlay);
  if (!mountOverlay(overlay, close)) return;
  overlay.querySelector('#discovery-sheet-done').addEventListener('click', close);
  overlay.querySelectorAll('[data-nav]').forEach(btn => btn.addEventListener('click', close));
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
}

// Persists the interests pick (or the empty-array skip) and, if any interest
// was picked, grants + reveals the matching welcome-gift voucher. Called by
// events.js for both "Skip for now" and the primary continue button — the
// only difference is whether state.onboardingInterests has anything in it.
export async function finishOnboardingInterests() {
  const interests = [...state.onboardingInterests];
  const { error } = await supabase
    .from('users')
    .update({ interests, onboarding_completed_at: new Date().toISOString() })
    .eq('id', state.currentUser.id);
  if (error) console.error('finishOnboardingInterests error:', error); // non-fatal — still land the user on Home

  const gift = pickWelcomeGift(interests);
  let savedGift = null;
  if (gift) {
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + 90);
    const { label } = categoryMeta(gift.category);
    const blurb = `You told us you're into ${label} — here's a little something to match.`;
    try {
      await saveVoucher({
        brand:            gift.brand,
        valueMode:        'description',
        valueDescription: gift.valueDescription,
        category:         gift.category,
        code:             gift.code,
        expiryDate:       expiry.toISOString().slice(0, 10),
        giftSender:       'VoucherWise',
        giftMessage:      blurb,
      });
      savedGift = { gift, blurb };
    } catch (err) {
      console.error('welcome gift voucher save error:', err); // fall through — still land on Home, just no reveal
    }
  }

  await go('home', {}, { replace: true });
  if (savedGift) await showWelcomeGiftReveal(savedGift.gift, savedGift.blurb);
  showDiscoverySheet();
}
