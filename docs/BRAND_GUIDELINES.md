# Voucher Hub Brand Guidelines

## Brand Positioning

Voucher Hub is the trusted place to manage voucher value.

Most voucher products feel promotional, cluttered, or focused on discounts. Voucher Hub should feel different.

Voucher Hub is a financial utility.

The product helps users:

* Organize vouchers
* Prevent value loss
* Convert unused vouchers into cash
* Discover referral opportunities
* Make smarter spending decisions

The brand should feel closer to a digital wallet or fintech product than a coupon platform.

Comparable products:

* Revolut
* Monzo
* Notion
* TicketSwap
* Linear

Not comparable:

* Groupon
* RetailMeNot
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
* Calm
* Professional

Not:

* Playful
* Loud
* Trendy
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

---

## Calm interfaces

The user should feel in control.

Avoid:

* Excessive animations
* Bright gradients
* Visual noise
* Competing focal points

---

# Color System

## Primary Brand Color

Deep Space Royal

```css
#223382
```

Purpose:

* Navigation
* Primary buttons
* Links
* Active states
* Brand identity

Psychology:

* Trust
* Reliability
* Stability

---

## Secondary Color

Aster Flower Blue

```css
#9BACD8
```

Purpose:

* Secondary buttons
* Selected states
* Background accents
* Supporting UI

Psychology:

* Calm
* Organization
* Clarity

---

## Accent Color

Habanero

```css
#F98513
```

Purpose:

* Discounts
* Marketplace opportunities
* Important actions

Use sparingly.

The accent color should attract attention only when needed.

---

## Background Color

Luster White

```css
#F4F1EC
```

Purpose:

* Application background
* Large content areas

Avoid pure white backgrounds whenever possible.

---

## Dark Color

Deadly Depths

```css
#111144
```

Purpose:

* Headings
* Dark mode
* Premium sections

---

# Semantic Colors

## Success

```css
#16A34A
```

Used for:

* Savings
* Positive balances
* Voucher value
* Successful actions

---

## Warning

```css
#F98513
```

Used for:

* Expiring soon
* Important reminders

---

## Error

```css
#DC2626
```

Used for:

* Validation errors
* Failed actions

---
# Gradient & Lighting System

## Philosophy

Voucher Hub does not use gradients as decoration.

Gradients are used as a lighting system that creates depth, focus, and calmness.

The user should notice the content first and the gradient second.

The effect should feel architectural, premium, and trustworthy rather than creative or artistic.

Comparable implementations:

* Linear
* Stripe
* Monzo
* Notion Calendar
* Modern Apple interfaces

---

## Design Principle

The interface should never feel flat.

However, depth should be achieved through subtle atmospheric lighting rather than heavy shadows or decorative effects.

Gradients exist to:

* Guide attention
* Create visual hierarchy
* Add warmth
* Reduce the harshness of pure white interfaces

---

## Primary Background Gradient

Inspired by the Luster White visual system.

Base colors:

```css
#FFFFFF
#F8F6F3
#F4F1EC
```

Example:

```css
background: linear-gradient(
  180deg,
  #FFFFFF 0%,
  #F8F6F3 50%,
  #F4F1EC 100%
);
```

Purpose:

* Home screen
* Onboarding
* Empty states
* Marketing pages
* Large background areas

Never use this gradient on cards, buttons, or important UI controls.

---

## Ambient Orange Glow

Voucher Hub uses a subtle orange glow derived from Habanero.

The glow represents:

* Value
* Opportunity
* Savings
* Stored purchasing power

Base color:

```css
#F98513
```

Example:

```css
background:
radial-gradient(
  circle at bottom center,
  rgba(249,133,19,0.12) 0%,
  rgba(249,133,19,0) 70%
);
```

Rules:

* Opacity between 5% and 15%
* Large radius
* Extremely soft transitions
* Never visible as a circle
* Never used behind text

The user should feel warmth without consciously noticing orange.

---

## Blue Atmospheric Lighting

For premium sections, onboarding, or dark mode.

Base colors:

```css
#223382
#9BACD8
```

Example:

```css
background:
linear-gradient(
  180deg,
  #223382 0%,
  #2D3E91 40%,
  #9BACD8 100%
);
```

Use sparingly.

Suitable for:

* Hero sections
* Authentication screens
* Premium experiences

Not suitable for:

* Forms
* Dashboard screens
* Data-heavy views

---

## Surface Hierarchy

The interface should follow a layered approach.

### Layer 1: Atmosphere

Background gradients and ambient lighting.

### Layer 2: Content Surface

Cards and containers.

### Layer 3: Information

Voucher data, marketplace listings, referral codes.

### Layer 4: Actions

Buttons, inputs, and navigation.

The atmosphere should never compete with the information layer.

---

## Card Rules

Cards must remain clean and readable.

Cards use:

```css
background: #FFFFFF;
```

Optional:

```css
border: 1px solid rgba(34,51,130,0.06);
```

Avoid:

* Gradient cards
* Colorful cards
* Heavy shadows
* Glassmorphism

Cards contain information.

Backgrounds create atmosphere.

---

## Trust Rule

Blue communicates trust.

White communicates clarity.

Orange communicates opportunity.

The balance should be:

* 80% clarity
* 15% trust
* 5% opportunity

If the orange becomes a dominant visual element, it is being overused.

---

## AI Design Rules

When generating screens:

* Use gradients only in background layers.
* Keep gradients extremely subtle.
* Never use gradients on buttons.
* Never use gradients on typography.
* Never use gradients inside cards.
* Never use gradients to replace hierarchy.
* Prefer spacing and typography over visual effects.

Target feeling:

"Professional financial software with warmth."

Not:

* Crypto app
* Coupon website
* Marketing landing page
* AI-generated startup aesthetic

The design should feel durable, trustworthy, and capable of handling financial value.


# Typography

## Style

Use modern sans-serif typography.

Recommended:

* Inter
* SF Pro
* Geist

---

## Hierarchy

### Heading

Bold

Used for:

* Screen titles
* Important sections

### Body

Regular

Used for:

* Descriptions
* Voucher details

### Labels

Medium

Used for:

* Form fields
* Metadata

---

# UI Components

## Buttons

Primary Button

* Deep Space Royal background
* White text

Secondary Button

* White background
* Deep Space Royal border

Tertiary Button

* Text only

---

## Cards

Cards should be used extensively.

Examples:

* Voucher cards
* Marketplace listings
* Referral codes

Rules:

* White background
* Subtle shadow
* Rounded corners
* Consistent spacing

---

## Navigation

Bottom navigation with:

1. Home
2. My Vouchers
3. Marketplace
4. Referral Codes
5. Profile

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

* Glassmorphism
* Excessive gradients
* Neumorphism
* Heavy shadows
* Overly playful illustrations
* Cryptocurrency-style aesthetics
* Generic AI-generated design trends

The product should feel durable and trustworthy.

---

# Design North Star

Voucher Hub should feel like a trusted financial wallet for voucher value.

Every design decision should reinforce:

* Trust
* Clarity
* Organization
* Simplicity
* Value preservation
