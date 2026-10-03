-- WatchTower cloud schema for Supabase
create table if not exists public.watchtower_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.watchtower_events (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  provider text,
  title text not null,
  season integer,
  episode integer,
  position_sec numeric,
  duration_sec numeric,
  progress numeric,
  action text,
  occurred_at timestamptz not null default now(),
  primary key (user_id,id)
);

alter table public.watchtower_state enable row level security;
alter table public.watchtower_events enable row level security;

drop policy if exists "watchtower_state_select_own" on public.watchtower_state;
create policy "watchtower_state_select_own" on public.watchtower_state for select using (auth.uid() = user_id);
drop policy if exists "watchtower_state_insert_own" on public.watchtower_state;
create policy "watchtower_state_insert_own" on public.watchtower_state for insert with check (auth.uid() = user_id);
drop policy if exists "watchtower_state_update_own" on public.watchtower_state;
create policy "watchtower_state_update_own" on public.watchtower_state for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "watchtower_state_delete_own" on public.watchtower_state;
create policy "watchtower_state_delete_own" on public.watchtower_state for delete using (auth.uid() = user_id);

drop policy if exists "watchtower_events_select_own" on public.watchtower_events;
create policy "watchtower_events_select_own" on public.watchtower_events for select using (auth.uid() = user_id);
drop policy if exists "watchtower_events_insert_own" on public.watchtower_events;
create policy "watchtower_events_insert_own" on public.watchtower_events for insert with check (auth.uid() = user_id);
drop policy if exists "watchtower_events_delete_own" on public.watchtower_events;
create policy "watchtower_events_delete_own" on public.watchtower_events for delete using (auth.uid() = user_id);

create index if not exists watchtower_events_user_time on public.watchtower_events(user_id, occurred_at desc);
