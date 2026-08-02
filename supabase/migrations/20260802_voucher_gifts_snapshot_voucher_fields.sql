-- Snapshot the gifted voucher's brand/value/currency/value_description onto
-- voucher_gifts at send time, via a BEFORE INSERT trigger. claim_voucher_gift
-- reassigns vouchers.user_id to the recipient on claim, so the sender loses
-- RLS-visible access to the voucher row afterward — this snapshot is what
-- lets the Wallet's "Gifted" tab still show what was sent (brand + value)
-- for gifts a friend has since claimed, without adding any cross-user SELECT
-- policy on public.vouchers.
ALTER TABLE public.voucher_gifts
  ADD COLUMN voucher_brand TEXT,
  ADD COLUMN voucher_value NUMERIC,
  ADD COLUMN voucher_currency TEXT,
  ADD COLUMN voucher_value_description TEXT;

CREATE OR REPLACE FUNCTION public.voucher_gifts_snapshot_voucher()
RETURNS trigger
LANGUAGE plpgsql SET search_path = public
AS $$
BEGIN
  SELECT brand, amount, currency, value_description
    INTO NEW.voucher_brand, NEW.voucher_value, NEW.voucher_currency, NEW.voucher_value_description
  FROM public.vouchers WHERE id = NEW.voucher_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER voucher_gifts_snapshot_voucher_trigger
  BEFORE INSERT ON public.voucher_gifts
  FOR EACH ROW EXECUTE FUNCTION public.voucher_gifts_snapshot_voucher();

COMMENT ON FUNCTION public.voucher_gifts_snapshot_voucher() IS
  'BEFORE INSERT trigger on voucher_gifts. Copies brand/amount/currency/value_description from the referenced voucher into voucher_brand/voucher_value/voucher_currency/voucher_value_description on the new gift row, so the sender can still see what they sent after claim_voucher_gift transfers vouchers.user_id to the recipient.';
