-- Campus Event Hub schema for Supabase PostgreSQL
-- Run the entire file in Supabase Dashboard > SQL Editor > New query.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  full_name text not null default 'Campus member' check (char_length(full_name) between 1 and 100),
  role text not null default 'student' check (role in ('student', 'organizer')),
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), 'Campus member'),
    'student'
  )
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 120),
  description text not null check (char_length(trim(description)) between 1 and 3000),
  category text not null check (category in ('Workshop', 'Technical', 'Cultural', 'Sports', 'Talk', 'Other')),
  venue text not null check (char_length(trim(venue)) between 1 and 160),
  starts_at timestamptz not null,
  capacity integer not null check (capacity between 1 and 10000),
  status text not null default 'published' check (status in ('published', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists events_status_starts_at_idx on public.events(status, starts_at);
create index if not exists events_organizer_id_idx on public.events(organizer_id);

create table if not exists public.registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'registered' check (status in ('registered', 'cancelled')),
  created_at timestamptz not null default now(),
  unique (event_id, user_id)
);
create index if not exists registrations_user_id_idx on public.registrations(user_id);
create index if not exists registrations_event_id_idx on public.registrations(event_id);

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists events_set_updated_at on public.events;
create trigger events_set_updated_at before update on public.events
for each row execute function public.set_updated_at();

-- A row lock prevents two concurrent registrations from exceeding event capacity.
create or replace function public.register_for_event(p_event_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events%rowtype;
  v_count integer;
  v_registration public.registrations%rowtype;
begin
  select * into v_event from public.events where id = p_event_id and status = 'published' for update;
  if not found or v_event.starts_at <= now() then
    raise exception 'EVENT_NOT_AVAILABLE';
  end if;

  if exists (
    select 1 from public.registrations
    where event_id = p_event_id and user_id = p_user_id and status = 'registered'
  ) then
    raise exception 'ALREADY_REGISTERED';
  end if;

  select count(*) into v_count from public.registrations
  where event_id = p_event_id and status = 'registered';
  if v_count >= v_event.capacity then
    raise exception 'EVENT_FULL';
  end if;

  insert into public.registrations(event_id, user_id, status)
  values (p_event_id, p_user_id, 'registered')
  on conflict (event_id, user_id) do update set status = 'registered'
  returning * into v_registration;

  return jsonb_build_object('id', v_registration.id, 'event_id', v_registration.event_id,
    'user_id', v_registration.user_id, 'status', v_registration.status,
    'created_at', v_registration.created_at);
end;
$$;

-- API access is through the Express backend. Browser clients do not access these tables directly.
alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.registrations enable row level security;

-- No anon/authenticated table policies are intentionally added: the server-only service role bypasses RLS,
-- and every protected API request is checked by Express. Do not expose the service-role key to clients.
-- Promote a trusted account to organizer only after that user has signed up:
-- update public.profiles set role = 'organizer' where email = 'organizer@your-college.edu';
