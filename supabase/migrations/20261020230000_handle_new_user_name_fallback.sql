-- Keep the original schema migration immutable while allowing signup metadata without a name.
-- The profile validation trigger requires a non-empty full_name; use a neutral fallback.
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

revoke all on function private.handle_new_user()
  from public, anon, authenticated, service_role;
