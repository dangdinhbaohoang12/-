-- Every Request Revision created a new permit row that kept the parent's
-- permit_number, colliding with the "permit_number unique" constraint. The
-- permit number is a human identifier shared by all revisions of the same
-- permit; the true storage key must be (permit_number, revision_no).
alter table public.ptw_permits add column if not exists revision_no integer not null default 0;

update public.ptw_permits
set revision_no = coalesce((data->>'revisionNo')::integer, 0)
where revision_no = 0;

alter table public.ptw_permits drop constraint if exists ptw_permits_permit_number_key;

create unique index if not exists ptw_permits_number_revision_idx
  on public.ptw_permits (permit_number, revision_no);

create or replace function public.ptw_apply_permit_transaction(
  p_changes jsonb,
  p_audits jsonb default '[]'::jsonb,
  p_notifications jsonb default '[]'::jsonb
) returns setof public.ptw_permits
language plpgsql
security definer
set search_path = public
as $$
declare
  change_item jsonb;
  audit_item jsonb;
  notification_item jsonb;
  updated_row public.ptw_permits;
begin
  for change_item in
    select value from jsonb_array_elements(coalesce(p_changes, '[]'::jsonb))
  loop
    if change_item->>'operation' = 'insert' then
      insert into public.ptw_permits (
        id, permit_number, platform_code, status, revision_no, version, data, created_at, updated_at
      )
      values (
        change_item->'data'->>'id',
        change_item->'data'->>'permitNumber',
        change_item->'data'->>'platformCode',
        change_item->'data'->>'status',
        coalesce((change_item->'data'->>'revisionNo')::integer, 0),
        1,
        change_item->'data',
        coalesce((change_item->'data'->>'createdAt')::timestamptz, now()),
        now()
      )
      returning * into updated_row;
    else
      update public.ptw_permits
      set
        permit_number = change_item->'data'->>'permitNumber',
        platform_code = change_item->'data'->>'platformCode',
        status = change_item->'data'->>'status',
        revision_no = coalesce((change_item->'data'->>'revisionNo')::integer, 0),
        data = change_item->'data',
        version = version + 1,
        updated_at = now()
      where id = change_item->>'id'
        and version = (change_item->>'expectedVersion')::bigint
      returning * into updated_row;

      if not found then
        raise exception 'PTW_VERSION_CONFLICT';
      end if;
    end if;

    return next updated_row;
  end loop;

  for audit_item in
    select value from jsonb_array_elements(coalesce(p_audits, '[]'::jsonb))
  loop
    insert into public.ptw_audit_log (
      id, permit_id, permit_number, actor_user_id, actor_role,
      event_type, action, from_status, to_status, device_ip, payload, occurred_at
    )
    values (
      audit_item->>'id',
      nullif(audit_item->>'permitId', ''),
      nullif(audit_item->>'permitNumber', ''),
      audit_item->>'actorUserId',
      audit_item->>'actorRole',
      audit_item->>'eventType',
      audit_item->>'action',
      nullif(audit_item->>'fromStatus', ''),
      nullif(audit_item->>'toStatus', ''),
      audit_item->>'deviceIp',
      coalesce(audit_item->'payload', '{}'::jsonb),
      coalesce((audit_item->>'occurredAt')::timestamptz, now())
    );
  end loop;

  for notification_item in
    select value from jsonb_array_elements(coalesce(p_notifications, '[]'::jsonb))
  loop
    insert into public.ptw_notifications (
      id, recipient_user_id, permit_id, permit_number,
      event, message, severity, created_at, data
    )
    values (
      notification_item->>'id',
      notification_item->>'recipientUserId',
      notification_item->>'permitId',
      notification_item->>'permitNumber',
      notification_item->>'event',
      notification_item->>'message',
      notification_item->>'severity',
      coalesce((notification_item->>'createdAt')::timestamptz, now()),
      notification_item
    );
  end loop;

  return;
end;
$$;

revoke all on function public.ptw_apply_permit_transaction(jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.ptw_apply_permit_transaction(jsonb, jsonb, jsonb) to service_role;
