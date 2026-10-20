-- Somma Backend v1: patch over the three existing project migrations.
-- This file does not configure Auth, send messages, or introduce real payments.
-- Period limits use calendar months in UTC, matching the frontend contract.

alter table public.requests
  add column duration_hours smallint not null default 48,
  add constraint requests_duration_hours_check check (duration_hours in (24, 48)),
  add constraint requests_category_allowed_check check (
    category in (
      'Alimentação', 'Combustível', 'Transporte', 'Medicamentos',
      'Conta essencial', 'Trabalho', 'Emergência', 'Outro'
    )
  );

-- Existing data was confirmed empty before preparing this migration. Should a
-- request be created before application, preserve its start and give it a
-- finite server-defined duration instead of leaving an unbounded expiration.
update public.requests
set expires_at = starts_at + make_interval(hours => duration_hours)
where expires_at is null;

alter table public.requests alter column expires_at set not null;
revoke insert (expires_at) on public.requests from authenticated;
grant insert (duration_hours) on public.requests to authenticated;

alter table public.contributions
  add column idempotency_key uuid not null default gen_random_uuid(),
  add constraint contributions_contributor_idempotency_key
    unique (contributor_user_id, idempotency_key);

grant insert (idempotency_key) on public.contributions to authenticated;

create index contributions_request_contributor_idx
  on public.contributions (request_id, contributor_user_id);

alter table public.profiles
  add constraint profiles_full_name_length_check
    check (char_length(btrim(full_name)) between 2 and 120);

create or replace function private.set_profile_public_name()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_parts text[];
begin
  -- Only built-in functions: an authenticated invoker needs no access to
  -- privileged helper functions to exercise its granted UPDATE(full_name).
  new.full_name := btrim(regexp_replace(coalesce(new.full_name, ''), '\s+', ' ', 'g'));
  if char_length(new.full_name) not between 2 and 120 then
    raise exception 'invalid_full_name';
  end if;

  v_parts := regexp_split_to_array(new.full_name, ' ');
  new.public_name := v_parts[1];
  if array_length(v_parts, 1) > 1 then
    new.public_name := new.public_name || ' ' ||
      left(v_parts[array_length(v_parts, 1)], 1) || '.';
  end if;
  return new;
end;
$$;

create or replace trigger profiles_set_public_name
before insert or update of full_name on public.profiles
for each row execute function private.set_profile_public_name();

-- UPDATE OF examines the original SET list, not changes from a BEFORE trigger.
create or replace trigger profiles_sync_public
after insert or update of full_name, public_name, level on public.profiles
for each row execute function private.sync_public_profile();

create or replace function private.can_read_request(p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.requests r
    join public.profiles owner_profile on owner_profile.id = r.user_id
    where r.id = p_request_id
      and (
        r.user_id = (select auth.uid())
        or exists (
          select 1
          from public.contributions c
          where c.request_id = r.id
            and c.contributor_user_id = (select auth.uid())
        )
        or (
          r.status = 'active'
          and r.expires_at > statement_timestamp()
          and owner_profile.account_status = 'active'
        )
      )
  );
$$;

comment on function private.can_read_request(uuid) is
  'RLS predicate for the current authenticated user only. Owner and contributors retain history; the feed requires an active, unexpired request from an active account. Definer avoids recursive requests/contributions RLS.';

revoke all on function private.can_read_request(uuid)
  from public, anon, authenticated, service_role;
grant usage on schema private to authenticated;
grant execute on function private.can_read_request(uuid) to authenticated;

alter policy requests_read on public.requests
  -- The direct owner check also admits INSERT ... RETURNING before the new
  -- row becomes visible to the STABLE helper's statement snapshot.
  using ((select auth.uid()) = user_id or private.can_read_request(id));

create or replace function private.validate_request_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles%rowtype;
  v_received_period bigint;
  v_last_request timestamptz;
  v_now timestamptz;
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_expired record;
begin
  if auth.uid() is null or new.user_id is distinct from auth.uid() then
    raise exception 'request_owner_mismatch';
  end if;

  -- Global lock order: profiles before requests. Serializes creation and
  -- administrative limit changes with contributions for this beneficiary.
  select * into v_profile
  from public.profiles
  where id = new.user_id
  for update;

  if not found then
    raise exception 'profile_not_found';
  end if;
  v_now := clock_timestamp();

  if v_profile.account_status <> 'active' then
    raise exception 'account_not_active';
  end if;
  if new.goal_cents is null or new.goal_cents < 2000 then
    raise exception 'request_below_minimum';
  end if;
  if new.goal_cents > v_profile.request_limit_cents then
    raise exception 'request_limit_exceeded';
  end if;
  if new.category is null or new.category not in (
    'Alimentação', 'Combustível', 'Transporte', 'Medicamentos',
    'Conta essencial', 'Trabalho', 'Emergência', 'Outro'
  ) then
    raise exception 'invalid_category';
  end if;
  if new.duration_hours is null or new.duration_hours not in (24, 48) then
    raise exception 'invalid_duration_hours';
  end if;
  if v_profile.period_limit_cents is null then
    raise exception 'period_limit_not_configured';
  end if;

  -- The UI derives expiration from expires_at. Materialize old statuses here
  -- before the unique active-request check; no scheduled job is required.
  for v_expired in
    update public.requests
    set status = 'expired', updated_at = v_now
    where user_id = new.user_id and status = 'active' and expires_at <= v_now
    returning id, raised_cents
  loop
    insert into public.audit_log(actor_user_id, event_type, entity_type, entity_id, metadata)
    values (new.user_id, 'request.expired', 'request', v_expired.id,
      jsonb_build_object('raised_cents', v_expired.raised_cents, 'simulated', true));
  end loop;

  if exists (
    select 1 from public.requests
    where user_id = new.user_id and status = 'active'
  ) then
    raise exception 'active_request_already_exists';
  end if;

  select max(created_at) into v_last_request
  from public.requests where user_id = new.user_id;
  if v_last_request is not null and v_last_request > v_now - interval '7 days' then
    raise exception 'request_interval_not_elapsed';
  end if;

  v_period_start := date_trunc('month', v_now at time zone 'UTC') at time zone 'UTC';
  v_period_end := (date_trunc('month', v_now at time zone 'UTC') + interval '1 month') at time zone 'UTC';
  select coalesce(sum(c.amount_cents), 0) into v_received_period
  from public.contributions c
  join public.requests r on r.id = c.request_id
  where r.user_id = new.user_id
    and c.status = 'simulated_confirmed'
    and c.created_at >= v_period_start and c.created_at < v_period_end;

  if v_received_period + new.goal_cents > v_profile.period_limit_cents then
    raise exception 'period_limit_exceeded';
  end if;

  new.raised_cents := 0;
  new.helper_count := 0;
  new.status := 'active';
  new.created_at := v_now;
  new.updated_at := v_now;
  new.starts_at := v_now;
  new.expires_at := v_now + make_interval(hours => new.duration_hours);
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
  insert into public.notifications(user_id, type, title, body)
  values (new.user_id, 'request_published', 'Seu pedido foi publicado',
    'Seu pedido já pode receber contribuições simuladas de outras pessoas.');

  insert into public.audit_log(actor_user_id, event_type, entity_type, entity_id, metadata)
  values (new.user_id, 'request.created', 'request', new.id,
    jsonb_build_object('goal_cents', new.goal_cents, 'category', new.category,
      'duration_hours', new.duration_hours, 'expires_at', new.expires_at, 'simulated', true));
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
  v_owner uuid;
  v_contributor_status text;
  v_owner_status text;
  v_period_limit integer;
  v_received_period bigint;
  v_now timestamptz;
  v_period_start timestamptz;
  v_period_end timestamptz;
begin
  if auth.uid() is null or new.contributor_user_id is distinct from auth.uid() then
    raise exception 'contributor_mismatch';
  end if;
  if new.amount_cents is null or new.amount_cents <= 0 then
    raise exception using errcode = '23514', message = 'invalid_contribution_amount';
  end if;

  select user_id into v_owner from public.requests where id = new.request_id;
  if not found then
    raise exception 'request_not_found';
  end if;
  if v_owner = new.contributor_user_id then
    raise exception 'self_contribution_not_allowed';
  end if;

  -- Exclusive profile locks serialize monthly-limit checks for a beneficiary
  -- even when concurrent contributions target different requests. FOR SHARE
  -- is insufficient: compatible locks allow both transactions to SUM the same
  -- pre-commit total and jointly exceed the monthly cap. All paths acquire
  -- profile locks before request locks; UUID ordering keeps acquisition stable.
  perform p.id from public.profiles p
  where p.id in (new.contributor_user_id, v_owner)
  order by p.id for update;

  select account_status into v_contributor_status
  from public.profiles where id = new.contributor_user_id;
  if v_contributor_status is distinct from 'active' then
    raise exception 'account_not_active';
  end if;
  select account_status, period_limit_cents into v_owner_status, v_period_limit
  from public.profiles where id = v_owner;
  if v_owner_status is distinct from 'active' then
    raise exception 'beneficiary_not_active';
  end if;

  select * into v_request from public.requests
  where id = new.request_id for update;
  if not found or v_request.user_id is distinct from v_owner then
    raise exception 'request_not_found';
  end if;
  v_now := clock_timestamp();

  if v_request.status <> 'active' then
    raise exception 'request_not_active';
  end if;
  if v_request.expires_at is null or v_request.expires_at <= v_now then
    raise exception 'request_expired';
  end if;
  if new.amount_cents > v_request.goal_cents - v_request.raised_cents then
    raise exception 'contribution_exceeds_remaining_goal';
  end if;
  if v_period_limit is null then
    raise exception 'period_limit_not_configured';
  end if;

  v_period_start := date_trunc('month', v_now at time zone 'UTC') at time zone 'UTC';
  v_period_end := (date_trunc('month', v_now at time zone 'UTC') + interval '1 month') at time zone 'UTC';
  select coalesce(sum(c.amount_cents), 0) into v_received_period
  from public.contributions c
  join public.requests r on r.id = c.request_id
  where r.user_id = v_owner
    and c.status = 'simulated_confirmed'
    and c.created_at >= v_period_start and c.created_at < v_period_end;
  if v_received_period + new.amount_cents > v_period_limit then
    raise exception 'recipient_period_limit_exceeded';
  end if;

  new.platform_fee_cents := 20 + ceil(new.amount_cents * 0.05)::integer;
  new.status := 'simulated_confirmed';
  new.created_at := v_now;
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
  v_status text;
begin
  -- validate_contribution_insert retains the request lock until commit.
  update public.requests r
  set raised_cents = r.raised_cents + new.amount_cents,
      helper_count = (
        select count(distinct c.contributor_user_id)::integer
        from public.contributions c
        where c.request_id = new.request_id and c.status = 'simulated_confirmed'
      ),
      status = case when r.raised_cents + new.amount_cents >= r.goal_cents
        then 'completed' else r.status end,
      updated_at = clock_timestamp()
  where r.id = new.request_id
  returning r.user_id, r.status into v_owner, v_status;

  insert into public.notifications(user_id, type, title, body)
  values
    (v_owner, 'contribution_received', 'Você recebeu uma contribuição',
      'Seu pedido recebeu uma nova contribuição simulada.'),
    (new.contributor_user_id, 'contribution_sent', 'Sua contribuição foi registrada',
      'Sua contribuição simulada foi registrada no pedido e no seu histórico.');

  insert into public.audit_log(actor_user_id, event_type, entity_type, entity_id, metadata)
  values (new.contributor_user_id, 'contribution.created', 'contribution', new.id,
    jsonb_build_object('request_id', new.request_id, 'amount_cents', new.amount_cents,
      'platform_fee_cents', new.platform_fee_cents, 'idempotency_key', new.idempotency_key,
      'simulated', true));

  if v_status = 'completed' then
    insert into public.notifications(user_id, type, title, body)
    values (v_owner, 'request_completed', 'Seu pedido atingiu a meta',
      'A meta do seu pedido foi atingida com contribuições simuladas.');
    insert into public.audit_log(actor_user_id, event_type, entity_type, entity_id, metadata)
    values (new.contributor_user_id, 'request.completed', 'request', new.request_id,
      jsonb_build_object('simulated', true));
  end if;
  return new;
end;
$$;

create or replace function private.validate_report_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or new.reporter_user_id is distinct from auth.uid() then
    raise exception 'reporter_mismatch';
  end if;
  if not exists (select 1 from public.profiles
    where id = new.reporter_user_id and account_status = 'active') then
    raise exception 'account_not_active';
  end if;
  if new.target_type = 'request' then
    if not private.can_read_request(new.target_id) then
      raise exception 'report_target_not_found';
    end if;
  elsif new.target_type = 'profile' then
    if not exists (select 1 from public.public_profiles where id = new.target_id) then
      raise exception 'report_target_not_found';
    end if;
  else
    raise exception 'report_target_not_found';
  end if;
  new.reason := btrim(new.reason);
  new.status := 'open';
  new.created_at := clock_timestamp();
  return new;
end;
$$;

revoke all on function private.validate_report_insert()
  from public, anon, authenticated, service_role;

create trigger reports_validate_insert
before insert on public.reports
for each row execute function private.validate_report_insert();

-- Existing trigger functions retain their restricted ACLs through replacement.
-- Explicitly keep the invoker name trigger and all write helpers non-callable.
revoke all on function private.set_profile_public_name(),
  private.validate_request_insert(), private.audit_request_insert(),
  private.validate_contribution_insert(), private.apply_contribution()
  from public, anon, authenticated, service_role;

comment on column public.requests.duration_hours is
  'Server-controlled expiration is starts_at plus 24 or 48 hours.';
comment on column public.contributions.idempotency_key is
  'Client intention identifier, reused on retries and unique per contributor. Retrieve the original record after an ambiguous result; never upsert.';
