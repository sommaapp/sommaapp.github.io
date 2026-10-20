-- Run only against a disposable PostgreSQL database with psql:
--   psql "$SOMMA_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/postgres-sensitive-text.integration.sql
-- The script creates minimal synthetic tables, applies the PR migration, tests direct SQL
-- writes, and rolls back all schema/data changes. Never point this at production.
\set ON_ERROR_STOP on
BEGIN;

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
END
$roles$;

CREATE SCHEMA IF NOT EXISTS private;
CREATE SCHEMA IF NOT EXISTS public;
CREATE TABLE public.requests (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  description text
);
CREATE TABLE public.reports (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reason text
);

-- psql resolves this path relative to this test file.
\ir ../supabase/migrations/20261020120000_reject_sensitive_text.sql

DO $tests$
DECLARE
  v_count integer := 0;
  v_text text;
  v_table text;
  v_column text;
BEGIN
  -- Ordinary prose, currency and dates should be accepted by both triggers.
  INSERT INTO public.requests(description) VALUES
    ('Preciso de ajuda para transporte até o trabalho.'),
    ('Meta de R$ 1.200,00 para transporte'),
    ('Preciso até 20/10/2026'),
    ('Protocolo interno 202610201200');
  INSERT INTO public.reports(reason) VALUES
    ('Relato de teste sem dados pessoais.'),
    ('O valor era R$ 1.200,00 em 20/10/2026');

  -- Each synthetic identifier must be rejected in requests.description and reports.reason.
  FOREACH v_table IN ARRAY ARRAY['requests', 'reports'] LOOP
    v_column := CASE WHEN v_table = 'requests' THEN 'description' ELSE 'reason' END;
    FOREACH v_text IN ARRAY ARRAY[
      'Contato teste@example.invalid',
      'Documento 123.456.789-00',
      'CEP 12345-678',
      'Telefone (11) 91234-5678',
      'Telefone +55 11 91234-5678',
      'Preciso até 20/10/2026; telefone (11) 91234-5678'
    ] LOOP
      BEGIN
        IF v_table = 'requests' THEN
          INSERT INTO public.requests(description) VALUES (v_text);
        ELSE
          INSERT INTO public.reports(reason) VALUES (v_text);
        END IF;
        RAISE EXCEPTION 'FAIL: % accepted synthetic identifier in %.%', v_text, v_table, v_column;
      EXCEPTION WHEN check_violation THEN
        IF SQLERRM = 'FAIL' OR SQLERRM LIKE 'FAIL:%' THEN
          RAISE;
        END IF;
        IF SQLERRM <> 'sensitive_text_not_allowed' THEN
          RAISE EXCEPTION 'FAIL: unexpected error for %.%: %', v_table, v_column, SQLERRM;
        END IF;
      END;
      v_count := v_count + 1;
    END LOOP;
  END LOOP;

  -- Updating a previously accepted row must be protected too.
  BEGIN
    UPDATE public.requests SET description = 'Contato teste@example.invalid' WHERE id = 1;
    RAISE EXCEPTION 'FAIL: update bypassed requests trigger';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'sensitive_text_not_allowed' THEN RAISE; END IF;
  END;

  BEGIN
    UPDATE public.reports SET reason = 'CEP 12345-678' WHERE id = 1;
    RAISE EXCEPTION 'FAIL: update bypassed reports trigger';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'sensitive_text_not_allowed' THEN RAISE; END IF;
  END;

  RAISE NOTICE 'PASS: % synthetic identifier insert cases plus accepted text and update guards', v_count;
END
$tests$;

ROLLBACK;
