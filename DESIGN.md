---
name: VoucherWise
description: A premium consumer wallet for vouchers, gift cards, and referral codes — trustworthy like fintech, warmer than one.
colors:
  primary: "#13B5A2"
  primary-light: "#CFF1E8"
  primary-dark: "#0E9488"
  secondary: "#9AA6B2"
  accent: "#FF7A59"
  ink: "#11233F"
  success: "#16A06B"
  success-light: "#D1FAF0"
  warning: "#F0932B"
  warning-light: "#FDF0DF"
  warning-deep: "#8A4B0A"
  danger: "#DC2626"
  danger-light: "#FEE2E2"
  neutral-surface: "#FFFFFF"
  neutral-bg: "#F4F1E8"
  neutral-border: "rgba(17, 35, 63, 0.08)"
  ink-hover: "#0C1A30"
  amber-ribbon: "#F98513"
  amber-ribbon-deep: "#D6710A"
  shadow-ink: "rgba(0, 0, 0, 0.1)"
  desktop-backdrop: "#DDD9CE"
  accent-deep: "#A83A0A"
  success-bright: "#7EEAD1"
  warning-bright: "#FFB199"
  danger-bright: "#FCA5A5"
  hero-mint: "#4FCDAE"
typography:
  display:
    fontFamily: "Cabinet Grotesk, General Sans, -apple-system, sans-serif"
    fontWeight: 800
    letterSpacing: "-0.02em"
  body:
    fontFamily: "General Sans, -apple-system, BlinkMacSystemFont, sans-serif"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "General Sans, -apple-system, sans-serif"
    fontWeight: 700
    letterSpacing: "0.03em"
  mono:
    fontFamily: "'SF Mono', 'Fira Code', monospace"
    fontWeight: 700
  gift-note:
    fontFamily: "Georgia, 'Times New Roman', serif"
    fontWeight: 400
rounded:
  micro: "2px"
  xs: "4px"
  icon-btn: "6px"
  sm: "8px"
  control: "10px"
  tab: "9px"
  chip: "12px"
  md: "14px"
  card-lg: "16px"
  card-xl: "18px"
  toggle-track: "13px"
  pill: "20px"
  avatar: "24px"
  sheet: "20px 20px 0 0"
  hero-scoop: "0 0 28px 28px"
spacing:
  xs: "6px"
  sm: "10px"
  md: "16px"
  lg: "20px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#FFFFFF"
    rounded: "10px"
    padding: "12px 20px"
  button-primary-hover:
    backgroundColor: "{colors.primary-dark}"
  button-secondary:
    backgroundColor: "{colors.neutral-surface}"
    textColor: "{colors.primary}"
    rounded: "10px"
    padding: "12px 20px"
  badge-primary:
    backgroundColor: "{colors.primary-light}"
    textColor: "{colors.primary-dark}"
    rounded: "20px"
---

# Design System: VoucherWise

## Overview

**Creative North Star: "The Warm Vault"**

VoucherWise is a place of custody, not a discount bin: it holds real financial value (voucher codes, PINs, resale cash) and has to read as trustworthy at a glance, the way a banking app does. But the brief explicitly rejects fintech's "blue austerity" (Cleo / Copilot Money are the named comparables, not Revolut's cold minimalism) — so the vault is lined with warmth: a cream-and-glass material system, an emerald accent that reads as growth rather than corporate trust-blue, and rare, deliberate celebratory moments (the gift-reveal confetti) that never bleed into the everyday screens.

The system is calm by default and animates with purpose, not decoration. Every screen states voucher value, expiration, and price with the same unambiguous clarity a bank statement would use, and every surface is legible before it is charming.

**Key Characteristics:**
- A single sanctioned decorative move — the liquid-glass sheen — applied consistently across primary cards, never as one-off flourish.
- Warm cream base (`#F4F1E8`) instead of cold fintech white/gray, with a deep navy ink for text and structural surfaces (the voucher/listing detail header, gift cards).
- Emerald as the one confident accent; everything else in the palette is neutral or purely functional (success/warning/danger).
- A distinct self-hosted display face for numbers and headings — money and headlines are never rendered in the system font.

## Colors

The palette is deliberately narrow: one warm neutral base, one confident accent, and functional status colors that never compete with it.

### Primary
- **Emerald Sea** (`#13B5A2`): navigation active state, primary buttons, links, brand mark, big numerals (voucher/listing values). Variants: **Emerald Sea Light** (`#CFF1E8`) for tinted chip/badge backgrounds, **Emerald Sea Dark** (`#0E9488`) for hover states and emphasized primary text. Psychology: freshness, value, growth — deliberately not the "trust blue" every fintech competitor uses.
- **Hero Mint** (`#4FCDAE`): a lighter Emerald step used only as the second stop of the Home Hero's diagonal gradient (paired with Emerald Sea Dark, see Home Hero component) — not a general-purpose tint, doesn't appear anywhere else.

### Secondary
- **Slate Mist** (`#9AA6B2`): muted icons and supporting UI, neutral emphasis where full brand color would overpower the content; also the color of eyebrow-style section labels (`QUICK ACTIONS`, `MY WALLET`).

### Tertiary
- **Warm Coral** (`#FF7A59`): reserved for the one field that is about feeling rather than data — the gift note (personal message + sender) and the gift/celebration moments. Never used for standard UI actions. **Warm Coral Deep** (`#A83A0A`): the same hue darkened for the rare case where Warm Coral sits on a light surface at small text sizes — base Warm Coral measures only ~2.6:1 there, so small/bold gift-note labels (`.gift-note-card-header`, `.gift-note-display-sender`) use the deep variant to clear 4.5:1 without going gray.

### Warning / Amber
**Warning** (`#F0932B`) is the app's one general-purpose "attention" color — it now covers everything that isn't a destructive action: expiring/expired status badges and countdown text, required-field asterisks, the `.error-msg` banner, the pending-request notification dot, and the home "Expiring soon" alert (icon fill + `.vc-note-hint`). **Warning Light** (`#FDF0DF`) is its tinted background (badges, the expiring-alert card). **Warning Deep** (`#8A4B0A`) is the same hue darkened for small/bold text sitting directly on Warning Light or another near-white surface (e.g. the expiring-alert title) — same accessibility pattern as Warm Coral Deep, needed because base Warning only measures ~2.4:1 there.

### Danger (narrow, deliberately)
**Danger** (`#DC2626`, light `#FEE2E2`) is reserved strictly for two things: destructive actions (`.btn-danger` — Delete Voucher, Remove Listing, Decline, Remove friend) and the Log Out row. Every other place red used to appear (status badges, validation markers, error text, notification dots) has moved to Warning orange, above — red now means "this undoes or removes something," full stop.

### Status colors on dark surfaces
Success/warning/danger keep their hue family but need lighter, brightened steps to read on the navy detail-header gradient instead of their default light-surface backgrounds: **Success Bright** (`#7EEAD1`), **Warning Bright** (`#FFB199`), **Danger Bright** (`#FCA5A5`) — used only for status badges/text sitting directly on the Deep Navy Ink gradient (the voucher/listing detail header).

### Neutral
- **Deep Navy Ink** (`#11233F`): all body/heading text, the voucher/listing detail-header gradient, the toast background.
- **Deep Navy Ink Hover** (`#0C1A30`): pressed/hover state for `.btn-dark` only.
- **Warm Cream** (`#F4F1E8`): page background — the thing that separates this from a cold fintech app.
- **Pure White** (`#FFFFFF`): card and input surfaces (`--surface`), and the liquid-glass gradient's light end.
- **Hairline Navy** (`rgba(17,35,63,0.08)`): borders and dividers throughout.
- **Shadow Ink** (`rgba(0,0,0,0.1)`): the neutral-black shadow component inside the glass-card recipe (see Elevation & Depth) — intentionally pure black-alpha, never brand-tinted, so shadows read as physical depth rather than a colored glow.

### Signature accent (gifting only)
- **Amber Ribbon** (`#F98513`, deep `#D6710A`): the gift-box ribbon/bow and the profile page's avatar gradient. A second warm accent used exclusively for gifting/celebration touches — never for standard UI, same restraint as Warm Coral. (The Home Hero's own avatar is deliberately plain — a translucent glass circle, not this gradient — see Home Hero component.)

### Category Colors (Referrals, Discover, and Wallet voucher cards)
A fixed hue-per-category palette, used only where category is a filterable/identifying facet a user scans quickly (Referral code cards + their category filter chips, Discover brand cards + their category filter chips, the category badge on a Wallet voucher card) — never for standard UI actions or status. Deliberately muted/desaturated rather than a vivid Tailwind-style hue, so the badges read as calm identification, not alerts. Each category badge/chip pairs a drawn line icon (`stroke="currentColor"`, matching the rest of the icon set — never emoji) with its color: light 14%-alpha tint as the resting background, full-strength color as text/icon; a selected filter chip inverts to a solid fill with white text. Defined in `src/core/categories.js` (`CATEGORY_META`), not duplicated here as literals.
- **Food & Drink** (`#C1723F`, cup) · **Shopping** (`#B15A93`, bag) · **Travel** (`#5482C4`, plane) · **Entertainment** (`#7069B8`, ticket) · **Finance** (`#3E8794`, card) · **Sports and Health** (`#8873C4`, controller) · **Beauty & Wellness** (`#C97AA0`, sparkle) · **Sustainability** (`#5F9E5F`, leaf) · **Mobility** (`#77839A`, car) · **Other** (`#9AA6B2`, tag)

### Named Rules
**The One Accent Rule.** Emerald is the only color allowed to signal "this is interactive/primary" on a calm screen. Warning orange is the only color allowed to signal "pay attention" (status, validation, alerts); Danger red is the only color allowed to signal "this is destructive." Neither may be reused decoratively or swapped for the other. Warm Coral and Amber Ribbon are the two narrow, named exceptions for feeling-first gifting moments — they still may never be used for a standard button, link, or status. Category Colors are a third, bounded exception: they identify *which category*, nowhere else, and never substitute for a status or action color.

## Typography

**Display Font:** Cabinet Grotesk (weights 500/700/800), self-hosted at `/public/fonts/`
**Body Font:** General Sans (weights 400/500/600/700), self-hosted at `/public/fonts/`
**Label/Mono Font:** `'SF Mono', 'Fira Code', monospace` — used for voucher/referral codes (a real "measurement/data" use, not a technical costume), and also for the personal gift message (compose textarea, its display, and the card preview) so a handwritten note reads distinctly from the rest of the (functional) app.

**Character:** A geometric-but-warm grotesque pairing from the same foundry family — confident enough for a fintech-adjacent product, rounder and friendlier than a system UI face. Both are self-hosted; the previous system-font stack (Arial/Helvetica/Segoe UI) has been fully retired as the brand voice.

### Hierarchy
- **Display** (Cabinet Grotesk 800, 1.875rem `h1` / 2–2.5rem money numerals, -0.02em tracking): screen titles, voucher/listing detail values, KPI headline numbers.
- **Headline** (Cabinet Grotesk 700, 1.4375rem, -0.015em): section headers (`h2`).
- **Title** (Cabinet Grotesk 700, 1.0625rem, -0.01em): card/list headers (`h3`).
- **Body** (General Sans 400/500, 0.875–0.9375rem, 1.5 line-height): all reading text, form inputs, descriptions.
- **Label** (General Sans 700–800, 0.6875–0.75rem, 0.03–0.07em tracking, uppercase): badges, KPI/detail-item labels, and section eyebrows — including standalone kickers above a section (`QUICK ACTIONS`, `MY WALLET`, in Slate Mist), not just labels attached to a value.

### Named Rules
**The No-System-Font Rule.** Cabinet Grotesk and General Sans are the brand voice; the system sans stack is a loading fallback only, never a deliberate choice.
**The Calm-Bold Rule.** Card-level identity text (voucher brand name, quick-action captions, the expiring-alert title) uses 600 weight, not 700/800 — bold enough to anchor the card, calm enough not to out-shout the money numerals next to it. Reserve 700+ for badges, buttons, and headings.

## Layout

Single-column mobile-first shell, `max-width: 480px`, centered with a visible drop shadow on wider viewports (the app reads as a "device" floating on a `#DDD9CE` desktop backdrop rather than stretching full-width). Fixed header (56px) and bottom nav (76px + safe-area), content scrolls between them with 16px horizontal padding. Spacing rhythm is tight-to-generous: 8–10px within a component (icon-to-label, chip gaps), 12–16px between related elements (card internal padding, grid gaps), 20–24px between sections. Cards stack in a single flex column with 10px gaps — no dense multi-column feeds; this is a wallet, not a marketplace grid.

**Exception — Home tab.** The Home tab replaces the fixed 56px header with a full-bleed gradient Home Hero that scrolls away with the page (see Home Hero component below); every other tab keeps the fixed header.

## Elevation & Depth

Hybrid: flat utility surfaces (list rows, settings items) sit directly on the cream background, while primary content cards use the liquid-glass system — translucency plus blur, not a flat drop shadow — as the depth cue. Where a shadow is used, it is layered: a soft ambient shadow (`--shadow` / `--shadow-md` / `--shadow-lg`) plus an inset highlight along the top edge to sell the glass's light-catching bevel.

### Shadow Vocabulary
- **Ambient resting** (`0 1px 3px rgba(17,35,63,0.05), 0 2px 8px rgba(17,35,63,0.04)`): flat surfaces at rest (tabs, chips).
- **Glass card** (`inset 0 1px 0 rgba(255,255,255,0.7), 0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1)`): every liquid-glass surface — voucher/listing/referral cards, quick actions, KPI cards, settings list.
- **Lifted** (`--shadow-lg`): FABs and the primary CTA that floats over content.

### Named Rules
**The Glass-Is-The-One-Decoration Rule.** `backdrop-filter: blur(20px) saturate(180%)` plus the diagonal white-to-cream sheen is the single sanctioned decorative surface treatment (per Brand Commitments in PRODUCT.md). It must be applied identically everywhere a primary content card appears — voucher, listing, and referral cards all match — and must never appear as a one-off on a single screen.

## Shapes

Generous, consistent rounding on a real scale, softer as elements get smaller or more casual: `2px` (`rounded.micro`) for tiny decorative pieces (confetti), `4px` (`rounded.xs`) for tags/badges/tiny thumbnails, `6px` (`rounded.icon-btn`) for small icon-only buttons, `8px` (`rounded.sm`) for small tiles and dropdown items, `9px` (`rounded.tab`) for the inner active pill of a segmented tab track, `10px` (`rounded.control`) for buttons/inputs/icon buttons, `12px` (`rounded.chip`) for segmented-tab/toggle track containers, `13px` (`rounded.toggle-track`) for the push-toggle switch (always half its own height, so it reads as a true pill regardless of size), `14px` (`rounded.md`) for cards and detail headers, `16px` (`rounded.card-lg`) for the voucher card specifically — slightly more generous than other cards as the flagship surface, `18px` (`rounded.card-xl`) for the home Quick Action and Portfolio cards, `20px`+ (`rounded.pill`) for chips/badges/FAB, `24px` (`rounded.avatar`) for the profile avatar specifically. Bottom sheets/dialogs round only the top corners (`rounded.sheet`, `20px 20px 0 0`) since they dock to the screen edge; the Home Hero rounds only its *bottom* corners (`rounded.hero-scoop`, `0 0 28px 28px`), the mirror case, since it docks to the top of the screen instead. No sharp corners anywhere in the system — softness is part of the "warmth" brief. Borders are hairline (1–1.5px) and low-contrast (`rgba(17,35,63,0.08)` or `rgba(255,255,255,0.4)` on glass), never used as a color-coded status signal (status lives in badge text/color and background tint only — see Do's and Don'ts).

## Components

### Buttons
- **Shape:** 10px radius (8px for `.btn-sm`), pill-adjacent but not fully round.
- **Primary:** Emerald fill, white text, 12px/20px padding, `scale(0.97)` on press.
- **Secondary/Outline:** white or transparent fill, Emerald text and 1.5px Emerald border.
- **Ghost:** neutral gray-light fill for low-emphasis actions.
- **Dark:** navy fill, used sparingly for high-contrast CTAs against light surfaces.

### Chips
- **Style:** pill radius, white surface with hairline border at rest; selected state fills with Emerald-light background and Emerald-dark text.
- **State:** used for both filters (multi-option) and inline tabs (segmented, gray-light track with a white+shadow active pill).

### Cards / Containers
- **Corner Style:** 14px (16px on voucher cards specifically, slightly more generous as the flagship surface; 18px on the home Quick Action / Portfolio cards — see those components).
- **Background:** liquid-glass gradient (`rgba(255,255,255,0.8)` → `rgba(244,241,232,0.35)`, 135deg) for every primary browsable card; flat white for small utility wrappers and dense data tiles (detail-item grid) where legibility of packed text outranks the glass effect.
- **Shadow Strategy:** see Elevation & Depth's Glass card recipe.
- **Border:** 1px `rgba(255,255,255,0.4)` on glass surfaces.
- **Internal Padding:** 14–16px.

### Inputs / Fields
- **Style:** 1.5px hairline border, 10px radius, white surface, 12–14px padding.
- **Focus:** border shifts to Emerald plus a 3px soft Emerald glow (`box-shadow: 0 0 0 3px rgba(19,181,162,0.12)`).
- **Error:** dedicated `.error-msg` banner (warning-light background, warning text — see Danger, narrow, deliberately), not a red border alone.

### Navigation
- Fixed bottom nav, 6 items (Home, Discover, Wallet, Market, Referrals, Profile), authored SVG icons (22px, 2px stroke) over a text label; active state is Emerald icon+label color only — no pill/background behind the active item.
- Header is centered-title with fixed-width left/right slots so the back button and any right action never shift the title off-center. (Home tab: see Home Hero, which replaces the header entirely on that one screen.)

### Home Hero
The one deliberate departure from the fixed-header shell (see Layout's Home tab exception). A full-bleed banner in a diagonal Emerald gradient (`linear-gradient(150deg, #0E9488 0%, #4FCDAE 100%)`, 150deg), rounded only on the bottom corners (`rounded.hero-scoop`), with two soft white radial "orb" shapes bleeding off the top-right and bottom-left corners for texture — the one place in the system large decorative circles are allowed, scoped to this single component. Contains, top row: greeting + first name in white, and two 38px translucent-white circular icon buttons (`rgba(255,255,255,0.22)` fill) for notifications (authored bell icon) and profile (initial letter, not the Amber Ribbon gradient avatar used elsewhere); a Warning-colored dot marks unread state on the bell. Below that: a translucent glass stat row (`rgba(255,255,255,0.16)` fill, hairline white border) with three stats (Active / Total Value / Expiring) in white — no per-stat status coloring, all three read the same weight so the banner stays calm.

### Quick Actions
Three-up grid of squircle cards (`rounded.card-xl`, liquid-glass background) below a `QUICK ACTIONS` eyebrow label (Label typography, Slate Mist). Each card: a 56px icon tile (`rounded.card-xl` minus 2px, Emerald Sea Light fill, Emerald Sea icon) centered above a caption (Body 600, per the Calm-Bold Rule). Icons are plain and literal (a `+` for Add Voucher, a shopping bag for Marketplace) — no compound/illustrative icon glyphs.

### Portfolio Card
A liquid-glass card (matching Quick Actions) showing category spend as a donut + legend. Header: a small Emerald trending-up icon + "Portfolio" (Title), and the total value right-aligned in Emerald Sea bold. The ring is pure CSS (`conic-gradient` with a punched-out center, no charting library), colored from a dedicated soft-teal ramp — `#3AAE9C → #5CC2AE → #7ED3C0 → #A3E0D0 → #C4EBE0 → #DFF5EE` — assigned darkest-first to the largest category so the chart always reads darkest-to-lightest. Segments are separated by a small, *equal-width* gap at every boundary, including the seam where the last slice meets the first — never a gap everywhere except the wrap-around. Legend rows: colored dot, category label (Body, muted), amount (Body 700, right-aligned). This ramp is intentionally distinct from Warning orange — it's data-viz, not a status signal.

### Expiring Alert
A compact single-row warning card (Warning Light fill, hairline Warning-tinted border, `rounded.md`) used on the Home Hero for the single most urgent expiring voucher — deliberately slimmer than a full `.voucher-card`. Left: a 36px Warning-filled circle with a white authored warning-triangle icon. Middle: title "Expiring soon" in Warning Deep at Body 600 (Calm-Bold Rule — not a shouty 700 red), subtitle in muted Body with brand, value, and expiry date. Right: a "Use now" text link in base Warning.

### Status Communication (signature pattern)
Voucher/listing status (active, expiring, expired, used, sold, listed) is communicated through the existing `badge` component and inline colored text (e.g. "3d left" in warning color) plus, for the listed state only, a full background tint on the card. It is never communicated through a colored card border — that pattern existed in the wallet card previously and has been removed as a craft-floor violation (redundant with the badge, and a banned "colored border-left" pattern).

## Do's and Don'ts

### Do:
- **Do** use the liquid-glass recipe verbatim (gradient + `blur(20px) saturate(180%)` + inset highlight) on every primary content card, including newly added ones — referral cards were unified into this system as part of this pass.
- **Do** render every icon as an authored SVG from `core/ui.js`'s shared `icon`/`navIcons` set, 2–2.5px stroke, rounded caps.
- **Do** keep the accent coral (`#FF7A59`) reserved for the gift-note/celebration moments only.
- **Do** set display type (Cabinet Grotesk) on money values and headings; body copy stays in General Sans.
- **Do** use Warning orange for any non-destructive alert, status, or validation signal (expiring/expired, required fields, error banners, notification dots); reserve Danger red strictly for delete actions and Log Out (see Danger, narrow, deliberately).
- **Do** use 600 weight for card-level identity labels (voucher brand name, quick-action captions, alert titles) per the Calm-Bold Rule — 700+ is for badges, buttons, and headings only.

### Don't:
- **Don't** reintroduce a colored border-left/right on cards or list items as a status signal — use the badge + tint pattern instead.
- **Don't** use emoji as a stand-in for the icon system on interactive controls (filter chips, action buttons, sort selects). A small number of emoji remain intentionally in the warm, personal gift-note copy (the note card's "💌", the reveal flow) — that is a deliberate exception for a feeling-first moment, not a precedent for functional UI.
- **Don't** fall back to the system font stack as a deliberate choice; Cabinet Grotesk/General Sans are loaded and should always resolve.
- **Don't** add a second accent color or a second decorative surface treatment alongside liquid-glass; the brief is explicit that restraint is the point. (The Home Hero's orb shapes and the Portfolio donut ramp are the two narrow, named exceptions — each scoped to exactly one component, not a general pattern.)
- **Don't** use Danger red for anything other than a delete action or Log Out — reach for Warning orange instead.
