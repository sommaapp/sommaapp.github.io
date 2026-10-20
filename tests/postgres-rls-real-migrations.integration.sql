\set ON_ERROR_STOP on
BEGIN;

-- This test runs only after all versioned migrations have been applied to a
-- disposable PostgreSQL database with the minimal auth.users/auth.uid shim.
-- All identities and content below are synthetic; ROLLBACK removes fixtures.
INSERT INTO auth.users (id, raw_user_meta_data) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '{"full_name":"Synthetic Alpha"}'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '{"full_name":"Synthetic Bravo"}'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '{"full_name":"Synthetic Charlie"}'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', '{"full_name":"Synthetic Delta"}');

UPDATE public.profiles
SET account_status = 'suspended'
WHERE id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

-- A and B create their own requests through the actual grants, RLS policies,
-- and production trigger functions loaded from the versioned migrations.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
INSERT INTO public.requests (user_id, category, description, goal_cents, duration_hours)
VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Outro','Synthetic request Alpha',5000,48);

SELECT set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',false);
INSERT INTO public.requests (user_id, category, description, goal_cents, duration_hours)
VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Outro','Synthetic request Bravo',5000,48);

-- A and B contribute to each other's real requests through the actual insert
-- grant and production validation/apply triggers.
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
INSERT INTO public.contributions (request_id, contributor_user_id, amount_cents)
SELECT id, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 1000
FROM public.requests WHERE user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

SELECT set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',false);
INSERT INTO public.contributions (request_id, contributor_user_id, amount_cents)
SELECT id, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 1000
FROM public.requests WHERE user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

RESET ROLE;

-- Seed edge cases as database owner. Disable only the request validation
-- trigger so the suspended/expired fixtures can exist without bypassing RLS
-- checks performed later as authenticated users.
ALTER TABLE public.requests DISABLE TRIGGER requests_validate_insert;
INSERT INTO public.requests
  (id, user_id, category, description, goal_cents, raised_cents, status, starts_at, expires_at, duration_hours)
VALUES
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
   'cccccccc-cccc-4ccc-8ccc-cccccccccccc','Outro','Synthetic suspended owner request',
   5000,0,'active',now(),now()+interval '1 day',24),
  ('ffffffff-ffff-4fff-8fff-ffffffffffff',
   'dddddddd-dddd-4ddd-8ddd-dddddddddddd','Outro','Synthetic expired request',
   5000,0,'active',now()-interval '2 days',now()-interval '1 day',24);
ALTER TABLE public.requests ENABLE TRIGGER requests_validate_insert;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
DO $test$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM public.profiles;
  IF n <> 1 THEN RAISE EXCEPTION 'Alpha profile isolation failed: %', n; END IF;

  SELECT count(*) INTO n FROM public.requests;
  IF n <> 2 THEN RAISE EXCEPTION 'Alpha should see own and Bravo active requests only: %', n; END IF;

  SELECT count(*) INTO n FROM public.contributions;
  IF n <> 2 THEN RAISE EXCEPTION 'Alpha should see own and own-request contributions only: %', n; END IF;

  SELECT count(*) INTO n FROM public.requests
  WHERE id IN ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','ffffffff-ffff-4fff-8fff-ffffffffffff');
  IF n <> 0 THEN RAISE EXCEPTION 'Alpha can see suspended-owner or expired request'; END IF;

  SELECT count(*) INTO n FROM public.notifications WHERE user_id <> auth.uid();
  IF n <> 0 THEN RAISE EXCEPTION 'Alpha can read another user notifications'; END IF;

  -- Negative authorization checks: the role must not have table-level
  -- write grants for requests or notifications.
  IF has_table_privilege('authenticated', 'public.requests', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.requests', 'DELETE') THEN
    RAISE EXCEPTION 'authenticated has unexpected request write privileges';
  END IF;
  IF has_table_privilege('authenticated', 'public.notifications', 'UPDATE') THEN
    RAISE EXCEPTION 'authenticated has unexpected notification update privilege';
  END IF;
END $test$ LANGUAGE plpgsql;

SELECT set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',false);
DO $test$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM public.profiles;
  IF n <> 1 THEN RAISE EXCEPTION 'Bravo profile isolation failed: %', n; END IF;

  SELECT count(*) INTO n FROM public.requests;
  IF n <> 2 THEN RAISE EXCEPTION 'Bravo should see own and Alpha active requests only: %', n; END IF;

  SELECT count(*) INTO n FROM public.contributions;
  IF n <> 2 THEN RAISE EXCEPTION 'Bravo should see own and own-request contributions only: %', n; END IF;

  SELECT count(*) INTO n FROM public.requests
  WHERE id IN ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','ffffffff-ffff-4fff-8fff-ffffffffffff');
  IF n <> 0 THEN RAISE EXCEPTION 'Bravo can see suspended-owner or expired request'; END IF;

  SELECT count(*) INTO n FROM public.notifications WHERE user_id <> auth.uid();
  IF n <> 0 THEN RAISE EXCEPTION 'Bravo can read another user notifications'; END IF;

  -- Negative authorization checks: the role must not have table-level
  -- write grants for requests or notifications.
  IF has_table_privilege('authenticated', 'public.requests', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.requests', 'DELETE') THEN
    RAISE EXCEPTION 'authenticated has unexpected request write privileges';
  END IF;
  IF has_table_privilege('authenticated', 'public.notifications', 'UPDATE') THEN
    RAISE EXCEPTION 'authenticated has unexpected notification update privilege';
  END IF;
END $test$ LANGUAGE plpgsql;

-- Negative business-rule regressions: identity spoofing, self-contribution,
-- and duplicate idempotency keys must be rejected by the migrated triggers
-- and constraints. Savepoint rollback keeps the fixture counts deterministic.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
SAVEPOINT contribution_negative_tests;

DO $test$
DECLARE
  v_request uuid;
  v_failed boolean := false;
BEGIN
  SELECT id INTO v_request FROM public.requests
  WHERE user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  BEGIN
    INSERT INTO public.contributions (request_id, contributor_user_id, amount_cents)
    VALUES (v_request, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 100);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'contributor_mismatch' THEN RAISE; END IF;
    v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'spoofed contributor identity was accepted'; END IF;

  v_failed := false;
  SELECT id INTO v_request FROM public.requests
  WHERE user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  BEGIN
    INSERT INTO public.contributions (request_id, contributor_user_id, amount_cents)
    VALUES (v_request, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 100);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'self_contribution_not_allowed' THEN RAISE; END IF;
    v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'self-contribution was accepted'; END IF;

  -- Non-positive amounts must be rejected by the production validation trigger.
  v_failed := false;
  SELECT id INTO v_request FROM public.requests
  WHERE user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  BEGIN
    INSERT INTO public.contributions (request_id, contributor_user_id, amount_cents)
    VALUES (v_request, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 0);
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'invalid_contribution_amount' THEN RAISE; END IF;
    v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'zero-value contribution was accepted'; END IF;

  -- Alpha has already contributed 1000 to Bravo's 5000 goal, so 4001
  -- exceeds the remaining 4000 and must be rejected.
  v_failed := false;
  BEGIN
    INSERT INTO public.contributions (request_id, contributor_user_id, amount_cents)
    VALUES (v_request, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 4001);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'contribution_exceeds_remaining_goal' THEN RAISE; END IF;
    v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'contribution above remaining goal was accepted'; END IF;

  -- An active request owned by a suspended account must not accept support.
  v_failed := false;
  SELECT id INTO v_request FROM public.requests
  WHERE user_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  BEGIN
    INSERT INTO public.contributions (request_id, contributor_user_id, amount_cents)
    VALUES (v_request, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 100);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'beneficiary_not_active' THEN RAISE; END IF;
    v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'contribution to suspended beneficiary was accepted'; END IF;

  -- An expired request must reject new contributions even if its status field
  -- still says active (the expiration timestamp is authoritative).
  v_failed := false;
  SELECT id INTO v_request FROM public.requests
  WHERE user_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  BEGIN
    INSERT INTO public.contributions (request_id, contributor_user_id, amount_cents)
    VALUES (v_request, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 100);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'request_expired' THEN RAISE; END IF;
    v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'contribution to expired request was accepted'; END IF;
END $test$ LANGUAGE plpgsql;

-- Reuse a synthetic key to prove the unique idempotency constraint rejects
-- duplicate submissions from the same contributor.
INSERT INTO public.contributions
  (request_id, contributor_user_id, amount_cents, idempotency_key)
SELECT id, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 100,
       '11111111-1111-4111-8111-111111111111'
FROM public.requests
WHERE user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

DO $test$
DECLARE
  v_request uuid;
  v_failed boolean := false;
BEGIN
  SELECT id INTO v_request FROM public.requests
  WHERE user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  BEGIN
    INSERT INTO public.contributions
      (request_id, contributor_user_id, amount_cents, idempotency_key)
    VALUES (v_request, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 100,
            '11111111-1111-4111-8111-111111111111');
  EXCEPTION WHEN unique_violation THEN
    v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'duplicate idempotency key was accepted'; END IF;
END $test$ LANGUAGE plpgsql;

ROLLBACK TO SAVEPOINT contribution_negative_tests;
RESET ROLE;
ROLLBACK;
