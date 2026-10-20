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

  -- Negative authorization checks: changing or deleting Bravo's request
  -- must not affect any row when Alpha is authenticated.
  UPDATE public.requests SET description = 'Unauthorized edit attempt'
  WHERE user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'Alpha updated Bravo request'; END IF;

  DELETE FROM public.requests
  WHERE user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'Alpha deleted Bravo request'; END IF;

  UPDATE public.notifications SET read_at = now()
  WHERE user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'Alpha updated Bravo notification'; END IF;
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

  UPDATE public.requests SET description = 'Unauthorized edit attempt'
  WHERE user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'Bravo updated Alpha request'; END IF;

  DELETE FROM public.requests
  WHERE user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'Bravo deleted Alpha request'; END IF;

  UPDATE public.notifications SET read_at = now()
  WHERE user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'Bravo updated Alpha notification'; END IF;
END $test$ LANGUAGE plpgsql;

RESET ROLE;
ROLLBACK;
