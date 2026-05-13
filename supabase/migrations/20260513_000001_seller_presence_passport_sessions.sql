alter table public.sellers
  add column if not exists passport_subject text,
  add column if not exists passport_email text;

create index if not exists idx_sellers_last_heartbeat_at
  on public.sellers(last_heartbeat_at);

create index if not exists idx_sellers_passport_subject
  on public.sellers(passport_subject);
