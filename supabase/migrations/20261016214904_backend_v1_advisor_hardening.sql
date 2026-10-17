
create index if not exists profiles_level_idx on public.profiles(level);
create index if not exists public_profiles_level_idx on public.public_profiles(level);

create policy audit_log_deny_authenticated
on public.audit_log for select
to authenticated
using (false);
