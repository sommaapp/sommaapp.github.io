-- Disposable PostgreSQL integration test for the sensitive-text migration.
-- Run ONLY in a fresh, isolated test database with a role allowed to create schemas/roles:
--   psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/sensitive-text-migration.test.sql
-- This script creates minimal stand-in tables and rolls back all test objects at the end.
\set ON_ERROR_STOP on
BEGIN;

CREATE SCHEMA IF NOT EXISTS private;

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END
$roles$;

CREATE TABLE public.requests (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  description text
);
CREATE TABLE public.reports (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reason text
);

\ir ../supabase/migrations/20261020120000_reject_sensitive_text.sql

DO $tests$
DECLARE
  v_rejected boolean;
BEGIN
  -- Ordinary text should pass in both tables.
  INSERT INTO public.requests(description) VALUES ('Preciso de ajuda para transporte até o trabalho.');
  INSERT INTO public.reports(reason) VALUES ('A descrição do anúncio está desatualizada.');

  -- Synthetic email must be rejected.
  v_rejected := false;
  BEGIN
    INSERT INTO public.requests(description) VALUES ('Contato teste@example.invalid');
  EXCEPTION WHEN check_violation THEN
    v_rejected := SQLERRM = 'sensitive_text_not_allowed';
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'FAIL: synthetic email was not rejected on requests'; END IF;

  -- Synthetic CPF-shaped value must be rejected on update as well as insert.
  INSERT INTO public.requests(description) VALUES ('Texto inicial');
  v_rejected := false;
  BEGIN
    UPDATE public.requests SET description = 'Documento 123.456.789-00' WHERE description = 'Texto inicial';
  EXCEPTION WHEN check_violation THEN
    v_rejected := SQLERRM = 'sensitive_text_not_allowed';
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'FAIL: synthetic CPF-shaped value was not rejected on update'; END IF;

  -- Synthetic CEP must be rejected in reports.
  v_rejected := false;
  BEGIN
    INSERT INTO public.reports(reason) VALUES ('CEP 12345-678');
  EXCEPTION WHEN check_violation THEN
    v_rejected := SQLERRM = 'sensitive_text_not_allowed';
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'FAIL: synthetic CEP was not rejected on reports'; END IF;

  -- A currency amount and a date should not be rejected.
  INSERT INTO public.requests(description) VALUES ('Meta de R$ 1.200,00 até 20/10/2026.');
END
$tests$;

ROLLBACK;
