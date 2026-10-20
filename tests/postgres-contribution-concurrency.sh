#!/usr/bin/env bash
set -euo pipefail

# Runs only inside the disposable PostgreSQL container after migrations.
# All fixtures and identities are synthetic; no production connection is used.
DB_CONTAINER="somma-migrations-pg"
PSQL=(docker exec -i "$DB_CONTAINER" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres)
OWNER="11111111-1111-4111-8111-111111111111"
CONTRIB_A="22222222-2222-4222-8222-222222222222"
CONTRIB_B="33333333-3333-4333-8333-333333333333"
REQ_A="44444444-4444-4444-8444-444444444444"
REQ_B="55555555-5555-4555-8555-555555555555"

cleanup() {
  "${PSQL[@]}" <<SQL >/dev/null 2>&1 || true
DROP TRIGGER IF EXISTS zz_test_pause_contribution ON public.contributions;
DROP FUNCTION IF EXISTS private.test_pause_contribution();
DELETE FROM auth.users WHERE id IN ('$OWNER','$CONTRIB_A','$CONTRIB_B');
SQL
}
trap cleanup EXIT

"${PSQL[@]}" <<SQL
INSERT INTO auth.users (id, raw_user_meta_data) VALUES
 ('$OWNER','{"full_name":"Synthetic Owner"}'),
 ('$CONTRIB_A','{"full_name":"Synthetic Contributor A"}'),
 ('$CONTRIB_B','{"full_name":"Synthetic Contributor B"}');

UPDATE public.profiles
SET period_limit_cents = 10000, request_limit_cents = 10000
WHERE id = '$OWNER';

-- Seed two separate active requests for one beneficiary, bypassing only the
-- request-insert validator because this test is about contribution concurrency.
ALTER TABLE public.requests DISABLE TRIGGER requests_validate_insert;
INSERT INTO public.requests
 (id,user_id,category,description,goal_cents,raised_cents,status,starts_at,expires_at,duration_hours)
VALUES
 ('$REQ_A','$OWNER','Outro','Synthetic concurrency request A',10000,0,'active',now(),now()+interval '1 day',24),
 ('$REQ_B','$OWNER','Outro','Synthetic concurrency request B',10000,0,'active',now(),now()+interval '1 day',24);
ALTER TABLE public.requests ENABLE TRIGGER requests_validate_insert;

-- Deterministically hold each insert after production validation has run.
-- With FOR SHARE both sessions pass the monthly SUM before either commits.
-- With the fix (FOR UPDATE), session B waits, then observes A's committed row.
CREATE OR REPLACE FUNCTION private.test_pause_contribution()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
BEGIN
  IF NEW.request_id IN ('$REQ_A'::uuid, '$REQ_B'::uuid) THEN
    PERFORM pg_sleep(2);
  END IF;
  RETURN NEW;
END
$fn$;
CREATE TRIGGER zz_test_pause_contribution
BEFORE INSERT ON public.contributions
FOR EACH ROW EXECUTE FUNCTION private.test_pause_contribution();
SQL

# Start both real trigger paths at nearly the same time. One insert must be
# rejected by recipient_period_limit_exceeded; both must never commit.
set +e
docker exec "$DB_CONTAINER" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres \
  -c "SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','$CONTRIB_A',false); INSERT INTO public.contributions(request_id,contributor_user_id,amount_cents,idempotency_key) VALUES ('$REQ_A','$CONTRIB_A',6000,'66666666-6666-4666-8666-666666666666');" > /tmp/somma-concurrency-a.log 2>&1 &
PID_A=$!
docker exec "$DB_CONTAINER" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres \
  -c "SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','$CONTRIB_B',false); INSERT INTO public.contributions(request_id,contributor_user_id,amount_cents,idempotency_key) VALUES ('$REQ_B','$CONTRIB_B',6000,'77777777-7777-4777-8777-777777777777');" > /tmp/somma-concurrency-b.log 2>&1 &
PID_B=$!
wait "$PID_A"; STATUS_A=$?
wait "$PID_B"; STATUS_B=$?
set -e

COUNT=$(docker exec "$DB_CONTAINER" psql -X -At -U postgres -d postgres -c "SELECT count(*) FROM public.contributions c JOIN public.requests r ON r.id=c.request_id WHERE r.user_id='$OWNER' AND c.status='simulated_confirmed' AND c.request_id IN ('$REQ_A','$REQ_B');")
TOTAL=$(docker exec "$DB_CONTAINER" psql -X -At -U postgres -d postgres -c "SELECT coalesce(sum(c.amount_cents),0) FROM public.contributions c JOIN public.requests r ON r.id=c.request_id WHERE r.user_id='$OWNER' AND c.status='simulated_confirmed' AND c.request_id IN ('$REQ_A','$REQ_B');")

if [[ "$COUNT" != "1" || "$TOTAL" != "6000" ]]; then
  echo "FAIL: concurrent contributions breached monthly limit: accepted_count=$COUNT total_cents=$TOTAL"
  cat /tmp/somma-concurrency-a.log /tmp/somma-concurrency-b.log
  exit 1
fi
if [[ "$STATUS_A" -eq 0 && "$STATUS_B" -eq 0 ]]; then
  echo "FAIL: both concurrent contributions were accepted despite the monthly cap"
  exit 1
fi
if ! grep -q "recipient_period_limit_exceeded" /tmp/somma-concurrency-a.log /tmp/somma-concurrency-b.log; then
  echo "FAIL: the rejected transaction did not fail for the expected monthly-limit rule"
  cat /tmp/somma-concurrency-a.log /tmp/somma-concurrency-b.log
  exit 1
fi

echo "PASS: concurrent inserts serialized; exactly one 6000-cent contribution committed under a 10000-cent monthly cap."
