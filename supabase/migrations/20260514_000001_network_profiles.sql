alter table public.sellers
  add column if not exists network_profile text not null default 'demo-testnet'
    check (network_profile in ('demo-testnet', 'live-testnet', 'live-mainnet'));

alter table public.jobs
  add column if not exists network_profile text not null default 'demo-testnet'
    check (network_profile in ('demo-testnet', 'live-testnet', 'live-mainnet'));

alter table public.events
  add column if not exists network_profile text not null default 'demo-testnet'
    check (network_profile in ('demo-testnet', 'live-testnet', 'live-mainnet'));

alter table public.seller_auth_challenges
  add column if not exists network_profile text not null default 'live-mainnet'
    check (network_profile in ('demo-testnet', 'live-testnet', 'live-mainnet'));

create index if not exists idx_sellers_network_capability_status
  on public.sellers(network_profile, capability, status);

create index if not exists idx_jobs_network_status_created_at
  on public.jobs(network_profile, status, created_at desc);

create index if not exists idx_events_network_timestamp
  on public.events(network_profile, timestamp desc);

create index if not exists idx_seller_auth_challenges_network_seller_status
  on public.seller_auth_challenges(network_profile, seller_id, status, expires_at desc);

do $$
begin
  alter table public.jobs drop constraint if exists jobs_seller_id_fkey;
  alter table public.seller_auth_challenges drop constraint if exists seller_auth_challenges_seller_id_fkey;
  alter table public.sellers drop constraint if exists sellers_pkey;
end $$;

alter table public.sellers
  add constraint sellers_pkey primary key (id, network_profile);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'jobs_seller_network_profile_fkey'
      and conrelid = 'public.jobs'::regclass
  ) then
    alter table public.jobs
      add constraint jobs_seller_network_profile_fkey
      foreign key (seller_id, network_profile)
      references public.sellers(id, network_profile);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'seller_auth_challenges_seller_network_profile_fkey'
      and conrelid = 'public.seller_auth_challenges'::regclass
  ) then
    alter table public.seller_auth_challenges
      add constraint seller_auth_challenges_seller_network_profile_fkey
      foreign key (seller_id, network_profile)
      references public.sellers(id, network_profile)
      on delete cascade;
  end if;
end $$;
