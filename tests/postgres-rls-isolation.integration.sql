\set ON_ERROR_STOP on
BEGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth TO authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
CREATE SCHEMA private;
CREATE TABLE public.test_profiles (id uuid PRIMARY KEY, account_status text NOT NULL);
CREATE TABLE public.test_requests (id uuid PRIMARY KEY, user_id uuid NOT NULL, status text NOT NULL, expires_at timestamptz NOT NULL);
CREATE TABLE public.test_contributions (id uuid PRIMARY KEY, request_id uuid NOT NULL REFERENCES public.test_requests(id), contributor_user_id uuid NOT NULL);
CREATE TABLE public.test_notifications (id uuid PRIMARY KEY, user_id uuid NOT NULL, read_at timestamptz);
ALTER TABLE public.test_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.test_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.test_contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.test_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY profiles_read_own ON public.test_profiles FOR SELECT TO authenticated USING ((SELECT auth.uid()) = id);
CREATE FUNCTION private.test_can_read_request(p_request_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $
  SELECT (SELECT auth.uid()) IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.test_requests r
    JOIN public.test_profiles owner_profile ON owner_profile.id = r.user_id
    WHERE r.id = p_request_id AND (
      r.user_id = (SELECT auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.test_contributions c
        WHERE c.request_id = r.id AND c.contributor_user_id = (SELECT auth.uid())
      )
      OR (
        r.status = 'active'
        AND r.expires_at > statement_timestamp()
        AND owner_profile.account_status = 'active'
      )
    )
  );
$;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.test_can_read_request(uuid) TO authenticated;
CREATE POLICY requests_read ON public.test_requests FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id OR private.test_can_read_request(id));
CREATE POLICY contributions_read_related ON public.test_contributions FOR SELECT TO authenticated USING ((SELECT auth.uid()) = contributor_user_id OR EXISTS (SELECT 1 FROM public.test_requests r WHERE r.id = test_contributions.request_id AND r.user_id = (SELECT auth.uid())));
CREATE POLICY notifications_read_own ON public.test_notifications FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY notifications_update_own ON public.test_notifications FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
GRANT SELECT ON public.test_profiles, public.test_requests, public.test_contributions, public.test_notifications TO authenticated;
GRANT UPDATE (read_at) ON public.test_notifications TO authenticated;
INSERT INTO public.test_profiles VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','active'), ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','active'), ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','active'), ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','suspended');
INSERT INTO public.test_requests VALUES ('11111111-aaaa-4aaa-8aaa-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','active',now()+interval '1 day'), ('22222222-bbbb-4bbb-8bbb-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','active',now()+interval '1 day'), ('33333333-cccc-4ccc-8ccc-333333333333','cccccccc-cccc-4ccc-8ccc-cccccccccccc','active',now()-interval '1 day'), ('44444444-dddd-4ddd-8ddd-444444444444','dddddddd-dddd-4ddd-8ddd-dddddddddddd','active',now()+interval '1 day');
INSERT INTO public.test_contributions VALUES ('33333333-aaaa-4aaa-8aaa-333333333333','22222222-bbbb-4bbb-8bbb-222222222222','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), ('44444444-bbbb-4bbb-8bbb-444444444444','11111111-aaaa-4aaa-8aaa-111111111111','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), ('55555555-bbbb-4bbb-8bbb-555555555555','22222222-bbbb-4bbb-8bbb-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
INSERT INTO public.test_notifications VALUES ('66666666-aaaa-4aaa-8aaa-666666666666','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',NULL), ('77777777-bbbb-4bbb-8bbb-777777777777','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',NULL);
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
DO $$ DECLARE n integer; BEGIN
 SELECT count(*) INTO n FROM public.test_profiles; IF n<>1 THEN RAISE EXCEPTION 'A profile isolation: %',n; END IF;
 SELECT count(*) INTO n FROM public.test_requests; IF n<>3 THEN RAISE EXCEPTION 'A request visibility (own, public active, expired hidden): %',n; END IF;
 SELECT count(*) INTO n FROM public.test_contributions; IF n<>2 THEN RAISE EXCEPTION 'A related contributions: %',n; END IF;
 SELECT count(*) INTO n FROM public.test_notifications; IF n<>1 THEN RAISE EXCEPTION 'A notifications: %',n; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',false);
DO $$ DECLARE n integer; BEGIN
 SELECT count(*) INTO n FROM public.test_profiles; IF n<>1 THEN RAISE EXCEPTION 'B profile isolation: %',n; END IF;
 SELECT count(*) INTO n FROM public.test_requests; IF n<>3 THEN RAISE EXCEPTION 'B request visibility (own, public active, expired hidden): %',n; END IF;
 SELECT count(*) INTO n FROM public.test_contributions; IF n<>3 THEN RAISE EXCEPTION 'B related contributions: %',n; END IF;
 SELECT count(*) INTO n FROM public.test_requests WHERE id='44444444-dddd-4ddd-8ddd-dddddddddddd'; IF n<>0 THEN RAISE EXCEPTION 'Suspended owner request should not be public'; END IF;
 SELECT count(*) INTO n FROM public.test_notifications; IF n<>1 THEN RAISE EXCEPTION 'B notifications: %',n; END IF;
END $$;
UPDATE public.test_notifications SET read_at=now() WHERE id='77777777-bbbb-4bbb-8bbb-777777777777';
DO $$ DECLARE n integer; BEGIN SELECT count(*) INTO n FROM public.test_notifications WHERE id='77777777-bbbb-4bbb-8bbb-777777777777' AND read_at IS NOT NULL; IF n<>1 THEN RAISE EXCEPTION 'B own notification update failed'; END IF; END $$;
RESET ROLE;
ROLLBACK;
