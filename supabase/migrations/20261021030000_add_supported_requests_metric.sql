-- Count distinct requests the signed-in user supported without joining
-- against requests hidden by RLS after they transition out of active status.
CREATE OR REPLACE FUNCTION public.somma_user_summary()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'supported_requests', (
      SELECT count(DISTINCT c.request_id)
      FROM public.contributions c
      WHERE c.contributor_user_id = (SELECT auth.uid())
        AND c.status = 'simulated_confirmed'
    ),
    'helped', (
      SELECT count(DISTINCT r.user_id)
      FROM public.contributions c
      JOIN public.requests r ON r.id = c.request_id
      WHERE c.contributor_user_id = (SELECT auth.uid())
        AND c.status = 'simulated_confirmed'
    ),
    'contributed_cents', (
      SELECT coalesce(sum(c.amount_cents), 0)
      FROM public.contributions c
      WHERE c.contributor_user_id = (SELECT auth.uid())
        AND c.status = 'simulated_confirmed'
    ),
    'received_count', (
      SELECT count(*)
      FROM public.contributions c
      JOIN public.requests r ON r.id = c.request_id
      WHERE r.user_id = (SELECT auth.uid())
        AND c.status = 'simulated_confirmed'
    ),
    'received_month_cents', (
      SELECT coalesce(sum(c.amount_cents), 0)
      FROM public.contributions c
      JOIN public.requests r ON r.id = c.request_id
      WHERE r.user_id = (SELECT auth.uid())
        AND c.status = 'simulated_confirmed'
        AND c.created_at >= (
          date_trunc('month', statement_timestamp() AT TIME ZONE 'UTC')
          AT TIME ZONE 'UTC'
        )
    ),
    'next_request_at', (
      SELECT max(r.created_at) + interval '7 days'
      FROM public.requests r
      WHERE r.user_id = (SELECT auth.uid())
    )
  )
  WHERE (SELECT auth.uid()) IS NOT NULL
$$;

