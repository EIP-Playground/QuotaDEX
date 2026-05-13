alter table public.jobs
  add column if not exists escrow_contract_address text;

do $$
begin
  alter table public.jobs
    drop constraint if exists jobs_status_check;

  alter table public.jobs
    add constraint jobs_status_check
    check (status in ('settling', 'paid', 'running', 'done', 'failed'));
end $$;

do $$
begin
  alter table public.jobs
    drop constraint if exists jobs_payment_status_check;

  alter table public.jobs
    add constraint jobs_payment_status_check
    check (
      payment_status in (
        'created',
        'settling',
        'mock_verified',
        'escrow_deposited',
        'escrow_registered',
        'released',
        'refunded'
      )
    );
end $$;

do $$
begin
  alter table public.sellers
    add constraint sellers_price_per_task_positive_check
    check (price_per_task > 0) not valid;
exception
  when duplicate_object then null;
end $$;

create index if not exists idx_jobs_escrow_contract_address
  on public.jobs(escrow_contract_address);
