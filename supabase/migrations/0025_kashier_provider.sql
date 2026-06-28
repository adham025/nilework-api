-- 0025_kashier_provider — allow Kashier as a payment provider alongside Paymob
-- (slice #37). Both adapters coexist; the active one is chosen by PAYMENT_PROVIDER.
-- Only the provider CHECK changes; the rest of the payments contract is unchanged.

alter table public.payments drop constraint if exists payments_provider_check;
alter table public.payments
  add constraint payments_provider_check
  check (provider in ('paymob', 'kashier', 'simulated'));
