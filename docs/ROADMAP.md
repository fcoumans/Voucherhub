# Roadmap

> **Status: historical.** This was the original phased plan, written when
> the stack was still expected to be React Native/Expo (it ended up as a
> vanilla-JS Vite web app + PWA instead — see `docs/AI_INSTRUCTIONS.md`).
> Phases 1 through 8 below have all shipped in some form, including the
> friend system and friends-only listings called out in Phase 8. Treat
> this as a record of intent, not a live plan — check the code for what
> actually exists.

## Phase 1 - Foundation & Backend

Goal: Create a working application architecture.

### Setup

- React Native project
- Expo configuration
- TypeScript configuration
- Supabase project
- PostgreSQL database
- Authentication setup
- Environment variables
- Navigation structure

### Database

- Users table
- Vouchers table
- Referral Codes table
- Notifications table
- Marketplace Listings table

### Deliverable

User can create an account and log in.

---

## Phase 2 - Voucher Wallet Integration

Goal: Connect the existing UI to real data.

### Voucher Management

- Create voucher
- Edit voucher
- Delete voucher
- View voucher details
- Search vouchers

### Image Storage

- Upload voucher image
- Store images in Supabase Storage
- Display uploaded images

### Deliverable

Users can fully manage vouchers from the app.

---

## Phase 3 - Notifications & Expiry Tracking

Goal: Prevent voucher value from being lost.

### Notifications

- Push notification setup (Expo)
- Reminder scheduling
- Expiry date checks

### Voucher Status Logic

- Active
- Expired
- Used

### Deliverable

Users receive reminders before vouchers expire.

---

## Phase 4 - Referral Hub

Goal: Build the referral code ecosystem.

### Referral Codes

- Create referral code
- Edit referral code
- Delete referral code
- Search referral codes
- Copy referral code

### Categories

- Travel
- Food
- Shopping
- Mobility
- Other

### Deliverable

Users can discover and share referral codes.

---

## Phase 5 - Marketplace MVP

Goal: Validate voucher resale demand.

### Listings

- Create listing
- Browse listings
- Search listings
- Filter by brand
- Filter by category

### Listing Details

- Voucher value
- Asking price
- Discount percentage
- Expiration date

### Deliverable

Users can list vouchers and browse vouchers for sale.

---

## Phase 6 - Marketplace Transactions

Goal: Enable actual voucher trading.

### Features

- Reserve listing
- Contact seller
- Transfer ownership
- Mark listing as sold

### Future

- Stripe integration
- Escrow payments
- Seller ratings

### Deliverable

Users can safely exchange vouchers.

---

## Phase 7 - AI Voucher Scanning

Goal: Reduce manual input.

### OCR

- Scan voucher image
- Extract brand
- Extract voucher code
- Extract expiration date
- Extract amount

### AI Validation

- Detect missing fields
- Detect possible errors

### Deliverable

Users can add vouchers by taking a photo.

---

## Phase 8 - Social Layer

Goal: Increase retention and network effects.

### Friends

- Add friends
- Friend requests
- Friends-only listings

### Referral Discovery

- Friend referral codes
- Friend voucher listings

### Deliverable

Users can discover value through their network.

---

# Long-Term Vision

Voucher Hub becomes the central platform for:

- Gift cards
- Store credits
- Vouchers
- Referral codes
- Loyalty rewards
- Consumer discounts

Currency conversions