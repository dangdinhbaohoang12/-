-- Atomic login/PIN failure counting to close the read-modify-write race that
-- let concurrent bad attempts bypass the account lock (5 failures / 15 min).
create or replace function public.ptw_record_auth_failure(
  p_user_id text,
  p_max_failures integer,
  p_lock_ms bigint
) returns table(failed_login_count integer, locked_until timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count integer;
  new_locked timestamptz;
begin
  update public.ptw_users
  set failed_login_count = failed_login_count + 1,
      locked_until = case
        when failed_login_count + 1 >= p_max_failures
          then now() + (p_lock_ms || ' milliseconds')::interval
        else locked_until
      end
  where id = p_user_id
  returning public.ptw_users.failed_login_count, public.ptw_users.locked_until
  into new_count, new_locked;

  return query select new_count, new_locked;
end;
$$;

revoke all on function public.ptw_record_auth_failure(text, integer, bigint) from public, anon, authenticated;
grant execute on function public.ptw_record_auth_failure(text, integer, bigint) to service_role;
