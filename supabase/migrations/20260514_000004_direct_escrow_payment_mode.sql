alter table public.jobs
  drop constraint if exists jobs_payment_mode_check;

alter table public.jobs
  add constraint jobs_payment_mode_check
  check (payment_mode in ('mock', 'x402-escrow', 'direct-escrow'));
