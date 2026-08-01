# Voucher Hub Brand Guidelines

## Brand Positioning

Voucher Hub is the trusted place to manage voucher value.

Most voucher products feel promotional, cluttered, or focused on discounts. Voucher Hub should feel different.

Voucher Hub is a financial utility with warmth.

The product helps users:

* Organize vouchers
* Prevent value loss
* Convert unused vouchers into cash
* Discover referral opportunities
* Make smarter spending decisions

The brand should feel like a premium consumer wallet — trustworthy like a fintech product, but warmer and friendlier than one.

Comparable products:

* Revolut
* Monzo
* Notion
* TicketSwap
* Cleo / Copilot Money (for the warmth + polish, not the blue austerity)

Not comparable:

* Groupon
* RetailMeRot
* CouponBirds
* Generic discount websites

---

# Brand Attributes

## Trustworthy

Users store valuable codes and credits inside the platform.

The interface must inspire confidence.

## Organized

The platform should feel structured and predictable.

Users should never wonder where information is located.

## Professional

Avoid gimmicks and trend-driven design.

The product should remain credible over time.

## Efficient

Users should accomplish tasks quickly.

Every screen should have a clear purpose.

## Transparent

Users should always understand:

* Voucher value
* Remaining balance
* Expiration date
* Marketplace pricing

---

# Brand Personality

If Voucher Hub were a person:

* Reliable
* Financially responsible
* Organized
* Helpful
* Calm, with warmth
* Professional

Not:

* Loud
* Trendy for trend's sake
* Gamified
* Sales-driven

---

# Design Philosophy

## Simple beats clever

Users should understand every screen immediately.

Avoid unnecessary visual effects.

Avoid creative navigation patterns.

Use established mobile UX conventions.

---

## Content first

Voucher information is the most important element.

The design should support the information rather than compete with it.

Prioritize:

1. Brand
2. Voucher value
3. Expiration date
4. Voucher status

---

## Functional over decorative

Every component should have a purpose.

Remove elements that do not improve usability.

The one exception is the liquid-glass surface treatment (see Surface System below) — it's decorative, but it's a single, consistently-applied material choice, not one-off flourishes.

---

## Calm interfaces, applied with warmth

The user should feel in control.

Avoid:

* Visual noise
* Competing focal points
* Motion without a purpose (see [[emil-design-eng]] / the animation audit for the house motion rules — every animation on screen should answer "why does this animate?")

Allowed, used deliberately and sparingly:

* The liquid-glass sheen on cards (one consistent treatment, not novelty)
* Subtle celebratory moments (e.g. the gift-reveal confetti) — rare, first-time/occasional occurrences only, never on frequently-seen UI

---

# Color System

## Primary Brand Color

Emerald Sea

```css
#13B5A2
```

Purpose:

* Navigation (active state)
* Primary buttons
* Links
* Active states
* Brand identity

Variants:

```css
--primary-light: #CFF1E8;  /* chip/badge backgrounds, tinted surfaces */
--primary-dark:  #0E9488;  /* hover states, emphasized primary text */
```

Psychology:

* Freshness
* Value
* Growth

---

## Secondary Color

Slate Mist

```css
#9AA6B2
```

Purpose:

* Muted icons and supporting UI
* Neutral emphasis where full brand color would be too strong

---

## Accent Color

Coral

```css
#FF7A59
```

Purpose:

* The one field that's about a feeling, not data entry (e.g. the gift note)
* Highlights, hints
* Warm emphasis

Use sparingly. The accent should attract attention only when needed.

---

## Background Color

Luster White

```css
#F4F1E8
```

Purpose:

* Application background
* Large content areas

Avoid pure white backgrounds whenever possible — the warm off-white keeps the interface from feeling clinical.

---

## Dark Color

Deep Navy

```css
#11233F
```

Purpose:

* Headings
* Primary text
* Premium/dark sections (e.g. the home screen stats card)

---

# Semantic Colors

## Success

```css
#16A06B
```

Light tint: `#D1FAF0`

Used for:

* Savings
* Positive balances
* Voucher value
* Successful actions

---

## Warning

```css
#E5562F
```

Light tint: `#FFE7DF`

Used for:

* Expiring soon
* Important reminders

Distinct from the Coral accent — Warning is a more saturated red-orange, reserved for things that need attention, while Coral is the softer "warmth" color used for feeling-driven moments.

---

## Error

```css
#DC2626
```

Light tint: `#FEE2E2`

Used for:

* Validation errors
* Failed actions

---

# Surface System (Liquid Glass)

## Philosophy

Voucher Hub's cards use a "liquid glass" treatment: a translucent, blurred surface with a diagonal white-to-cream sheen. This is what makes the interface feel premium and tactile rather than flat.

The glass effect is deliberate and consistent — every content card (voucher cards, listing cards, quick actions, KPI cards, the settings list) uses the same recipe, so it reads as one material system, not a decorative accident.

```css
background: linear-gradient(135deg, rgba(255, 255, 255, 0.8) 0%, rgba(244, 241, 232, 0.35) 100%);
backdrop-filter: blur(20px) saturate(180%);
border: 1px solid rgba(255, 255, 255, 0.4);
box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7), 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1);
```

The `saturate(180%)` is what reads as "glass" instead of "milky" — don't drop it when reusing the recipe.

The home screen's stats card is the one dark exception: a high-opacity navy-dominant glass (`rgba(15, 31, 58, 0.98)` → `rgba(28, 51, 84, 0.92)`), so the page background can't wash out the blue while still keeping the same blur/saturate richness.

---

## Design Principle

The interface should never feel flat.

Depth comes from the glass surfaces themselves plus soft, warm-tinted shadows — not from harsh drop shadows or heavy borders.

---

## Card Rules

Cards must remain clean and readable despite the glass treatment — content legibility always wins over the effect.

Cards use the liquid-glass recipe above. Status is communicated with a colored left border (`border-left`), not by changing the card's own fill color, so the glass stays consistent across every state.

Avoid:

* Heavy, un-tinted black shadows
* Breaking the glass recipe per-component (always reuse the shared classes/tokens)
* Applying glass to functional controls where it would hurt legibility (inputs, form fields — those stay flat `--surface` white)

Cards contain information. The glass surface creates atmosphere around it.

---

## Trust Rule

Teal communicates freshness and value.

White/cream communicates clarity and calm.

Coral communicates warmth and feeling.

The balance should be:

* 75% clarity (white/cream + glass)
* 20% teal (trust, brand, navigation)
* 5% coral (warmth, used sparingly)

If coral becomes a dominant visual element, it is being overused.

---

## AI Design Rules

When generating screens:

* Reuse the shared liquid-glass card recipe — don't invent a new glass formula per component.
* Keep the diagonal sheen direction (135deg) consistent everywhere it's used.
* Status/emphasis lives in the left border accent, not in swapping the glass tint.
* Prefer the existing motion tokens (`--ease-out`, `--ease-in-out`, `--ease-drawer`) and the animation rules in [[emil-design-eng]] over inventing new easing/durations.
* Prefer spacing and typography over adding new visual effects — the glass system is the one "effect" this product allows; don't stack more on top of it.

Target feeling:

"A premium, warm financial wallet — polished like a fintech app, but approachable."

Not:

* Crypto app
* Coupon website
* Marketing landing page
* Cold, clinical enterprise dashboard

---

# Typography

## Style

System-native sans-serif stack — no webfont loading cost, renders instantly, and reads as clean on every platform:

```css
font-family: Arial, 'Helvetica Neue', 'Segoe UI', sans-serif;
```

---

## Hierarchy

### Heading

Bold (700–800), tight letter-spacing (`-0.01em` to `-0.02em`)

Used for:

* Screen titles
* Important sections

### Body

Regular

Used for:

* Descriptions
* Voucher details

### Labels

Medium (600–700)

Used for:

* Form fields
* Metadata

---

# UI Components

## Buttons

Primary Button

* Emerald Sea (`--primary`) background
* White text
* `--primary-dark` on hover

Secondary Button

* White background
* Emerald Sea border and text

Ghost Button

* `--gray-light` background, no border

Tertiary / Link Button

* Text only

---

## Cards

Cards should be used extensively, always via the shared liquid-glass recipe (see Surface System above).

Examples:

* Voucher cards
* Marketplace listings
* Quick actions / KPI cards
* Settings list

Rules:

* Liquid-glass background (never flat white for content cards)
* Rounded corners
* Consistent spacing
* Status communicated via colored left border, not fill color

---

## Navigation

Bottom navigation with:

1. Home
2. Discover
3. Wallet (centered)
4. Marketplace
5. Referrals

Profile is reached via the Home screen avatar, not the bottom nav.

Navigation should always remain predictable.

---

# UX Principles

## Show value immediately

Users should immediately see:

* Voucher amount
* Remaining balance
* Expiration date

---

## Reduce cognitive load

Do not overload screens.

Prefer:

* One primary action
* Clear hierarchy
* Short forms

---

## Build confidence

Always communicate:

* Voucher status
* Marketplace status
* Transaction progress

Users should never feel uncertain.

---

## Prevent mistakes

Warn users before:

* Deleting vouchers
* Marking vouchers as used
* Removing referral codes

Use the shared bottom-sheet confirm dialog (`showConfirm()`), not `window.confirm()` or a silent action.

---

# Mobile Design Rules

## Preferred spacing

8-point grid system.

Common values:

* 8
* 16
* 24
* 32

---

## Touch targets

Minimum:

44x44 pixels

---

## Forms

Keep forms short.

Use:

* Date picker
* Currency selector
* Brand autocomplete

whenever possible.

---

# Things To Avoid

Do not use:

* Neumorphism
* Overly playful illustrations
* Cryptocurrency-style aesthetics
* Generic AI-generated design trends
* More than one accent color competing for attention
* Glass effects on functional form controls (inputs stay flat)

The product should feel durable and trustworthy, with just enough warmth to not feel like a bank.

---

# Design North Star

Voucher Hub should feel like a trusted, premium wallet for voucher value — polished enough to trust with something valuable, warm enough to actually enjoy using.

Every design decision should reinforce:

* Trust
* Clarity
* Organization
* Warmth
* Value preservation
