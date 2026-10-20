-- Block common personal identifiers in user-authored text before it is stored.
-- This is a conservative privacy guard, not a complete PII detector.
create or replace function private.reject_sensitive_text()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_text text;
  v_digits text;
begin
  if tg_table_name = 'requests' then
    v_text := coalesce(new.description, '');
  elsif tg_table_name = 'reports' then
    v_text := coalesce(new.reason, '');
  else
    return new;
  end if;

  v_digits := regexp_replace(v_text, '[^0-9]', '', 'g');

  if v_text ~* '[A-Z0-9._%+-]+@[A-Z0-9.-]+[.][A-Z]{2,}'
     or v_text ~ '(^|[^0-9])[0-9]{3}[.]?[0-9]{3}[.]?[0-9]{3}-?[0-9]{2}([^0-9]|$)'
     or v_text ~ '(^|[^0-9])[0-9]{5}-?[0-9]{3}([^0-9]|$)'
     or (((length(v_digits) between 10 and 11)
          or (length(v_digits) between 12 and 13 and v_text ~ '[+]55')
         )
         and v_text ~ '(^|[^0-9])([+]55[ () .-]*)?([(]?[0-9]{2}[)]?[ .-]*)?(9[0-9]{4}|[2-5][0-9]{3})[ .-]?[0-9]{4}([^0-9]|$)') then
    raise exception using
      errcode = '23514',
      message = 'sensitive_text_not_allowed',
      detail = 'Remove contact details and personal identifiers before submitting.';
  end if;

  return new;
end;
$$;

revoke all on function private.reject_sensitive_text()
  from public, anon, authenticated, service_role;

drop trigger if exists requests_reject_sensitive_text on public.requests;
create trigger requests_reject_sensitive_text
before insert or update of description on public.requests
for each row execute function private.reject_sensitive_text();

drop trigger if exists reports_reject_sensitive_text on public.reports;
create trigger reports_reject_sensitive_text
before insert or update of reason on public.reports
for each row execute function private.reject_sensitive_text();
