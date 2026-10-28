-- ============ БЭДТРИП — схема Supabase ============
-- Выполнить в Supabase Dashboard → SQL Editor.

create table if not exists public.leaderboard (
  id bigint generated always as identity primary key,
  name text not null check (char_length(name) between 1 and 24),
  score integer not null check (score >= 0),
  created_at timestamptz not null default now()
);

create index if not exists leaderboard_score_idx on public.leaderboard (score desc);

-- Публичное чтение таблицы рекордов
alter table public.leaderboard enable row level security;

create policy "leaderboard readable"
  on public.leaderboard for select
  to anon, authenticated
  using (true);

-- Запись разрешена анонимам (демо-режим). В проде добавь проверку на rate limit / auth.
create policy "leaderboard insertable"
  on public.leaderboard for insert
  to anon, authenticated
  with check (true);
