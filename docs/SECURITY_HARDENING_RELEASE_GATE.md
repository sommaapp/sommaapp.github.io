# Security hardening — release gate

This checklist tracks security work for SOMMA. It is intentionally conservative:
a checked item requires evidence from the deployed target or an isolated test
environment. Passing a checklist is not a guarantee that the system is invulnerable.

## Data minimization

- [x] Remove `contributions.idempotency_key` from the general client-side
  contribution projection. The backend may still use the key in a filtered
  lookup without returning the value to the browser.
- [ ] Replace unbounded client reads with bounded, cursor-based reads.
- [ ] Review every RPC for caller scoping, SECURITY INVOKER, bounded results,
  and minimal returned columns.
- [ ] Confirm no CPF, email, phone, address, credentials, or access tokens are
  stored in public descriptions, reports, notifications, or audit metadata.

## Authentication and session security

- [ ] Enable Supabase leaked-password protection and verify it server-side.
- [ ] Enforce the password policy on the server, not only in browser validation.
- [ ] Review PKCE migration, redirect allowlist, token lifetime, refresh and
  logout behavior, including multiple tabs and shared devices.
- [ ] Verify account enumeration resistance and recovery flow behavior.

## Authorization and database

- [ ] Run two-user isolation tests against disposable PostgreSQL and a
  controlled Supabase preview using real JWT claims.
- [ ] Review RLS, grants, views, functions, triggers, SECURITY DEFINER
  ownership, search_path, and schema exposure after every migration.
- [ ] Confirm anonymous role cannot read or invoke protected objects.
- [ ] Verify audit logs never contain secrets or unnecessary personal data.

## Browser and deployment

- [ ] Review all dynamic HTML sinks and confirm context-appropriate escaping.
- [ ] Verify service worker caches only static shell assets.
- [ ] Verify deployed HTTPS, CSP, HSTS, X-Content-Type-Options, Referrer-Policy,
  frame restrictions, and Permissions-Policy.
- [ ] Review dependency versions, supply-chain alerts, and GitHub Actions
  permissions/secrets.
- [ ] Test logout, account switching, offline mode, and browser storage cleanup.

## Privacy and operations

- [ ] Complete LGPD data inventory, purpose/legal basis, retention and deletion
  process, privacy notice, consent language where applicable, and incident plan.
- [ ] Define backup access, retention, restoration tests, and breach response.
- [ ] Complete independent security review before public launch.

## Safety boundary

Production database, authentication settings, secrets, and deployment must not
be changed as part of this branch. Apply changes only after explicit approval
and after preview validation, backup/recovery planning, and review of the
exact migration or configuration change.
