
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.user_levels (
  code text primary key,
  display_name text not null,
  request_limit_cents integer not null check (request_limit_cents > 0),
  period_limit_cents integer check (period_limit_cents is null or period_limit_cents > 0),
  sort_order integer not null unique,
  rules jsonb not null default '{}'::jsonb
);

insert into public.user_levels (code, display_name, request_limit_cents, period_limit_cents, sort_order, rules)
values
  ('initial', 'Inicial', 5000, 15000, 10, '{"description":"Nível inicial"}'),
  ('verified', 'Verificado', 10000, 30000, 20, '{"description":"Nível verificado"}'),
  ('community', 'Comunidade', 15000, 45000, 30, '{"description":"Nível comunidade"}'),
  ('trusted', 'Confiável', 20000, 60000, 40, '{"description":"Nível confiável"}'),
  ('special', 'Especial', 30000, null, 50, '{"description":"Nível especial; limite por período ainda não definido"}')
on conflict (code) do update
set display_name = excluded.display_name,
    request_limit_cents = excluded.request_limit_cents,
    period_limit_cents = excluded.period_limit_cents,
    sort_order = excluded.sort_order,
    rules = excluded.rules;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  public_name text not null default '',
  level text not null default 'initial' references public.user_levels(code),
  request_limit_cents integer not null default 5000 check (request_limit_cents > 0),
  period_limit_cents integer check (period_limit_cents is null or period_limit_cents > 0),
  account_status text not null default 'active' check (account_status in ('active','suspended','blocked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.public_profiles (
  id uuid primary key references public.profiles(id) on delete cascade,
  public_name text not null,
  level text not null references public.user_levels(code),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  category text not null check (char_length(trim(category)) between 1 and 80),
  description text not null check (char_length(trim(description)) between 1 and 1000),
  goal_cents integer not null check (goal_cents > 0),
  raised_cents integer not null default 0 check (raised_cents >= 0 and raised_cents <= goal_cents),
  status text not null default 'active' check (status in ('active','completed','cancelled','suspended','expired')),
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at is null or expires_at > starts_at)
);

create unique index requests_one_active_per_user
on public.requests(user_id)
where status = 'active';

create index requests_feed_idx on public.requests(status, created_at desc);
create index requests_user_idx on public.requests(user_id, created_at desc);

create table public.contributions (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests(id) on delete restrict,
  contributor_user_id uuid not null references public.profiles(id) on delete restrict,
  amount_cents integer not null check (amount_cents > 0),
  platform_fee_cents integer not null check (platform_fee_cents >= 0),
  status text not null default 'simulated_confirmed'
    check (status in ('simulated_confirmed','cancelled')),
  created_at timestamptz not null default now()
);

create index contributions_request_idx on public.contributions(request_id, created_at desc);
create index contributions_contributor_idx on public.contributions(contributor_user_id, created_at desc);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  title text not null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_idx on public.notifications(user_id, created_at desc);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_user_id uuid not null references public.profiles(id) on delete cascade,
  target_type text not null check (target_type in ('request','profile')),
  target_id uuid not null,
  reason text not null check (char_length(trim(reason)) between 1 and 1000),
  status text not null default 'open' check (status in ('open','reviewing','resolved','dismissed')),
  created_at timestamptz not null default now()
);

create index reports_reporter_idx on public.reports(reporter_user_id, created_at desc);

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_actor_idx on public.audit_log(actor_user_id, created_at desc);
create index audit_log_entity_idx on public.audit_log(entity_type, entity_id, created_at desc);

create or replace function private.abbreviate_public_name(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when nullif(trim(p_name), '') is null then 'Membro Somma'
    when array_length(regexp_split_to_array(trim(p_name), '\s+'), 1) = 1 then trim(p_name)
    else
      (regexp_split_to_array(trim(p_name), '\s+'))[1] || ' ' ||
      left((regexp_split_to_array(trim(p_name), '\s+'))[
        array_length(regexp_split_to_array(trim(p_name), '\s+'), 1)
      ], 1) || '.'
  end
$$;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function private.sync_public_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.public_profiles (id, public_name, level, created_at, updated_at)
  values (new.id, new.public_name, new.level, new.created_at, now())
  on conflict (id) do update
  set public_name = excluded.public_name,
      level = excluded.level,
      updated_at = now();
  return new;
end;
$$;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_full_name text;
  v_public_name text;
  v_request_limit integer;
  v_period_limit integer;
begin
  v_full_name := coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), '');
  v_public_name := private.abbreviate_public_name(v_full_name);

  select request_limit_cents, period_limit_cents
  into v_request_limit, v_period_limit
  from public.user_levels
  where code = 'initial';

  insert into public.profiles (
    id, full_name, public_name, level,
    request_limit_cents, period_limit_cents, account_status
  )
  values (
    new.id, v_full_name, v_public_name, 'initial',
    v_request_limit, v_period_limit, 'active'
  );

  return new;
end;
$$;

create or replace function private.validate_request_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles%rowtype;
begin
  if new.user_id is distinct from auth.uid() then
    raise exception 'request_owner_mismatch';
  end if;

  select * into v_profile
  from public.profiles
  where id = new.user_id
  for update;

  if not found then
    raise exception 'profile_not_found';
  end if;

  if v_profile.account_status <> 'active' then
    raise exception 'account_not_active';
  end if;

  if new.goal_cents > v_profile.request_limit_cents then
    raise exception 'request_limit_exceeded';
  end if;

  if exists (
    select 1 from public.requests
    where user_id = new.user_id and status = 'active'
  ) then
    raise exception 'active_request_already_exists';
  end if;

  new.raised_cents := 0;
  new.status := 'active';
  new.starts_at := coalesce(new.starts_at, now());
  return new;
end;
$$;

create or replace function private.validate_contribution_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.requests%rowtype;
  v_status text;
begin
  if new.contributor_user_id is distinct from auth.uid() then
    raise exception 'contributor_mismatch';
  end if;

  select account_status into v_status
  from public.profiles
  where id = new.contributor_user_id;

  if v_status is distinct from 'active' then
    raise exception 'account_not_active';
  end if;

  select * into v_request
  from public.requests
  where id = new.request_id
  for update;

  if not found then
    raise exception 'request_not_found';
  end if;

  if v_request.status <> 'active' then
    raise exception 'request_not_active';
  end if;

  if v_request.user_id = new.contributor_user_id then
    raise exception 'self_contribution_not_allowed';
  end if;

  if new.amount_cents > (v_request.goal_cents - v_request.raised_cents) then
    raise exception 'contribution_exceeds_remaining_goal';
  end if;

  new.platform_fee_cents := 20 + ceil(new.amount_cents * 0.05)::integer;
  new.status := 'simulated_confirmed';
  return new;
end;
$$;

create or replace function private.apply_contribution()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_new_raised integer;
  v_goal integer;
begin
  update public.requests
  set raised_cents = raised_cents + new.amount_cents,
      status = case
        when raised_cents + new.amount_cents >= goal_cents then 'completed'
        else status
      end,
      updated_at = now()
  where id = new.request_id
  returning user_id, raised_cents, goal_cents
  into v_owner, v_new_raised, v_goal;

  insert into public.notifications(user_id, type, title, body)
  values (
    v_owner,
    'contribution_received',
    'Você recebeu uma contribuição',
    'Seu pedido recebeu uma nova contribuição simulada.'
  );

  insert into public.audit_log(actor_user_id, event_type, entity_type, entity_id, metadata)
  values (
    new.contributor_user_id,
    'contribution.created',
    'contribution',
    new.id,
    jsonb_build_object(
      'request_id', new.request_id,
      'amount_cents', new.amount_cents,
      'platform_fee_cents', new.platform_fee_cents,
      'simulated', true
    )
  );

  return new;
end;
$$;

create or replace function private.audit_request_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_log(actor_user_id, event_type, entity_type, entity_id, metadata)
  values (
    new.user_id,
    'request.created',
    'request',
    new.id,
    jsonb_build_object('goal_cents', new.goal_cents, 'category', new.category)
  );
  return new;
end;
$$;

create or replace function private.audit_report_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_log(actor_user_id, event_type, entity_type, entity_id, metadata)
  values (
    new.reporter_user_id,
    'report.created',
    'report',
    new.id,
    jsonb_build_object('target_type', new.target_type, 'target_id', new.target_id)
  );
  return new;
end;
$$;

revoke execute on all functions in schema private from public, anon, authenticated;

create trigger profiles_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();

create trigger public_profiles_updated_at
before update on public.public_profiles
for each row execute function private.set_updated_at();

create trigger requests_updated_at
before update on public.requests
for each row execute function private.set_updated_at();

create trigger profiles_sync_public
after insert or update of public_name, level on public.profiles
for each row execute function private.sync_public_profile();

create trigger auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

create trigger requests_validate_insert
before insert on public.requests
for each row execute function private.validate_request_insert();

create trigger requests_audit_insert
after insert on public.requests
for each row execute function private.audit_request_insert();

create trigger contributions_validate_insert
before insert on public.contributions
for each row execute function private.validate_contribution_insert();

create trigger contributions_apply
after insert on public.contributions
for each row execute function private.apply_contribution();

create trigger reports_audit_insert
after insert on public.reports
for each row execute function private.audit_report_insert();

alter table public.user_levels enable row level security;
alter table public.profiles enable row level security;
alter table public.public_profiles enable row level security;
alter table public.requests enable row level security;
alter table public.contributions enable row level security;
alter table public.notifications enable row level security;
alter table public.reports enable row level security;
alter table public.audit_log enable row level security;

create policy user_levels_read
on public.user_levels for select
to authenticated
using (true);

create policy profiles_read_own
on public.profiles for select
to authenticated
using ((select auth.uid()) = id);

create policy profiles_update_own
on public.profiles for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create policy public_profiles_read
on public.public_profiles for select
to authenticated
using (true);

create policy requests_read
on public.requests for select
to authenticated
using (
  status = 'active'
  or (select auth.uid()) = user_id
);

create policy requests_insert_own
on public.requests for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy contributions_read_related
on public.contributions for select
to authenticated
using (
  (select auth.uid()) = contributor_user_id
  or exists (
    select 1
    from public.requests r
    where r.id = request_id
      and r.user_id = (select auth.uid())
  )
);

create policy contributions_insert_own
on public.contributions for insert
to authenticated
with check ((select auth.uid()) = contributor_user_id);

create policy notifications_read_own
on public.notifications for select
to authenticated
using ((select auth.uid()) = user_id);

create policy notifications_update_own
on public.notifications for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy reports_insert_own
on public.reports for insert
to authenticated
with check ((select auth.uid()) = reporter_user_id);

create policy reports_read_own
on public.reports for select
to authenticated
using ((select auth.uid()) = reporter_user_id);

revoke all on public.user_levels from anon, authenticated;
revoke all on public.profiles from anon, authenticated;
revoke all on public.public_profiles from anon, authenticated;
revoke all on public.requests from anon, authenticated;
revoke all on public.contributions from anon, authenticated;
revoke all on public.notifications from anon, authenticated;
revoke all on public.reports from anon, authenticated;
revoke all on public.audit_log from anon, authenticated;

grant select on public.user_levels to authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, public_name) on public.profiles to authenticated;
grant select on public.public_profiles to authenticated;
grant select on public.requests to authenticated;
grant insert (user_id, category, description, goal_cents, expires_at) on public.requests to authenticated;
grant select on public.contributions to authenticated;
grant insert (request_id, contributor_user_id, amount_cents) on public.contributions to authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant select on public.reports to authenticated;
grant insert (reporter_user_id, target_type, target_id, reason) on public.reports to authenticated;

grant usage on schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
