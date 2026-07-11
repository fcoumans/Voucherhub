# Database Schema

## Purpose

This document defines the core database structure for Voucher Hub.

The database should support:

- User accounts
- Personal voucher storage
- Voucher expiry tracking
- Voucher marketplace listings
- Referral codes
- Notifications

---

# Tables

## users

Stores basic user profile information.

| Field | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| email | String | Unique |
| name | String | Optional |
| avatar_url | String | Optional |
| created_at | Timestamp | Auto-generated |

---

## vouchers

Stores vouchers owned by users.

| Field | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| user_id | UUID | Links to users.id |
| brand | String | Store or company name |
| category | String | Example: restaurant, fashion, travel |
| amount | Decimal | Original voucher value |
| remaining_amount | Decimal | Current remaining value |
| currency | String | EUR, USD, GBP |
| voucher_code | String | Voucher code |
| pin | String | Optional PIN |
| expiration_date | Date | Expiry date |
| image_url | String | Uploaded photo/screenshot |
| notes | Text | Terms, restrictions, extra info |
| status | Enum | active, used, expired, listed, sold |
| created_at | Timestamp | Auto-generated |
| updated_at | Timestamp | Auto-generated |

---

## marketplace_listings

Stores vouchers listed for sale.

| Field | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| voucher_id | UUID | Links to vouchers.id |
| seller_id | UUID | Links to users.id |
| original_value | Decimal | Voucher value |
| selling_price | Decimal | Price seller wants |
| discount_percentage | Decimal | Calculated field |
| currency | String | EUR, USD, GBP |
| status | Enum | available, reserved, sold, cancelled |
| visibility | Enum | public, friends_only |
| created_at | Timestamp | Auto-generated |
| updated_at | Timestamp | Auto-generated |

---

## referral_codes

Stores referral codes added by users or the platform.

| Field | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| user_id | UUID | Owner of the code, nullable for platform-owned codes |
| brand | String | Brand or app name |
| code | String | Referral code |
| referral_link | String | Optional link |
| benefit_for_new_user | Text | Example: €10 discount |
| benefit_for_referrer | Text | Example: €10 credit |
| visibility | Enum | public, friends_only, private |
| expiration_date | Date | Optional |
| created_at | Timestamp | Auto-generated |

---

## notifications

Stores reminder notifications for voucher expiry.

| Field | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| user_id | UUID | Links to users.id |
| voucher_id | UUID | Links to vouchers.id |
| notification_type | Enum | expiry_reminder |
| reminder_date | Date | When reminder should be sent |
| sent | Boolean | Default false |
| sent_at | Timestamp | Optional |
| created_at | Timestamp | Auto-generated |

---

## friendships

Stores friend relationships between users.

| Field | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| requester_id | UUID | User who sends request |
| receiver_id | UUID | User who receives request |
| status | Enum | pending, accepted, declined, blocked |
| created_at | Timestamp | Auto-generated |
| updated_at | Timestamp | Auto-generated |

---

# Important Rules

## Voucher Ownership

Every voucher belongs to one user.

A voucher can only be listed for sale by its owner.

---

## Marketplace Logic

When a voucher is listed for sale:

- voucher.status becomes `listed`
- marketplace_listings.status becomes `available`

When sold:

- voucher.status becomes `sold`
- marketplace_listings.status becomes `sold`

---

## Expiry Logic

If expiration_date is in the past:

- voucher.status should become `expired`

The app should not allow expired vouchers to be listed for sale.

---

## Referral Code Logic

Referral codes can be:

- Platform-owned
- User-owned
- Public
- Friends only
- Private

---

# Future Tables

These are not required for the MVP.

## transactions

For marketplace payments.

## reviews

For buyer and seller ratings.

## voucher_scans

For AI/OCR extraction history.

## disputes

For marketplace fraud or refund cases.