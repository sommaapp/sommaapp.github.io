
alter table public.requests
add column if not exists helper_count integer not null default 0 check (helper_count >= 0);

create or replace function private.set_profile_public_name()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.full_name is distinct from old.full_name then
    new.public_name := private.abbreviate_public_name(new.full_name);
  end if;
  return new;
end;
$$;

revoke execute on function private.set_profile_public_name() from public, anon, authenticated;

drop trigger if exists profiles_set_public_name on public.profiles;
create trigger profiles_set_public_name
before update of full_name on public.profiles
for each row execute function private.set_profile_public_name();

revoke update (public_name) on public.profiles from authenticated;

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

  if new.goal_cents < 2000 then
    raise exception 'request_below_minimum';
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

  select max(created_at) into v_last_request
  from public.requests
  where user_id = new.user_id;

  if v_last_request is not null and v_last_request > now() - interval '7 days' then
    raise exception 'request_interval_not_elapsed';
  end if;

  if v_profile.period_limit_cents is not null then
    select coalesce(sum(c.amount_cents), 0)
    into v_received_period
    from public.contributions c
    join public.requests r on r.id = c.request_id
    where r.user_id = new.user_id
      and c.status = 'simulated_confirmed'
      and c.created_at >= date_trunc('month', now());

    if v_received_period + new.goal_cents > v_profile.period_limit_cents then
      raise exception 'period_limit_exceeded';
    end if;
  end if;

  new.raised_cents := 0;
  new.helper_count := 0;
  new.status := 'active';
  new.starts_at := coalesce(new.starts_at, now());
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
begin
  update public.requests
  set raised_cents = raised_cents + new.amount_cents,
      helper_count = helper_count + 1,
      status = case
        when raised_cents + new.amount_cents >= goal_cents then 'completed'
        else status
      end,
      updated_at = now()
  where id = new.request_id
  returning user_id into v_owner;

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

revoke execute on function private.validate_request_insert() from public, anon, authenticated;
revoke execute on function private.apply_contribution() from public, anon, authenticated;
