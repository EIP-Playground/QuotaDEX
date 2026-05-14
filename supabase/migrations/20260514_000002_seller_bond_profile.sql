alter table public.sellers
  add column if not exists bond_status text not null default 'unverified',
  add column if not exists bond_tx_hash text,
  add column if not exists bond_verified_at timestamptz,
  add column if not exists bond_challenge_id uuid,
  add column if not exists bond_receiver_address text,
  add column if not exists bond_token_address text,
  add column if not exists bond_token_symbol text,
  add column if not exists bond_amount_atomic text,
  add column if not exists bond_amount_display text;

do $$
begin
  alter table public.sellers
    add constraint sellers_bond_status_check
    check (bond_status in ('unverified', 'verified', 'revoked'));
exception
  when duplicate_object then null;
end $$;

with latest_verified_challenge as (
  select distinct on (seller_id, network_profile)
    id,
    seller_id,
    network_profile,
    proof_receiver_address,
    proof_token_address,
    proof_token_symbol,
    amount_atomic,
    amount_display,
    tx_hash,
    verified_at
  from public.seller_auth_challenges
  where status = 'verified'
    and tx_hash is not null
  order by
    seller_id,
    network_profile,
    verified_at desc nulls last,
    updated_at desc
)
update public.sellers as seller
set
  bond_status = 'verified',
  bond_tx_hash = challenge.tx_hash,
  bond_verified_at = challenge.verified_at,
  bond_challenge_id = challenge.id,
  bond_receiver_address = challenge.proof_receiver_address,
  bond_token_address = challenge.proof_token_address,
  bond_token_symbol = challenge.proof_token_symbol,
  bond_amount_atomic = challenge.amount_atomic,
  bond_amount_display = challenge.amount_display
from latest_verified_challenge as challenge
where seller.id = challenge.seller_id
  and seller.network_profile = challenge.network_profile
  and seller.bond_status <> 'verified';

create unique index if not exists idx_sellers_bond_tx_hash
  on public.sellers(network_profile, bond_tx_hash)
  where bond_tx_hash is not null;

create index if not exists idx_sellers_bond_status
  on public.sellers(network_profile, bond_status);
