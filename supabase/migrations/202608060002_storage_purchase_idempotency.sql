-- Prevent duplicate storage allocation if the same verified payment reference is processed twice.

create unique index if not exists uq_vendor_storage_purchases_payment_reference
  on public.vendor_storage_purchases(vendor_id, payment_reference)
  where payment_reference is not null;
