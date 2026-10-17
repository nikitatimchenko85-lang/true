-- Схема базы для планировщика TRUE. Подразделения, посты и администраторы хранятся в app_settings (JSON)
-- и редактируются в приложении (Настройки). Выполнить один раз: Supabase → SQL Editor → New query → вставить → Run.

create extension if not exists btree_gist;

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  service_id text not null,           -- подразделение: tires, wash, service, detailing...
  post int not null default 1,         -- номер поста внутри подразделения (1, 2, ...)
  starts_at timestamp not null,
  ends_at timestamp not null,
  car text not null,                   -- машина и госномер
  client_name text,
  phone text,
  phone_digits text generated always as (regexp_replace(coalesce(phone, ''), '\D', '', 'g')) stored, -- для поиска
  work text,                           -- вид работы
  tire_class text,
  radius text,
  tags text[] not null default '{}',   -- быстрые пометки: договор, хранение, Run Flat...
  comment text,
  status text not null default 'planned'
    check (status in ('planned', 'no_show', 'cancelled', 'in_progress', 'waiting_parts', 'done')),
  created_by text,
  executor text,                       -- исполнитель (мастер)
  items jsonb not null default '[]',   -- строки расчёта: услуга, количество, цена
  total numeric,                       -- стоимость заявки
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  -- Главное правило: на одном посту подразделения записи не пересекаются.
  -- Срабатывает даже если два сотрудника жмут "Сохранить" одновременно.
  constraint no_double_booking exclude using gist (
    service_id with =,
    post with =,
    tsrange(starts_at, ends_at) with &&
  ) where (status not in ('cancelled', 'no_show'))
);

-- Для баз, созданных до появления стоимости в заявке
alter table public.bookings add column if not exists items jsonb not null default '[]';
alter table public.bookings add column if not exists total numeric;
alter table public.bookings add column if not exists executor text;

create index if not exists bookings_time_idx on public.bookings (starts_at, ends_at);

create table if not exists public.app_settings (
  id int primary key default 1 check (id = 1),
  value jsonb not null default '{}'
);

insert into public.app_settings (id, value) values (1, '{}') on conflict (id) do nothing;

-- Строки не удаляем: неявки и отмены отмечаются статусом (история). Удаление запрещено правилами.

-- Доступ только для вошедших сотрудников (аккаунты создаются в Authentication → Users).
alter table public.bookings enable row level security;
alter table public.app_settings enable row level security;

drop policy if exists "staff all" on public.bookings;
drop policy if exists "staff all" on public.app_settings;
drop policy if exists "staff read" on public.bookings;
drop policy if exists "staff insert" on public.bookings;
drop policy if exists "staff update" on public.bookings;
create policy "staff read" on public.bookings for select to authenticated using (true);
create policy "staff insert" on public.bookings for insert to authenticated with check (true);
create policy "staff update" on public.bookings for update to authenticated using (true) with check (true);
create policy "staff all" on public.app_settings for all to authenticated using (true) with check (true);

-- Мгновенное обновление у всех сотрудников
do $$
begin
  alter publication supabase_realtime add table public.bookings, public.app_settings;
exception when duplicate_object then null;
end $$;
