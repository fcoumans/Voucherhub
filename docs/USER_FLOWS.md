# User Flows

## Purpose

This document describes the main user journeys in Voucher Hub.

The app should be designed around these flows first.

---

# Flow 1: Sign Up

1. User opens the app.
2. User taps “Create account”.
3. User enters email, name, and password.
4. User confirms account.
5. User lands on the Home screen.

---

# Flow 2: Add Voucher Manually

1. User opens “My Vouchers”.
2. User taps “Add Voucher”.
3. User enters:
   - Brand
   - Amount
   - Currency
   - Expiration date
   - Voucher code
   - PIN if needed
   - Notes
4. User optionally uploads a photo or screenshot.
5. User taps “Save”.
6. Voucher appears in the user’s wallet.

---

# Flow 3: Use Voucher

1. User opens “My Vouchers”.
2. User searches for a brand.
3. User opens the voucher detail page.
4. User shows the voucher code, barcode, QR code, or image at the store.
5. User taps “Mark as used”.
6. Voucher status changes to `used`.

---

# Flow 4: Expiry Reminder

1. User adds voucher with expiration date.
2. App creates reminder dates.
3. System checks upcoming expirations.
4. User receives notification:
   “Your €50 Zara voucher expires in 7 days.”
5. User opens the voucher from the notification.

---

# Flow 5: List Voucher for Sale

1. User opens a voucher.
2. User taps “Sell Voucher”.
3. User enters:
   - Selling price
   - Discount percentage
   - Visibility: public or friends only
4. User confirms the voucher is valid and unused.
5. Listing is created.
6. Voucher status changes to `listed`.

---

# Flow 6: Browse Marketplace

1. User opens “Marketplace”.
2. User searches by brand or category.
3. User sees available vouchers.
4. User opens a listing.
5. User sees:
   - Brand
   - Original value
   - Selling price
   - Discount
   - Expiration date
6. User can choose to buy or save the listing.

---

# Flow 7: Buy Voucher

MVP version without payments:

1. User opens marketplace listing.
2. User taps “Contact seller” or “Reserve”.
3. Seller receives notification.
4. Buyer and seller arrange payment outside the app.
5. Seller marks voucher as sold.

Future version:

1. User taps “Buy”.
2. Payment is held in escrow.
3. Voucher is transferred.
4. Buyer confirms voucher works.
5. Seller receives payment.

---

# Flow 8: Add Referral Code

1. User opens “Referral Codes”.
2. User taps “Add Code”.
3. User enters:
   - Brand
   - Referral code
   - Referral link
   - Benefit for new user
   - Benefit for referrer
4. User chooses visibility:
   - Public
   - Friends only
   - Private
5. User taps “Save”.

---

# Flow 9: Search Referral Code

1. User opens “Referral Codes”.
2. User searches a brand.
3. App shows:
   - Platform referral codes
   - Friends’ referral codes
   - Public user referral codes
4. User copies the code or opens the referral link.

---

# Flow 10: Add Friend

1. User opens “Friends”.
2. User searches for a person.
3. User sends friend request.
4. Other user accepts.
5. Both users can see friends-only vouchers and referral codes.

---

# Flow 11: Mark Voucher as Expired

1. System checks voucher expiration dates.
2. If expiration date is in the past, voucher status changes to `expired`.
3. Expired voucher is hidden from active wallet.
4. User can still see it in history.

---

# Flow 12: Delete Voucher

1. User opens voucher detail page.
2. User taps “Delete”.
3. App asks for confirmation.
4. User confirms.
5. Voucher is removed from wallet.

---

# Main Navigation

The app should have five main tabs:

1. Home
2. My Vouchers
3. Marketplace
4. Referral Codes
5. Profile

---

# MVP Priority Flows

Build these first:

1. Sign Up
2. Add Voucher Manually
3. Search Voucher
4. Use Voucher
5. Expiry Reminder
6. Add Referral Code
7. Search Referral Code

Do not build advanced marketplace payments in the MVP.