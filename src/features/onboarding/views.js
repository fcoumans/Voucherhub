// Onboarding screens: the pre-signup value carousel (viewOnboardingIntro,
// reached from Welcome's "Get started") and the post-signup "what are you
// into?" screen (viewOnboardingInterests, reached only for a brand-new
// confirmed signup — see router.js). Both are skippable at every step.
import { state, CATEGORIES } from '../../core/state.js';
import { esc } from '../../core/dom.js';
import { icon } from '../../core/ui.js';
import { categoryMeta } from '../../core/categories.js';
import { ONBOARDING_SLIDES } from './onboarding.js';

// 48x48, 2px stroke — one size up from core/ui.js's 24px icon language since
// these are the single focal element of a full slide, not inline chrome.
const SLIDE_ICONS = {
  wallet:   `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 14v-3a4 4 0 014-4h12a4 4 0 014 4v3"/><rect x="4" y="14" width="40" height="28" rx="7"/><path d="M4 22h40"/><circle cx="33" cy="30" r="2.5" fill="currentColor" stroke="none"/></svg>`,
  link:     `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 28a7.2 7.2 0 010-9.5l5-5a7.2 7.2 0 0110.5 9.9l-2.5 2.6"/><path d="M28 20a7.2 7.2 0 010 9.5l-5 5a7.2 7.2 0 01-10.5-9.9l2.5-2.6"/></svg>`,
  exchange: `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 17h30M38 17l-7-7M38 17l-7 7"/><path d="M40 31H10M10 31l7-7M10 31l7 7"/></svg>`,
  compass:  `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="24" cy="24" r="19"/><polygon points="32 16 28 28 16 32 20 20 32 16"/></svg>`,
};

function onboardingTopbar(showBack) {
  return `
  <div class="onboarding-topbar">
    ${showBack ? `<button type="button" class="btn-icon onboarding-back" data-onboarding-slide="${state.onboardingSlide - 1}">${icon.back}</button>` : '<span></span>'}
    <button type="button" class="link-btn onboarding-skip" data-nav="auth" data-tab="signup">Skip</button>
  </div>`;
}

export function viewOnboardingIntro() {
  const i = Math.min(state.onboardingSlide, ONBOARDING_SLIDES.length - 1);
  const slide = ONBOARDING_SLIDES[i];
  const isLast = i === ONBOARDING_SLIDES.length - 1;
  return `
  <div class="onboarding-screen" style="--slide-color:${slide.color};--slide-color-dark:${slide.colorDark}">
    ${onboardingTopbar(i > 0)}
    <div class="onboarding-slide">
      <div class="onboarding-icon-wrap">
        <span class="onboarding-shape onboarding-shape-1"></span>
        <span class="onboarding-shape onboarding-shape-2"></span>
        <span class="onboarding-shape onboarding-shape-3"></span>
        <div class="onboarding-icon">${SLIDE_ICONS[slide.icon]}</div>
      </div>
      <span class="onboarding-kicker">${esc(slide.kicker)}</span>
      <h1 class="onboarding-title">${esc(slide.title)}</h1>
      <p class="onboarding-body">${esc(slide.body)}</p>
    </div>
    <div class="onboarding-footer">
      <div class="onboarding-dots" role="tablist" aria-label="Onboarding progress">
        ${ONBOARDING_SLIDES.map((s, idx) => `<button type="button" class="onboarding-dot ${idx === i ? 'active' : ''}" data-onboarding-slide="${idx}" style="--dot-color:${s.color}" aria-label="Slide ${idx + 1}"></button>`).join('')}
      </div>
      ${isLast
        ? `<button type="button" class="btn btn-dark btn-full" data-nav="auth" data-tab="signup">Get started</button>`
        : `<button type="button" class="btn btn-full onboarding-next-btn" data-onboarding-slide="${i + 1}">Next</button>`}
    </div>
  </div>`;
}

export function viewOnboardingInterests() {
  const picks = state.onboardingInterests;
  const chips = CATEGORIES.filter(c => c !== 'Other').map(c => {
    const { icon: catIcon, color } = categoryMeta(c);
    const active = picks.has(c);
    return `
    <button type="button" class="onboarding-interest-chip ${active ? 'active' : ''}" data-onboarding-interest="${esc(c)}" style="--chip-color:${color}">
      <span class="onboarding-interest-chip-icon">${catIcon}</span>
      <span class="onboarding-interest-chip-label">${esc(c)}</span>
      <span class="onboarding-interest-chip-check">${icon.check}</span>
    </button>`;
  }).join('');

  return `
  <div class="onboarding-screen onboarding-interests-screen">
    <div class="onboarding-topbar">
      <span></span>
      <button type="button" class="link-btn onboarding-skip" data-action="onboarding-finish">Skip for now</button>
    </div>
    <div class="onboarding-interests-header">
      <div class="onboarding-interests-badge">${icon.gift}</div>
      <h1 class="onboarding-title">VoucherWise, full of surprises</h1>
      <p class="onboarding-body">We've got a little welcome gift for you. Tell us what you're into, and we'll surprise you with something you'll actually use.</p>
    </div>
    <div class="onboarding-interest-grid">${chips}</div>
    <div class="onboarding-footer">
      <button type="button" class="btn btn-dark btn-full" data-action="onboarding-finish">${picks.size ? 'Reveal my gift' : 'Continue'}</button>
    </div>
  </div>`;
}
