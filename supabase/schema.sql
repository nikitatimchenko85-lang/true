-- Схема базы для приложения записи. Выполнить один раз: Supabase → SQL Editor → New query → вставить → Run.

create extension if not exists btree_gist;

create table if not exists public.services (
  id text primary key,
  name text not null,
  color text not null default '#2563eb',
  duration int not null default 60,       -- длительность по умолчанию, минут
  posts int not null default 1 check (posts between 1 and 20), -- сколько машин одновременно (боксы/подъёмники)
  sort int not null default 0,
  active boolean not null default true
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  service_id text not null references public.services(id),
  post int not null default 1,
  starts_at timestamp not null,
  ends_at timestamp not null,
  client_name text not null,
  phone text,
  phone_digits text generated always as (regexp_replace(coalesce(phone, ''), '\D', '', 'g')) stored, -- для поиска
  car text,
  plate text,
  price numeric,
  comment text,
  status text not null default 'planned'
    check (status in ('planned', 'arrived', 'in_progress', 'done', 'cancelled', 'no_show')),
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  -- Главное правило: на одном посту одной услуги записи не пересекаются.
  -- Срабатывает даже если два сотрудника жмут "Сохранить" одновременно.
  constraint no_double_booking exclude using gist (
    service_id with =,
    post with =,
    tsrange(starts_at, ends_at) with &&
  ) where (status not in ('cancelled', 'no_show'))
);

create index if not exists bookings_time_idx on public.bookings (starts_at, ends_at);

create table if not exists public.app_settings (
  id int primary key default 1 check (id = 1),
  value jsonb not null default '{}'
);

insert into public.services (id, name, color, duration, posts, sort) values
  ('wrap', 'Оклейка плёнкой', '#2563eb', 480, 2, 1),
  ('tires', 'Шиномонтаж', '#16a34a', 60, 2, 2),
  ('service', 'СТО', '#d97706', 120, 2, 3),
  ('polish', 'Полировка / керамика', '#7c3aed', 240, 1, 4),
  ('wash', 'Мойка / химчистка', '#0891b2', 90, 1, 5)
on conflict (id) do nothing;

insert into public.app_settings (id, value) values (1, '{}') on conflict (id) do nothing;

-- Доступ только для вошедших сотрудников (аккаунты создаются в Authentication → Users).
alter table public.services enable row level security;
alter table public.bookings enable row level security;
alter table public.app_settings enable row level security;

drop policy if exists "staff all" on public.services;
drop policy if exists "staff all" on public.bookings;
drop policy if exists "staff all" on public.app_settings;
create policy "staff all" on public.services for all to authenticated using (true) with check (true);
create policy "staff all" on public.bookings for all to authenticated using (true) with check (true);
create policy "staff all" on public.app_settings for all to authenticated using (true) with check (true);

-- Мгновенное обновление у всех сотрудников
do $$
begin
  alter publication supabase_realtime add table public.bookings, public.services, public.app_settings;
exception when duplicate_object then null;
end $$;
