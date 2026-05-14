alter table public.sellers
  add column if not exists bond_renewal_token_hash text,
  add column if not exists bond_renewal_token_issued_at timestamptz;

create index if not exists idx_sellers_bond_renewal_token
  on public.sellers(network_profile, bond_renewal_token_hash)
  where bond_renewal_token_hash is not null;
