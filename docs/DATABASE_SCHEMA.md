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
| first_name | String | Optional, title-cased (initcap) |
| last_name | String | Optional, title-cased (initcap) |
| avatar_url | String | Optional |
| last_active_at | Timestamp | Stamped on login/session-resume |
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
| visibility | Enum | public, friends_only — `friends_only` is the Trusted Community tier: visible only within the seller's network (direct friends + friends of friends, see `trusted_network_ids()`), never in public Browse |
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
| used_count | Integer | Denormalized count, kept in sync from referral_code_uses |
| created_at | Timestamp | Auto-generated |

---

## referral_code_uses

One row per (referral code, user) mark of "I used this" — never the code's own owner (enforced by RLS). Drives referral_codes.used_count via a trigger.

| Field | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| referral_id | UUID | Links to referral_codes.id |
| user_id | UUID | The user who marked it used |
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
- The seller chooses marketplace_listings.visibility: `public` (Browse tab, open to everyone) or `friends_only` (Trusted Community tab only — friends and friends of friends)

When sold:

- voucher.status becomes `sold`
- marketplace_listings.status becomes `sold`

---

## Trusted Community

The marketplace has three tabs: Browse (public listings, open to everyone), Trusted Community (listings from the current user's network — direct friends and friends of friends — regardless of visibility), and My Listings.

- `public.trusted_network_ids(p_user)` is a `SECURITY DEFINER` SQL function that returns a user's 1st- and 2nd-degree friend network. It bypasses `friendships` RLS internally (which otherwise only lets a user read friendship rows they're a party to, blocking a 2-hop lookup) and is guarded so it only ever computes the caller's own network (`p_user = auth.uid()`).
- `marketplace_listings`' select RLS policy uses this function to enforce that `visibility = 'friends_only'` rows are only readable by sellers, and by users in the seller's trusted network — this is a real access control, not just client-side tab filtering.
- A `public` listing from someone in your network still appears in Trusted Community (in addition to Browse) — visibility there is a superset, not a separate pool.

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