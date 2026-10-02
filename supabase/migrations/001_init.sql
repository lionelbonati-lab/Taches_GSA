-- Tâches GSA : schéma multi-comités et sécurité côté base.
-- Cette migration est relançable après un échec partiel.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  nom text,
  prenom text,
  actif boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.committees (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- CREATE TABLE IF NOT EXISTS ne complète pas une table créée lors d'une
-- précédente exécution. Garantir ici les colonnes utilisées par les policies.
alter table if exists public.committees
  add column if not exists created_by uuid;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'committees_created_by_fkey' and conrelid = 'public.committees'::regclass) then
    alter table public.committees add constraint committees_created_by_fkey foreign key (created_by) references auth.users(id) not valid;
  end if;
end $$;

create table if not exists public.memberships (
  user_id uuid references auth.users(id) on delete cascade,
  committee_id uuid references public.committees(id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member', 'external')),
  primary key (user_id, committee_id)
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  committee_id uuid not null references public.committees(id) on delete cascade,
  section_id text,
  sous_section text,
  titre text not null,
  responsables uuid[] not null default '{}',
  status_id text,
  delai date,
  remarque text default '',
  event_id text,
  meeting_id text,
  checklist jsonb not null default '[]',
  parent_id uuid references public.tasks(id),
  documents jsonb not null default '[]',
  delai_ref jsonb,
  recurrence text,
  postes_resp text[] default '{}',
  suivante_id uuid,
  terminee_le date,
  created_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

alter table if exists public.tasks
  add column if not exists created_by uuid;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'tasks_created_by_fkey' and conrelid = 'public.tasks'::regclass) then
    alter table public.tasks add constraint tasks_created_by_fkey foreign key (created_by) references auth.users(id) not valid;
  end if;
end $$;

create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  committee_id uuid not null references public.committees(id) on delete cascade,
  data jsonb not null default '{}'
);
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  committee_id uuid not null references public.committees(id) on delete cascade,
  data jsonb not null default '{}'
);
create table if not exists public.people (
  id uuid primary key default gen_random_uuid(),
  committee_id uuid not null references public.committees(id) on delete cascade,
  user_id uuid references auth.users(id),
  data jsonb not null default '{}'
);
create table if not exists public.statuses (
  id text,
  committee_id uuid references public.committees(id) on delete cascade,
  data jsonb not null default '{}',
  primary key (id, committee_id)
);
create table if not exists public.sections (
  id text,
  committee_id uuid references public.committees(id) on delete cascade,
  data jsonb not null default '{}',
  primary key (id, committee_id)
);
create table if not exists public.roles (
  id text,
  committee_id uuid references public.committees(id) on delete cascade,
  data jsonb not null default '{}',
  primary key (id, committee_id)
);
create table if not exists public.polls (
  id uuid primary key default gen_random_uuid(),
  committee_id uuid references public.committees(id) on delete cascade,
  data jsonb not null default '{}'
);
create table if not exists public.app_state (
  user_id uuid references auth.users(id) on delete cascade,
  committee_id uuid references public.committees(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz default now(),
  primary key (user_id, committee_id)
);

create or replace function public.is_committee_member(cid uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.memberships
    where committee_id = cid and user_id = auth.uid()
  );
$$;

create or replace function public.is_committee_admin(cid uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.memberships
    where committee_id = cid and user_id = auth.uid() and role = 'admin'
  );
$$;

alter table public.profiles enable row level security;
alter table public.committees enable row level security;
alter table public.memberships enable row level security;
alter table public.tasks enable row level security;
alter table public.meetings enable row level security;
alter table public.events enable row level security;
alter table public.people enable row level security;
alter table public.statuses enable row level security;
alter table public.sections enable row level security;
alter table public.roles enable row level security;
alter table public.polls enable row level security;
alter table public.app_state enable row level security;

-- Recréation idempotente des policies.
drop policy if exists profiles_self_or_member on public.profiles;
drop policy if exists committees_member on public.committees;
drop policy if exists committees_admin_insert on public.committees;
drop policy if exists committees_admin_update on public.committees;
drop policy if exists committees_admin_delete on public.committees;
drop policy if exists memberships_member_read on public.memberships;
drop policy if exists memberships_admin_write on public.memberships;
drop policy if exists tasks_member_or_assignee on public.tasks;
drop policy if exists tasks_member_write on public.tasks;
drop policy if exists tasks_member_update on public.tasks;
drop policy if exists tasks_admin_delete on public.tasks;
drop policy if exists meetings_member on public.meetings;
drop policy if exists events_member on public.events;
drop policy if exists people_member on public.people;
drop policy if exists lists_member on public.statuses;
drop policy if exists sections_member on public.sections;
drop policy if exists roles_admin on public.roles;
drop policy if exists polls_member on public.polls;
drop policy if exists state_owner on public.app_state;

create policy profiles_self_or_member on public.profiles
  for select using (
    id = auth.uid() or exists (
      select 1 from public.memberships m
      where m.user_id = profiles.id and public.is_committee_member(m.committee_id)
    )
  );
create policy committees_member on public.committees
  for select using (public.is_committee_member(id));
create policy committees_admin_insert on public.committees
  for insert with check (auth.uid() = created_by);
create policy committees_admin_update on public.committees
  for update using (public.is_committee_admin(id));
create policy committees_admin_delete on public.committees
  for delete using (public.is_committee_admin(id));
create policy memberships_member_read on public.memberships
  for select using (public.is_committee_member(committee_id));
create policy memberships_admin_write on public.memberships
  for all using (public.is_committee_admin(committee_id))
  with check (public.is_committee_admin(committee_id));
create policy tasks_member_or_assignee on public.tasks
  for select using (
    public.is_committee_member(committee_id) or auth.uid() = any(responsables)
  );
create policy tasks_member_write on public.tasks
  for insert with check (public.is_committee_member(committee_id));
create policy tasks_member_update on public.tasks
  for update using (
    public.is_committee_admin(committee_id)
    or auth.uid() = any(responsables)
    or created_by = auth.uid()
  );
create policy tasks_admin_delete on public.tasks
  for delete using (public.is_committee_admin(committee_id));

-- Les autres entités suivent la frontière du comité.
create policy meetings_member on public.meetings
  for all using (public.is_committee_member(committee_id))
  with check (public.is_committee_member(committee_id));
create policy events_member on public.events
  for all using (public.is_committee_member(committee_id))
  with check (public.is_committee_member(committee_id));
create policy people_member on public.people
  for all using (public.is_committee_member(committee_id))
  with check (public.is_committee_member(committee_id));
create policy lists_member on public.statuses
  for all using (public.is_committee_member(committee_id))
  with check (public.is_committee_member(committee_id));
create policy sections_member on public.sections
  for all using (public.is_committee_member(committee_id))
  with check (public.is_committee_member(committee_id));
create policy roles_admin on public.roles
  for all using (public.is_committee_admin(committee_id))
  with check (public.is_committee_admin(committee_id));
create policy polls_member on public.polls
  for all using (public.is_committee_member(committee_id))
  with check (public.is_committee_member(committee_id));
create policy state_owner on public.app_state
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, nom, prenom)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'nom', ''),
    coalesce(new.raw_user_meta_data ->> 'prenom', '')
  )
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();
