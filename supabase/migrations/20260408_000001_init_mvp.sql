create extension if not exists pgcrypto;

create table if not exists public.sellers (
  id text primary key,
  capability text not null,
  price_per_task numeric(18, 8) not null check (price_per_task >= 0),
  status text not null default 'offline'
    check (status in ('offline', 'idle', 'reserved', 'busy')),
  updated_at timestamptz not null default now()
);

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  payment_id text not null unique,
  buyer_id text not null,
  seller_id text not null references public.sellers(id),
  tx_hash text unique,
  payload jsonb not null,
  status text not null default 'paid'
    check (status in ('paid', 'running', 'done', 'failed')),
  result jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.jobs(id) on delete cascade,
  type text not null,
  message text not null,
  timestamp timestamptz not null default now()
);

create index if not exists idx_sellers_capability_status
  on public.sellers(capability, status);

create index if not exists idx_sellers_updated_at
  on public.sellers(updated_at desc);

create index if not exists idx_jobs_seller_id
  on public.jobs(seller_id);

create index if not exists idx_jobs_status
  on public.jobs(status);

create index if not exists idx_events_job_id
  on public.events(job_id);

create index if not exists idx_events_timestamp
  on public.events(timestamp desc);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.sellers;
    exception
      when duplicate_object then null;
    end;

    begin
      alter publication supabase_realtime add table public.jobs;
    exception
      when duplicate_object then null;
    end;

    begin
      alter publication supabase_realtime add table public.events;
    exception
      when duplicate_object then null;
    end;
  end if;
end $$;
