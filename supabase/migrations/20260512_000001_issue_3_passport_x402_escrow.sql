alter table public.sellers
  add column if not exists wallet_address text,
  add column if not exists passport_agent_id text,
  add column if not exists passport_payer_addr text,
  add column if not exists approval_status text not null default 'approved',
  add column if not exists last_heartbeat_at timestamptz;

update public.sellers
set
  wallet_address = coalesce(wallet_address, id),
  passport_payer_addr = coalesce(passport_payer_addr, id),
  last_heartbeat_at = coalesce(last_heartbeat_at, updated_at)
where wallet_address is null
   or passport_payer_addr is null
   or last_heartbeat_at is null;

do $$
begin
  alter table public.sellers
    add constraint sellers_approval_status_check
    check (approval_status in ('approved', 'pending', 'disabled'));
exception
  when duplicate_object then null;
end $$;

alter table public.jobs
  add column if not exists payment_mode text not null default 'mock',
  add column if not exists payment_status text not null default 'created',
  add column if not exists amount numeric(18, 8),
  add column if not exists amount_atomic text,
  add column if not exists currency text not null default 'USDT',
  add column if not exists payment_asset text,
  add column if not exists buyer_wallet_address text,
  add column if not exists seller_wallet_address text,
  add column if not exists settlement_tx_hash text,
  add column if not exists escrow_registration_tx_hash text,
  add column if not exists release_tx_hash text,
  add column if not exists refund_tx_hash text,
  add column if not exists expires_at timestamptz;

update public.jobs
set
  payment_mode = coalesce(payment_mode, 'mock'),
  payment_status = coalesce(payment_status, 'created'),
  buyer_wallet_address = coalesce(buyer_wallet_address, buyer_id),
  seller_wallet_address = coalesce(seller_wallet_address, seller_id)
where buyer_wallet_address is null
   or seller_wallet_address is null;

do $$
begin
  alter table public.jobs
    add constraint jobs_payment_mode_check
    check (payment_mode in ('mock', 'escrow-chain', 'x402-escrow'));
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.jobs
    add constraint jobs_payment_status_check
    check (
      payment_status in (
        'created',
        'mock_verified',
        'escrow_deposited',
        'escrow_registered',
        'released',
        'refunded'
      )
    );
exception
  when duplicate_object then null;
end $$;

alter table public.events
  add column if not exists payload jsonb;

create unique index if not exists idx_jobs_settlement_tx_hash
  on public.jobs(settlement_tx_hash)
  where settlement_tx_hash is not null;

create unique index if not exists idx_jobs_escrow_registration_tx_hash
  on public.jobs(escrow_registration_tx_hash)
  where escrow_registration_tx_hash is not null;

create unique index if not exists idx_jobs_release_tx_hash
  on public.jobs(release_tx_hash)
  where release_tx_hash is not null;

create unique index if not exists idx_jobs_refund_tx_hash
  on public.jobs(refund_tx_hash)
  where refund_tx_hash is not null;

create index if not exists idx_sellers_passport_payer_addr
  on public.sellers(passport_payer_addr);

create index if not exists idx_jobs_payment_mode_status
  on public.jobs(payment_mode, payment_status);
