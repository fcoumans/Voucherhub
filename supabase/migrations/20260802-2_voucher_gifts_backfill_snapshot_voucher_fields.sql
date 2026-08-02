-- One-time backfill: voucher_gifts_snapshot_voucher_trigger (added in
-- 20260802_voucher_gifts_snapshot_voucher_fields) only populates
-- voucher_brand/value/currency/value_description on INSERT, so every
-- voucher_gifts row created before that migration still has them NULL.
-- This fills those in from the current vouchers row for that voucher_id.
UPDATE public.voucher_gifts g
SET voucher_brand             = v.brand,
    voucher_value              = v.amount,
    voucher_currency           = v.currency,
    voucher_value_description  = v.value_description
FROM public.vouchers v
WHERE v.id = g.voucher_id
  AND g.voucher_brand IS NULL;
