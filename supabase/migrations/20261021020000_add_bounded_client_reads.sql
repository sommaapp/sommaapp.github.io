-- Bounded, caller-scoped reads for the client. All functions run as the
-- authenticated caller so existing row-level security remains authoritative.
CREATE OR REPLACE FUNCTION public.somma_user_summary()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
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

CREATE OR REPLACE FUNCTION public.somma_feed_summary()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH active AS (
    SELECT r.*
    FROM public.requests r
    WHERE r.status = 'active'
      AND (r.expires_at IS NULL OR r.expires_at > statement_timestamp())
  ),
  closest AS (
    SELECT to_jsonb(r) AS request
    FROM active r
    ORDER BY (r.goal_cents - r.raised_cents), r.created_at DESC, r.id DESC
    LIMIT 1
  )
  SELECT jsonb_build_object(
    'active_count', (SELECT count(*) FROM active),
    'completed_count', (SELECT count(*) FROM public.requests WHERE status = 'completed'),
    'closest', (SELECT request FROM closest)
  )
$$;

CREATE OR REPLACE FUNCTION public.somma_history_page(
  p_kind text DEFAULT 'all',
  p_before_at timestamptz DEFAULT NULL,
  p_before_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 25
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH event_rows AS (
    SELECT
      'request'::text AS kind,
      r.created_at AS event_at,
      r.id AS event_id,
      jsonb_build_object(
        'id', r.id, 'user_id', r.user_id, 'category', r.category,
        'description', r.description, 'goal_cents', r.goal_cents,
        'raised_cents', r.raised_cents, 'status', r.status,
        'starts_at', r.starts_at, 'expires_at', r.expires_at,
        'created_at', r.created_at, 'helper_count', r.helper_count,
        'duration_hours', r.duration_hours
      ) AS request,
      NULL::jsonb AS contribution,
      NULL::uuid AS person_id
    FROM public.requests r
    WHERE r.user_id = (SELECT auth.uid())
      AND p_kind IN ('all', 'request')
    UNION ALL
    SELECT
      CASE WHEN c.contributor_user_id = (SELECT auth.uid()) THEN 'helped' ELSE 'received' END,
      c.created_at,
      c.id,
      jsonb_build_object(
        'id', r.id, 'user_id', r.user_id, 'category', r.category,
        'description', r.description, 'goal_cents', r.goal_cents,
        'raised_cents', r.raised_cents, 'status', r.status,
        'starts_at', r.starts_at, 'expires_at', r.expires_at,
        'created_at', r.created_at, 'helper_count', r.helper_count,
        'duration_hours', r.duration_hours
      ),
      jsonb_build_object(
        'id', c.id, 'request_id', c.request_id,
        'contributor_user_id', c.contributor_user_id,
        'amount_cents', c.amount_cents, 'platform_fee_cents', c.platform_fee_cents,
        'status', c.status, 'created_at', c.created_at
      ),
      CASE WHEN c.contributor_user_id = (SELECT auth.uid()) THEN r.user_id ELSE c.contributor_user_id END
    FROM public.contributions c
    JOIN public.requests r ON r.id = c.request_id
    WHERE c.status = 'simulated_confirmed'
      AND (
        (c.contributor_user_id = (SELECT auth.uid()) AND p_kind IN ('all', 'helped'))
        OR (r.user_id = (SELECT auth.uid()) AND p_kind IN ('all', 'received'))
      )
  ),
  bounded AS (
    SELECT e.*
    FROM event_rows e
    WHERE (p_before_at IS NULL OR (e.event_at, e.event_id) < (p_before_at, p_before_id))
    ORDER BY e.event_at DESC, e.event_id DESC
    LIMIT least(greatest(coalesce(p_limit, 25), 1), 50) + 1
  ),
  page AS (
    SELECT * FROM bounded
    ORDER BY event_at DESC, event_id DESC
    LIMIT least(greatest(coalesce(p_limit, 25), 1), 50)
  )
  SELECT jsonb_build_object(
    'items', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'kind', p.kind, 'time', p.event_at, 'event_id', p.event_id,
        'request', p.request, 'contribution', p.contribution,
        'person_id', p.person_id
      ) ORDER BY p.event_at DESC, p.event_id DESC)
      FROM page p
    ), '[]'::jsonb),
    'has_more', (SELECT count(*) > least(greatest(coalesce(p_limit, 25), 1), 50) FROM bounded),
    'next_at', (SELECT p.event_at FROM page p ORDER BY p.event_at ASC, p.event_id ASC LIMIT 1),
    'next_id', (SELECT p.event_id FROM page p ORDER BY p.event_at ASC, p.event_id ASC LIMIT 1)
  )
  WHERE (SELECT auth.uid()) IS NOT NULL
    AND p_kind IN ('all', 'request', 'helped', 'received')
$$;

REVOKE ALL ON FUNCTION public.somma_user_summary() FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.somma_feed_summary() FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.somma_history_page(text, timestamptz, uuid, integer) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.somma_user_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.somma_feed_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.somma_history_page(text, timestamptz, uuid, integer) TO authenticated;
