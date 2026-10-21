-- Public names are derived from full_name by the profile trigger.
-- authenticated may edit full_name but must not bypass that normalization.
revoke update (public_name) on table public.profiles from authenticated;
