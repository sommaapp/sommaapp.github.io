-- Keep the idempotency token out of authenticated row reads while allowing
-- a contributor to recover only their own original result after an ambiguous
-- network response. The function deliberately returns an explicit allowlist.
CREATE OR REPLACE FUNCTION public.somma_find_own_contribution(p_idempotency_key uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'id', c.id,
    'request_id', c.request_id,
    'amount_cents', c.amount_cents,
    'platform_fee_cents', c.platform_fee_cents,
    'status', c.status,
    'created_at', c.created_at
  )
  FROM public.contributions AS c
  WHERE (SELECT auth.uid()) IS NOT NULL
    AND c.contributor_user_id = (SELECT auth.uid())
    AND c.idempotency_key = p_idempotency_key
  LIMIT 1
$$;

-- SECURITY DEFINER is necessary because the client is intentionally denied
-- SELECT on idempotency_key. The predicate above binds every result to auth.uid().
REVOKE ALL ON FUNCTION public.somma_find_own_contribution(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.somma_find_own_contribution(uuid)
  TO authenticated;

-- Replace the broad table-level SELECT with an explicit column allowlist.
-- INSERT(idempotency_key) remains granted so a client can submit its UUID.
REVOKE SELECT ON TABLE public.contributions FROM authenticated;
REVOKE SELECT (idempotency_key) ON TABLE public.contributions FROM authenticated;
GRANT SELECT (
  id, request_id, contributor_user_id, amount_cents,
  platform_fee_cents, status, created_at
) ON TABLE public.contributions TO authenticated;
