create table if not exists public.seller_auth_challenges (
  id uuid primary key default gen_random_uuid(),
  seller_id text not null references public.sellers(id) on delete cascade,
  passport_agent_id text not null,
  proof_receiver_address text not null,
  proof_token_address text not null,
  proof_token_symbol text not null,
  amount_atomic text not null,
  amount_display text not null,
  status text not null default 'pending'
    check (status in ('pending', 'verified', 'expired')),
  tx_hash text unique,
  expires_at timestamptz not null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_seller_auth_challenges_seller_status
  on public.seller_auth_challenges (seller_id, status, expires_at desc);

create index if not exists idx_seller_auth_challenges_pending_expiry
  on public.seller_auth_challenges (expires_at)
  where status = 'pending';
