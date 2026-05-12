-- Issue #3 follow-up: production payments are x402-only.
-- Legacy direct escrow-chain rows were local/demo fallback rows and must not trigger
-- release/refund calls against the new escrow contract that no longer exposes deposit().

update public.jobs
set
  payment_mode = 'mock',
  payment_status = case
    when payment_status = 'escrow_deposited' then 'mock_verified'
    else payment_status
  end
where payment_mode = 'escrow-chain';

alter table public.jobs
  drop constraint if exists jobs_payment_mode_check;

alter table public.jobs
  add constraint jobs_payment_mode_check
  check (payment_mode in ('mock', 'x402-escrow'));
