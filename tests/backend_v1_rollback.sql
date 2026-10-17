-- Somma Backend v1 sequential integration checks.
-- Run the WHOLE file against the reviewed schema as postgres. Every fixture,
-- temporary helper, Auth row and application row is rolled back at the end.
-- Auth fixtures contain no email, phone, password, session or external message.
-- This suite verifies permissions and transactional effects sequentially;
-- it does not claim to exercise simultaneous sessions or real email delivery.

begin;
set local statement_timeout = '45s';
set local lock_timeout = '5s';

create temporary table somma_test_fixtures (
  label text primary key,
  id uuid not null default gen_random_uuid()
) on commit drop;

create temporary table somma_test_results (
  name text primary key,
  passed boolean not null default true
) on commit drop;

-- GRANT ON SCHEMA resolves an actual catalog name, not the pg_temp alias.
-- Resolve that name after CREATE TEMP has initialized this session's schema.
do $$
declare v_temp_schema text;
begin
  select nspname into v_temp_schema
  from pg_catalog.pg_namespace
  where oid = pg_catalog.pg_my_temp_schema();
  if v_temp_schema is null then raise exception 'Temporary schema was not initialized'; end if;
  execute format('grant usage on schema %I to authenticated, anon', v_temp_schema);
  execute format(
    'grant select, insert on table %I.somma_test_fixtures, %I.somma_test_results to authenticated, anon',
    v_temp_schema, v_temp_schema);
end;
$$;

create function pg_temp.fixture(p_label text)
returns uuid language sql stable security invoker set search_path = ''
as $$ select id from pg_temp.somma_test_fixtures where label = p_label $$;

create function pg_temp.assume_user(p_label text)
returns void language plpgsql security invoker set search_path = ''
as $$
declare v_id uuid;
begin
  v_id := pg_temp.fixture(p_label);
  if v_id is null then raise exception 'Missing test fixture: %', p_label; end if;
  perform set_config('request.jwt.claim.sub', v_id::text, true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_id::text, 'role', 'authenticated')::text, true);
end;
$$;

create function pg_temp.assert_true(p_condition boolean, p_name text)
returns void language plpgsql security invoker set search_path = ''
as $$
begin
  if p_condition is distinct from true then
    raise exception 'FAIL: %', p_name;
  end if;
  insert into pg_temp.somma_test_results(name) values (p_name);
end;
$$;

create function pg_temp.expect_error(
  p_sql text, p_state text, p_message text, p_name text
)
returns void language plpgsql security invoker set search_path = ''
as $$
declare v_state text; v_message text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_message = message_text;
    if v_state <> p_state or (p_message is not null and position(p_message in v_message) = 0) then
      raise exception 'FAIL: % (expected % / %, got % / %)',
        p_name, p_state, p_message, v_state, v_message;
    end if;
    insert into pg_temp.somma_test_results(name) values (p_name);
    return;
  end;
  raise exception 'FAIL: % (statement unexpectedly succeeded)', p_name;
end;
$$;

do $$
declare v_temp_schema text;
begin
  select nspname into v_temp_schema
  from pg_catalog.pg_namespace
  where oid = pg_catalog.pg_my_temp_schema();
  execute format(
    'grant execute on function %1$I.fixture(text), %1$I.assume_user(text), %1$I.assert_true(boolean, text), %1$I.expect_error(text, text, text, text) to authenticated, anon',
    v_temp_schema);
end;
$$;

insert into pg_temp.somma_test_fixtures(label)
values ('alice'), ('bob'), ('carol'), ('outsider'), ('expiry_owner'),
  ('month_owner'), ('cap_owner'), ('intent_bob');

insert into auth.users(id, aud, role, raw_user_meta_data, created_at, updated_at)
select id, 'authenticated', 'authenticated',
  jsonb_build_object('full_name', 'Teste ' || label, 'level', 'trusted', 'verified', true),
  clock_timestamp(), clock_timestamp()
from pg_temp.somma_test_fixtures where label <> 'intent_bob';

do $$ begin
  perform pg_temp.assert_true(
    (select bool_and(level = 'initial' and request_limit_cents = 5000 and period_limit_cents = 15000)
      from public.profiles where id in (select id from pg_temp.somma_test_fixtures)),
    'User metadata cannot self-promote or change initial limits');
  perform pg_temp.assert_true(
    not has_column_privilege('authenticated', 'public.profiles', 'level', 'UPDATE')
    and not has_column_privilege('authenticated', 'public.profiles', 'period_limit_cents', 'UPDATE')
    and not has_column_privilege('authenticated', 'public.requests', 'expires_at', 'INSERT')
    and has_column_privilege('authenticated', 'public.requests', 'duration_hours', 'INSERT')
    and has_column_privilege('authenticated', 'public.contributions', 'idempotency_key', 'INSERT'),
    'Column grants restrict authority and expose only requested new inputs');
  perform pg_temp.assert_true(
    not has_function_privilege('authenticated', 'private.abbreviate_public_name(text)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'private.validate_contribution_insert()', 'EXECUTE')
    and has_function_privilege('authenticated', 'private.can_read_request(uuid)', 'EXECUTE'),
    'Private write helpers stay non-executable while the RLS predicate is executable');
end $$;

set local role anon;
do $$ begin
  perform pg_temp.expect_error('select * from public.profiles', '42501', null,
    'Anonymous role cannot read profiles');
  perform pg_temp.expect_error('select * from public.requests', '42501', null,
    'Anonymous role cannot read requests');
end $$;
reset role;

set local role authenticated;
do $$ begin perform pg_temp.assume_user('alice'); end $$;

do $$ begin
  perform pg_temp.assert_true((select count(*) = 1 from public.profiles),
    'Authenticated profile SELECT is restricted to the owner');
  perform pg_temp.assert_true((select count(*) = 0 from public.profiles where id = pg_temp.fixture('bob')),
    'Other full names and private profile fields are invisible');
  perform pg_temp.expect_error(
    'update public.profiles set level = ''trusted'' where id = pg_temp.fixture(''alice'')',
    '42501', null, 'Client cannot promote its level');
  perform pg_temp.expect_error(
    'update public.profiles set period_limit_cents = 999999 where id = pg_temp.fixture(''alice'')',
    '42501', null, 'Client cannot raise its monthly limit');
  perform pg_temp.expect_error(
    'update public.profiles set full_name = ''X'' where id = pg_temp.fixture(''alice'')',
    'P0001', 'invalid_full_name', 'One-character names are rejected');
  perform pg_temp.expect_error(
    'update public.profiles set full_name = repeat(''X'', 121) where id = pg_temp.fixture(''alice'')',
    'P0001', 'invalid_full_name', 'Names over 120 characters are rejected');
end $$;

update public.profiles set full_name = '  Ana   Paula  ' where id = pg_temp.fixture('alice');
do $$ declare v_changed integer; begin
  perform pg_temp.assert_true(
    (select full_name = 'Ana Paula' and public_name = 'Ana P.' from public.profiles where id = pg_temp.fixture('alice'))
    and (select public_name = 'Ana P.' from public.public_profiles where id = pg_temp.fixture('alice')),
    'Editing full_name normalizes it and synchronizes the public abbreviation');
  update public.profiles set full_name = 'Forbidden Change'
  where id = pg_temp.fixture('bob');
  get diagnostics v_changed = row_count;
  perform pg_temp.assert_true(v_changed = 0, 'RLS prevents editing another full name');
  perform pg_temp.expect_error(
    'insert into public.requests(user_id,category,description,goal_cents) values (pg_temp.fixture(''bob''),''Outro'',''Teste de autoria'',2000)',
    'P0001', 'request_owner_mismatch', 'Request ownership cannot be spoofed');
  perform pg_temp.expect_error(
    'insert into public.requests(user_id,category,description,goal_cents) values (pg_temp.fixture(''alice''),''Categoria livre'',''Teste categoria'',2000)',
    'P0001', 'invalid_category', 'Categories outside the approved list are rejected');
  perform pg_temp.expect_error(
    'insert into public.requests(user_id,category,description,goal_cents,duration_hours) values (pg_temp.fixture(''alice''),''Outro'',''Teste prazo'',2000,12)',
    'P0001', 'invalid_duration_hours', 'Only 24-hour or 48-hour requests are accepted');
  perform pg_temp.expect_error(
    'insert into public.requests(user_id,category,description,goal_cents,expires_at) values (pg_temp.fixture(''alice''),''Outro'',''Teste data'',2000,now()+interval ''90 days'')',
    '42501', null, 'Client cannot choose an arbitrary expiration timestamp');
  perform pg_temp.expect_error(
    'insert into public.requests(user_id,category,description,goal_cents) values (pg_temp.fixture(''alice''),''Outro'',''Teste mínimo'',1999)',
    'P0001', 'request_below_minimum', 'Minimum goal is enforced on the server');
  perform pg_temp.expect_error(
    'insert into public.requests(user_id,category,description,goal_cents) values (pg_temp.fixture(''alice''),''Outro'',''Teste limite'',5001)',
    'P0001', 'request_limit_exceeded', 'Per-request account limit is enforced on the server');
end $$;

with created as (
  insert into public.requests(user_id,category,description,goal_cents,duration_hours)
  values (pg_temp.fixture('alice'),'Alimentação','Pedido de teste transacional',5000,48)
  returning id
)
insert into pg_temp.somma_test_fixtures(label,id) select 'request_alice',id from created;

do $$ begin
  perform pg_temp.assert_true(
    (select expires_at = starts_at + interval '48 hours' and created_at = starts_at
      and raised_cents = 0 and helper_count = 0 and status = 'active'
      from public.requests where id = pg_temp.fixture('request_alice')),
    'Server sets clocks, duration and initial request counters');
  perform pg_temp.assert_true(
    (select count(*) = 1 from public.notifications where user_id = pg_temp.fixture('alice') and type = 'request_published'),
    'Publishing creates exactly one in-app notification');
  perform pg_temp.expect_error(
    'insert into public.requests(user_id,category,description,goal_cents) values (pg_temp.fixture(''alice''),''Outro'',''Segundo pedido'',2000)',
    'P0001', 'active_request_already_exists', 'One active request per user is enforced');
  perform pg_temp.expect_error(
    'insert into public.contributions(request_id,contributor_user_id,amount_cents) values (pg_temp.fixture(''request_alice''),pg_temp.fixture(''alice''),100)',
    'P0001', 'self_contribution_not_allowed', 'Self-contribution is rejected');
  perform pg_temp.expect_error('select * from public.audit_log', '42501', null,
    'Client cannot read the internal audit log');
end $$;

do $$ begin perform pg_temp.assume_user('bob'); end $$;
insert into public.contributions(request_id,contributor_user_id,amount_cents,idempotency_key)
values (pg_temp.fixture('request_alice'),pg_temp.fixture('bob'),1001,pg_temp.fixture('intent_bob'));

do $$ begin
  perform pg_temp.assert_true(
    (select platform_fee_cents = 71 and status = 'simulated_confirmed'
      from public.contributions where idempotency_key = pg_temp.fixture('intent_bob')),
    'Contribution fee uses the agreed server-side ceil rule');
  perform pg_temp.expect_error(
    'insert into public.contributions(request_id,contributor_user_id,amount_cents,idempotency_key) values (pg_temp.fixture(''request_alice''),pg_temp.fixture(''bob''),1001,pg_temp.fixture(''intent_bob''))',
    '23505', null, 'Duplicate intention cannot create a second contribution');
  perform pg_temp.assert_true(
    (select count(*) = 1 from public.contributions where idempotency_key = pg_temp.fixture('intent_bob'))
    and (select raised_cents = 1001 and helper_count = 1 from public.requests where id = pg_temp.fixture('request_alice')),
    'Failed duplicate does not change totals or helper count');
  perform pg_temp.assert_true(
    (select count(*) = 1 from public.notifications where user_id = pg_temp.fixture('bob') and type = 'contribution_sent'),
    'Duplicate rollback preserves a single sent notification');
end $$;

insert into public.contributions(request_id,contributor_user_id,amount_cents)
values (pg_temp.fixture('request_alice'),pg_temp.fixture('bob'),999);
do $$ begin
  perform pg_temp.assert_true(
    (select raised_cents = 2000 and helper_count = 1 from public.requests where id = pg_temp.fixture('request_alice')),
    'Two contributions from one person count as one helper');
  perform pg_temp.expect_error(
    'insert into public.contributions(request_id,contributor_user_id,amount_cents) values (pg_temp.fixture(''request_alice''),pg_temp.fixture(''bob''),3001)',
    'P0001', 'contribution_exceeds_remaining_goal', 'Overfunding is rejected');
end $$;

reset role;
update public.profiles set account_status = 'blocked' where id = pg_temp.fixture('bob');
set local role authenticated;
do $$ begin
  perform pg_temp.expect_error(
    'insert into public.contributions(request_id,contributor_user_id,amount_cents) values (pg_temp.fixture(''request_alice''),pg_temp.fixture(''bob''),100)',
    'P0001', 'account_not_active', 'Blocked contributor cannot contribute');
end $$;
reset role;
update public.profiles set account_status = 'active' where id = pg_temp.fixture('bob');
update public.profiles set account_status = 'blocked' where id = pg_temp.fixture('alice');
set local role authenticated;
do $$ begin
  perform pg_temp.expect_error(
    'insert into public.contributions(request_id,contributor_user_id,amount_cents) values (pg_temp.fixture(''request_alice''),pg_temp.fixture(''bob''),100)',
    'P0001', 'beneficiary_not_active', 'Blocked beneficiary cannot receive contributions');
  perform pg_temp.assume_user('outsider');
  perform pg_temp.assert_true(
    (select count(*) = 0 from public.requests where id = pg_temp.fixture('request_alice')),
    'Blocked beneficiary disappears from the unrelated-user feed');
end $$;
reset role;
update public.profiles set account_status = 'active' where id = pg_temp.fixture('alice');
set local role authenticated;
do $$ begin perform pg_temp.assume_user('carol'); end $$;
insert into public.contributions(request_id,contributor_user_id,amount_cents)
values (pg_temp.fixture('request_alice'),pg_temp.fixture('carol'),3000);

do $$ begin
  perform pg_temp.assert_true(
    (select status = 'completed' and raised_cents = 5000 and helper_count = 2
      from public.requests where id = pg_temp.fixture('request_alice')),
    'Final contribution completes the request exactly at the goal');
  perform pg_temp.assume_user('bob');
  perform pg_temp.assert_true(
    (select count(*) = 1 from public.requests where id = pg_temp.fixture('request_alice')),
    'Previous contributor retains finalized request details without recursive RLS');
  perform pg_temp.expect_error(
    'insert into public.contributions(request_id,contributor_user_id,amount_cents,idempotency_key) values (pg_temp.fixture(''request_alice''),pg_temp.fixture(''bob''),1001,pg_temp.fixture(''intent_bob''))',
    'P0001', 'request_not_active', 'Retry after completion is rejected before insertion');
  perform pg_temp.assert_true(
    (select count(*) = 1 from public.contributions where idempotency_key = pg_temp.fixture('intent_bob')
      and request_id = pg_temp.fixture('request_alice') and amount_cents = 1001),
    'The original intention remains recoverable after completion');
  perform pg_temp.assume_user('outsider');
  perform pg_temp.assert_true(
    (select count(*) = 0 from public.requests where id = pg_temp.fixture('request_alice')),
    'Unrelated account cannot read finalized request history');
  perform pg_temp.assume_user('alice');
  perform pg_temp.expect_error(
    'insert into public.requests(user_id,category,description,goal_cents) values (pg_temp.fixture(''alice''),''Outro'',''Pedido precoce'',2000)',
    'P0001', 'request_interval_not_elapsed', 'Seven-day cooldown remains after completion');
  perform pg_temp.assert_true(
    (select count(*) = 3 from public.notifications where user_id = pg_temp.fixture('alice') and type = 'contribution_received')
    and (select count(*) = 1 from public.notifications where user_id = pg_temp.fixture('alice') and type = 'request_completed'),
    'Beneficiary receives contribution and completion notifications exactly once');
end $$;

-- Expiration: no waiting or scheduled job is required to exercise the edge.
do $$ begin perform pg_temp.assume_user('expiry_owner'); end $$;
with created as (
  insert into public.requests(user_id,category,description,goal_cents,duration_hours)
  values (pg_temp.fixture('expiry_owner'),'Transporte','Pedido com prazo de 24 horas',2000,24)
  returning id
)
insert into pg_temp.somma_test_fixtures(label,id) select 'request_expiry',id from created;
reset role;
update public.requests
set created_at = clock_timestamp() - interval '8 days',
    starts_at = clock_timestamp() - interval '49 hours',
    expires_at = clock_timestamp() - interval '25 hours'
where id = pg_temp.fixture('request_expiry');
set local role authenticated;
do $$ begin
  perform pg_temp.assume_user('bob');
  perform pg_temp.assert_true(
    (select count(*) = 0 from public.requests where id = pg_temp.fixture('request_expiry')),
    'Expired active row is hidden from the unrelated-user feed before cleanup');
  perform pg_temp.expect_error(
    'insert into public.contributions(request_id,contributor_user_id,amount_cents) values (pg_temp.fixture(''request_expiry''),pg_temp.fixture(''bob''),100)',
    'P0001', 'request_expired', 'Expired request rejects contributions based on the clock');
  perform pg_temp.assume_user('expiry_owner');
end $$;
insert into public.requests(user_id,category,description,goal_cents,duration_hours)
values (pg_temp.fixture('expiry_owner'),'Trabalho','Novo pedido após prazo e intervalo',2000,24);
do $$ begin
  perform pg_temp.assert_true(
    (select status = 'expired' from public.requests where id = pg_temp.fixture('request_expiry'))
    and (select count(*) = 1 from public.requests where user_id = pg_temp.fixture('expiry_owner') and status = 'active')
    and (select bool_and(expires_at = starts_at + interval '24 hours') from public.requests
      where user_id = pg_temp.fixture('expiry_owner') and status = 'active'),
    'New creation lazily expires the old request and creates one valid 24-hour request');
end $$;

-- Monthly caps must be enforced both on creation and at contribution time.
reset role;
update public.profiles set period_limit_cents = 2500 where id = pg_temp.fixture('month_owner');
set local role authenticated;
do $$ begin perform pg_temp.assume_user('month_owner'); end $$;
with created as (
  insert into public.requests(user_id,category,description,goal_cents)
  values (pg_temp.fixture('month_owner'),'Conta essencial','Pedido para testar período',2000)
  returning id
)
insert into pg_temp.somma_test_fixtures(label,id) select 'request_month',id from created;
do $$ begin perform pg_temp.assume_user('bob'); end $$;
insert into public.contributions(request_id,contributor_user_id,amount_cents)
values (pg_temp.fixture('request_month'),pg_temp.fixture('bob'),2000);
reset role;
update public.requests set created_at = clock_timestamp() - interval '8 days'
where id = pg_temp.fixture('request_month');
update public.contributions
set created_at = date_trunc('month', clock_timestamp() at time zone 'UTC') at time zone 'UTC'
where request_id = pg_temp.fixture('request_month');
set local time zone 'Pacific/Honolulu';
set local role authenticated;
do $$ begin
  perform pg_temp.assume_user('month_owner');
  perform pg_temp.expect_error(
    'insert into public.requests(user_id,category,description,goal_cents) values (pg_temp.fixture(''month_owner''),''Outro'',''Excede período'',2000)',
    'P0001', 'period_limit_exceeded', 'UTC month start is included even in another session timezone');
end $$;
reset role;
update public.profiles set period_limit_cents = null where id = pg_temp.fixture('month_owner');
set local role authenticated;
do $$ begin
  perform pg_temp.expect_error(
    'insert into public.requests(user_id,category,description,goal_cents) values (pg_temp.fixture(''month_owner''),''Outro'',''Sem período configurado'',2000)',
    'P0001', 'period_limit_not_configured', 'Missing monthly limit does not mean unlimited creation');
end $$;
reset role;
update public.profiles set period_limit_cents = 2500 where id = pg_temp.fixture('month_owner');
update public.contributions
set created_at = (date_trunc('month', clock_timestamp() at time zone 'UTC') at time zone 'UTC') - interval '1 second'
where request_id = pg_temp.fixture('request_month');
set local role authenticated;
insert into public.requests(user_id,category,description,goal_cents)
values (pg_temp.fixture('month_owner'),'Medicamentos','Contribuição anterior pertence a outro mês',2000);
do $$ begin
  perform pg_temp.assert_true(
    (select count(*) = 1 from public.requests where user_id = pg_temp.fixture('month_owner') and status = 'active'),
    'One second before the UTC month start is excluded from the new period');
end $$;
reset role;
set local time zone 'UTC';

set local role authenticated;
do $$ begin perform pg_temp.assume_user('cap_owner'); end $$;
with created as (
  insert into public.requests(user_id,category,description,goal_cents)
  values (pg_temp.fixture('cap_owner'),'Emergência','Mudança administrativa de limite',2000)
  returning id
)
insert into pg_temp.somma_test_fixtures(label,id) select 'request_cap',id from created;
reset role;
update public.profiles set period_limit_cents = 500 where id = pg_temp.fixture('cap_owner');
set local role authenticated;
do $$ begin
  perform pg_temp.assume_user('bob');
  perform pg_temp.expect_error(
    'insert into public.contributions(request_id,contributor_user_id,amount_cents) values (pg_temp.fixture(''request_cap''),pg_temp.fixture(''bob''),501)',
    'P0001', 'recipient_period_limit_exceeded', 'Contribution rechecks a beneficiary monthly limit changed after publication');
end $$;
insert into public.contributions(request_id,contributor_user_id,amount_cents)
values (pg_temp.fixture('request_cap'),pg_temp.fixture('bob'),500);
do $$ begin
  perform pg_temp.expect_error(
    'insert into public.contributions(request_id,contributor_user_id,amount_cents) values (pg_temp.fixture(''request_cap''),pg_temp.fixture(''bob''),1)',
    'P0001', 'recipient_period_limit_exceeded', 'Contribution cannot exceed the remaining monthly allowance by one cent');
end $$;
reset role;
update public.profiles set period_limit_cents = null where id = pg_temp.fixture('cap_owner');
set local role authenticated;
do $$ begin
  perform pg_temp.expect_error(
    'insert into public.contributions(request_id,contributor_user_id,amount_cents) values (pg_temp.fixture(''request_cap''),pg_temp.fixture(''bob''),1)',
    'P0001', 'period_limit_not_configured', 'Missing beneficiary period limit also blocks contribution');
  perform pg_temp.expect_error(
    'insert into public.reports(reporter_user_id,target_type,target_id,reason) values (pg_temp.fixture(''bob''),''request'',gen_random_uuid(),''Alvo inexistente'')',
    'P0001', 'report_target_not_found', 'Report target must exist and be visible to its reporter');
end $$;
insert into public.reports(reporter_user_id,target_type,target_id,reason)
values (pg_temp.fixture('bob'),'request',pg_temp.fixture('request_alice'),'Revisar pedido de teste');
do $$ begin
  perform pg_temp.assert_true(
    (select count(*) = 1 from public.reports where reporter_user_id = pg_temp.fixture('bob')),
    'Participant can report its completed request');
  perform pg_temp.assume_user('outsider');
  perform pg_temp.assert_true((select count(*) = 0 from public.reports),
    'Reports are isolated by reporter');
  perform pg_temp.assert_true((select count(*) = 0 from public.notifications),
    'Notifications are isolated by recipient');
  perform pg_temp.assert_true((select count(*) = 0 from public.contributions),
    'Unrelated account cannot read other contribution history');
end $$;

reset role;
do $$ begin
  perform pg_temp.assert_true(
    (select count(*) = 3 from public.audit_log
      where event_type = 'contribution.created'
      and metadata->>'request_id' = pg_temp.fixture('request_alice')::text)
    and (select count(*) = 1 from public.audit_log
      where event_type = 'request.created' and entity_id = pg_temp.fixture('request_alice'))
    and (select count(*) = 1 from public.audit_log
      where event_type = 'request.completed' and entity_id = pg_temp.fixture('request_alice'))
    and (select count(*) = 1 from public.audit_log
      where event_type = 'request.expired' and entity_id = pg_temp.fixture('request_expiry')),
    'Audit records publication, successful contributions, completion and lazy expiration without duplicates');
  perform pg_temp.assert_true(
    not exists (select 1 from auth.users
      where id in (select id from pg_temp.somma_test_fixtures)
      and (email is not null or phone is not null or encrypted_password is not null)),
    'Auth fixtures have no contact address or password');
end $$;

select count(*) as passed_checks, bool_and(passed) as all_passed,
  jsonb_agg(name order by name) as checks,
  'Sequential checks only; all fixture data is rolled back by the next statement.' as scope
from pg_temp.somma_test_results;

rollback;
