-- Reserve every login/operational PIN attempt before checking the hash. The
-- UPDATE serializes concurrent attempts and refuses accounts still locked.
drop function if exists public.ptw_record_auth_failure(text, integer, bigint);

create or replace function public.ptw_reserve_auth_attempt(
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
  update public.ptw_users as target
  set failed_login_count = case
        when target.locked_until is not null then 1
        else target.failed_login_count + 1
      end,
      locked_until = case
        when (case
          when target.locked_until is not null then 1
          else target.failed_login_count + 1
        end) >= p_max_failures
          then now() + (p_lock_ms || ' milliseconds')::interval
        else null
      end
  where target.id = p_user_id
    and (target.locked_until is null or target.locked_until <= now())
  returning target.failed_login_count, target.locked_until
  into new_count, new_locked;

  if found then
    return query select new_count, new_locked;
  end if;
end;
$$;

revoke all on function public.ptw_reserve_auth_attempt(text, integer, bigint) from public, anon, authenticated;
grant execute on function public.ptw_reserve_auth_attempt(text, integer, bigint) to service_role;
