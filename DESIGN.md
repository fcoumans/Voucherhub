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
  warning: "#E5562F"
  warning-light: "#FFE7DF"
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
  toggle-track: "13px"
  pill: "20px"
  avatar: "24px"
  sheet: "20px 20px 0 0"
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
- Warm cream base (`#F4F1E8`) instead of cold fintech white/gray, with a deep navy ink for text and structural surfaces (the stats card, gift cards).
- Emerald as the one confident accent; everything else in the palette is neutral or purely functional (success/warning/danger).
- A distinct self-hosted display face for numbers and headings — money and headlines are never rendered in the system font.

## Colors

The palette is deliberately narrow: one warm neutral base, one confident accent, and functional status colors that never compete with it.

### Primary
- **Emerald Sea** (`#13B5A2`): navigation active state, primary buttons, links, brand mark, big numerals (voucher/listing values). Variants: **Emerald Sea Light** (`#CFF1E8`) for tinted chip/badge backgrounds, **Emerald Sea Dark** (`#0E9488`) for hover states and emphasized primary text. Psychology: freshness, value, growth — deliberately not the "trust blue" every fintech competitor uses.

### Secondary
- **Slate Mist** (`#9AA6B2`): muted icons and supporting UI, neutral emphasis where full brand color would overpower the content.

### Tertiary
- **Warm Coral** (`#FF7A59`): reserved for the one field that is about feeling rather than data — the gift note (personal message + sender) and the gift/celebration moments. Never used for standard UI actions. **Warm Coral Deep** (`#A83A0A`): the same hue darkened for the rare case where Warm Coral sits on a light surface at small text sizes — base Warm Coral measures only ~2.6:1 there, so small/bold gift-note labels (`.vc-note-hint`, `.gift-note-card-header`, `.gift-note-display-sender`) use the deep variant to clear 4.5:1 without going gray.

### Status colors on dark surfaces
Success/warning/danger keep their hue family but need lighter, brightened steps to read on the navy detail-header/stats-card gradient instead of their default light-surface backgrounds: **Success Bright** (`#7EEAD1`), **Warning Bright** (`#FFB199`), **Danger Bright** (`#FCA5A5`) — used only for status badges/text sitting directly on the Deep Navy Ink gradient.

### Neutral
- **Deep Navy Ink** (`#11233F`): all body/heading text, the stats-card and voucher/listing detail-header gradients, the toast background.
- **Deep Navy Ink Hover** (`#0C1A30`): pressed/hover state for `.btn-dark` only.
- **Warm Cream** (`#F4F1E8`): page background — the thing that separates this from a cold fintech app.
- **Pure White** (`#FFFFFF`): card and input surfaces (`--surface`), and the liquid-glass gradient's light end.
- **Hairline Navy** (`rgba(17,35,63,0.08)`): borders and dividers throughout.
- **Shadow Ink** (`rgba(0,0,0,0.1)`): the neutral-black shadow component inside the glass-card recipe (see Elevation & Depth) — intentionally pure black-alpha, never brand-tinted, so shadows read as physical depth rather than a colored glow.

### Signature accent (gifting only)
- **Amber Ribbon** (`#F98513`, deep `#D6710A`): the gift-box ribbon/bow and the small avatar-badge gradient on the home header. A second warm accent used exclusively for gifting/celebration touches — never for standard UI, same restraint as Warm Coral.

### Named Rules
**The One Accent Rule.** Emerald is the only color allowed to signal "this is interactive/primary" on a calm screen. Success/warning/danger colors are reserved strictly for their semantic meaning (status badges, form errors) and must never be reused decoratively. Warm Coral and Amber Ribbon are the two narrow, named exceptions for feeling-first gifting moments — they still may never be used for a standard button, link, or status.

## Typography

**Display Font:** Cabinet Grotesk (weights 500/700/800), self-hosted at `/public/fonts/`
**Body Font:** General Sans (weights 400/500/600/700), self-hosted at `/public/fonts/`
**Label/Mono Font:** `'SF Mono', 'Fira Code', monospace` — reserved for voucher/referral codes only (a real "measurement/data" use, not a technical costume). **Gift Note Font:** `Georgia, 'Times New Roman', serif`, italic — the one deliberate typographic exception, used only for the personal gift message and its display, so a handwritten note reads distinctly from the rest of the (functional) app.

**Character:** A geometric-but-warm grotesque pairing from the same foundry family — confident enough for a fintech-adjacent product, rounder and friendlier than a system UI face. Both are self-hosted; the previous system-font stack (Arial/Helvetica/Segoe UI) has been fully retired as the brand voice.

### Hierarchy
- **Display** (Cabinet Grotesk 800, 1.875rem `h1` / 2–2.5rem money numerals, -0.02em tracking): screen titles, voucher/listing detail values, KPI headline numbers.
- **Headline** (Cabinet Grotesk 700, 1.4375rem, -0.015em): section headers (`h2`).
- **Title** (Cabinet Grotesk 700, 1.0625rem, -0.01em): card/list headers (`h3`).
- **Body** (General Sans 400/500, 0.875–0.9375rem, 1.5 line-height): all reading text, form inputs, descriptions.
- **Label** (General Sans 700, 0.6875–0.75rem, 0.03–0.04em tracking, uppercase): badges, KPI/detail-item labels, section eyebrows on stat blocks — reserved for short data labels attached to a value, never floating above a heading as a standalone kicker.

### Named Rules
**The No-System-Font Rule.** Cabinet Grotesk and General Sans are the brand voice; the system sans stack is a loading fallback only, never a deliberate choice.

## Layout

Single-column mobile-first shell, `max-width: 480px`, centered with a visible drop shadow on wider viewports (the app reads as a "device" floating on a `#DDD9CE` desktop backdrop rather than stretching full-width). Fixed header (56px) and bottom nav (76px + safe-area), content scrolls between them with 16px horizontal padding. Spacing rhythm is tight-to-generous: 8–10px within a component (icon-to-label, chip gaps), 12–16px between related elements (card internal padding, grid gaps), 20–24px between sections. Cards stack in a single flex column with 10px gaps — no dense multi-column feeds; this is a wallet, not a marketplace grid.

## Elevation & Depth

Hybrid: flat utility surfaces (list rows, settings items) sit directly on the cream background, while primary content cards use the liquid-glass system — translucency plus blur, not a flat drop shadow — as the depth cue. Where a shadow is used, it is layered: a soft ambient shadow (`--shadow` / `--shadow-md` / `--shadow-lg`) plus an inset highlight along the top edge to sell the glass's light-catching bevel.

### Shadow Vocabulary
- **Ambient resting** (`0 1px 3px rgba(17,35,63,0.05), 0 2px 8px rgba(17,35,63,0.04)`): flat surfaces at rest (tabs, chips).
- **Glass card** (`inset 0 1px 0 rgba(255,255,255,0.7), 0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1)`): every liquid-glass surface — voucher/listing/referral cards, quick actions, KPI cards, settings list.
- **Lifted** (`--shadow-lg`): FABs and the primary CTA that floats over content.

### Named Rules
**The Glass-Is-The-One-Decoration Rule.** `backdrop-filter: blur(20px) saturate(180%)` plus the diagonal white-to-cream sheen is the single sanctioned decorative surface treatment (per Brand Commitments in PRODUCT.md). It must be applied identically everywhere a primary content card appears — voucher, listing, and referral cards all match — and must never appear as a one-off on a single screen.

## Shapes

Generous, consistent rounding on a real scale, softer as elements get smaller or more casual: `2px` (`rounded.micro`) for tiny decorative pieces (confetti), `4px` (`rounded.xs`) for tags/badges/tiny thumbnails, `6px` (`rounded.icon-btn`) for small icon-only buttons, `8px` (`rounded.sm`) for small tiles and dropdown items, `9px` (`rounded.tab`) for the inner active pill of a segmented tab track, `10px` (`rounded.control`) for buttons/inputs/icon buttons, `12px` (`rounded.chip`) for segmented-tab/toggle track containers, `13px` (`rounded.toggle-track`) for the push-toggle switch (always half its own height, so it reads as a true pill regardless of size), `14px` (`rounded.md`) for cards and detail headers, `16px` (`rounded.card-lg`) for the voucher card specifically — slightly more generous than other cards as the flagship surface, `20px`+ (`rounded.pill`) for chips/badges/FAB, `24px` (`rounded.avatar`) for the profile avatar specifically. Bottom sheets/dialogs round only the top corners (`rounded.sheet`, `20px 20px 0 0`) since they dock to the screen edge. No sharp corners anywhere in the system — softness is part of the "warmth" brief. Borders are hairline (1–1.5px) and low-contrast (`rgba(17,35,63,0.08)` or `rgba(255,255,255,0.4)` on glass), never used as a color-coded status signal (status lives in badge text/color and background tint only — see Do's and Don'ts).

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
- **Corner Style:** 14px (16px on voucher cards specifically, slightly more generous as the flagship surface).
- **Background:** liquid-glass gradient (`rgba(255,255,255,0.8)` → `rgba(244,241,232,0.35)`, 135deg) for every primary browsable card; flat white for small utility wrappers and dense data tiles (detail-item grid) where legibility of packed text outranks the glass effect.
- **Shadow Strategy:** see Elevation & Depth's Glass card recipe.
- **Border:** 1px `rgba(255,255,255,0.4)` on glass surfaces.
- **Internal Padding:** 14–16px.

### Inputs / Fields
- **Style:** 1.5px hairline border, 10px radius, white surface, 12–14px padding.
- **Focus:** border shifts to Emerald plus a 3px soft Emerald glow (`box-shadow: 0 0 0 3px rgba(19,181,162,0.12)`).
- **Error:** dedicated `.error-msg` banner (danger-light background, danger text), not a red border alone.

### Navigation
- Fixed bottom nav, 5 items, authored SVG icons (22px, 2px stroke) over a text label; active state is Emerald icon+label color only — no pill/background behind the active item.
- Header is centered-title with fixed-width left/right slots so the back button and any right action never shift the title off-center.

### Status Communication (signature pattern)
Voucher/listing status (active, expiring, expired, used, sold, listed) is communicated through the existing `badge` component and inline colored text (e.g. "3d left" in warning color) plus, for the listed state only, a full background tint on the card. It is never communicated through a colored card border — that pattern existed in the wallet card previously and has been removed as a craft-floor violation (redundant with the badge, and a banned "colored border-left" pattern).

## Do's and Don'ts

### Do:
- **Do** use the liquid-glass recipe verbatim (gradient + `blur(20px) saturate(180%)` + inset highlight) on every primary content card, including newly added ones — referral cards were unified into this system as part of this pass.
- **Do** render every icon as an authored SVG from `core/ui.js`'s shared `icon`/`navIcons` set, 2–2.5px stroke, rounded caps.
- **Do** keep the accent coral (`#FF7A59`) reserved for the gift-note/celebration moments only.
- **Do** set display type (Cabinet Grotesk) on money values and headings; body copy stays in General Sans.

### Don't:
- **Don't** reintroduce a colored border-left/right on cards or list items as a status signal — use the badge + tint pattern instead.
- **Don't** use emoji as a stand-in for the icon system on interactive controls (filter chips, action buttons, sort selects). A small number of emoji remain intentionally in the warm, personal gift-note copy (the note card's "💌", the reveal flow) — that is a deliberate exception for a feeling-first moment, not a precedent for functional UI.
- **Don't** fall back to the system font stack as a deliberate choice; Cabinet Grotesk/General Sans are loaded and should always resolve.
- **Don't** add a second accent color or a second decorative surface treatment alongside liquid-glass; the brief is explicit that restraint is the point.
