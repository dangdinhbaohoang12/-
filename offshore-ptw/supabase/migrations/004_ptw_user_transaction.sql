-- Account mutations (create/PIN reset/toggle active) previously wrote the
-- user row and its audit entry as two separate requests: if the audit write
-- failed after a successful mutation, the client saw an error and could
-- retry with no record of what already happened. Commit both in one
-- PostgreSQL transaction, mirroring ptw_apply_permit_transaction.
create or replace function public.ptw_apply_user_transaction(
  p_operation text,
  p_user jsonb,
  p_audit jsonb
) returns public.ptw_users
language plpgsql
security definer
set search_path = public
as $$
declare
  result_row public.ptw_users;
begin
  if p_operation = 'insert' then
    insert into public.ptw_users (
      id, username, full_name, role, platform_code, organization,
      certification_number, email, phone, pin_hash, active, must_change_pin,
      created_at, created_by_user_id, failed_login_count, locked_until, session_version
    )
    values (
      p_user->>'id',
      p_user->>'username',
      p_user->>'full_name',
      p_user->>'role',
      p_user->>'platform_code',
      p_user->>'organization',
      p_user->>'certification_number',
      p_user->>'email',
      p_user->>'phone',
      p_user->>'pin_hash',
      coalesce((p_user->>'active')::boolean, true),
      coalesce((p_user->>'must_change_pin')::boolean, true),
      coalesce((p_user->>'created_at')::timestamptz, now()),
      p_user->>'created_by_user_id',
      coalesce((p_user->>'failed_login_count')::integer, 0),
      nullif(p_user->>'locked_until', '')::timestamptz,
      coalesce((p_user->>'session_version')::integer, 1)
    )
    returning * into result_row;
  else
    update public.ptw_users
    set
      pin_hash = coalesce(p_user->>'pin_hash', pin_hash),
      must_change_pin = coalesce((p_user->>'must_change_pin')::boolean, must_change_pin),
      active = coalesce((p_user->>'active')::boolean, active),
      failed_login_count = coalesce((p_user->>'failed_login_count')::integer, failed_login_count),
      locked_until = case
        when p_user ? 'locked_until' then nullif(p_user->>'locked_until', '')::timestamptz
        else locked_until
      end,
      session_version = coalesce((p_user->>'session_version')::integer, session_version)
    where id = p_user->>'id'
    returning * into result_row;

    if not found then
      raise exception 'PTW_USER_NOT_FOUND';
    end if;
  end if;

  insert into public.ptw_audit_log (
    id, permit_id, permit_number, actor_user_id, actor_role,
    event_type, action, from_status, to_status, device_ip, payload, occurred_at
  )
  values (
    p_audit->>'id',
    nullif(p_audit->>'permitId', ''),
    nullif(p_audit->>'permitNumber', ''),
    p_audit->>'actorUserId',
    p_audit->>'actorRole',
    p_audit->>'eventType',
    p_audit->>'action',
    nullif(p_audit->>'fromStatus', ''),
    nullif(p_audit->>'toStatus', ''),
    p_audit->>'deviceIp',
    coalesce(p_audit->'payload', '{}'::jsonb),
    coalesce((p_audit->>'occurredAt')::timestamptz, now())
  );

  return result_row;
end;
$$;

revoke all on function public.ptw_apply_user_transaction(text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.ptw_apply_user_transaction(text, jsonb, jsonb) to service_role;
