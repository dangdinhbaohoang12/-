-- Trusted storage and authorization boundary for OFFSHORE PTW.
-- Run this migration in the Supabase/PostgreSQL database used by the backend.
create table if not exists public.ptw_users (
  id text primary key,
  username text not null,
  full_name text not null,
  role text not null,
  platform_code text not null,
  organization text,
  certification_number text,
  email text,
  phone text,
  pin_hash text not null,
  active boolean not null default true,
  must_change_pin boolean not null default true,
  created_at timestamptz not null default now(),
  created_by_user_id text,
  last_login_at timestamptz,
  failed_login_count integer not null default 0,
  locked_until timestamptz,
  session_version integer not null default 1,
  constraint ptw_users_role_check check (
    role in (
      'OIM','DEPUTY_OIM','FPS','LINE_SUPERVISOR',
      'PERMIT_APPLICANT','PERMIT_CONTROLLER','HSE','ADMINISTRATOR'
    )
  )
);

create unique index if not exists ptw_users_username_lower_idx
  on public.ptw_users (lower(username));

create table if not exists public.ptw_permits (
  id text primary key,
  permit_number text not null unique,
  platform_code text not null,
  status text not null,
  version bigint not null default 1,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ptw_permits_platform_idx on public.ptw_permits(platform_code);
create index if not exists ptw_permits_status_idx on public.ptw_permits(status);
create index if not exists ptw_permits_updated_idx on public.ptw_permits(updated_at desc);

create table if not exists public.ptw_notifications (
  id text primary key,
  recipient_user_id text not null references public.ptw_users(id),
  permit_id text not null references public.ptw_permits(id),
  permit_number text not null,
  event text not null,
  message text not null,
  severity text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  data jsonb not null
);

create index if not exists ptw_notifications_recipient_idx
  on public.ptw_notifications(recipient_user_id, created_at desc);

create table if not exists public.ptw_audit_log (
  id text primary key,
  permit_id text,
  permit_number text,
  actor_user_id text not null,
  actor_role text not null,
  event_type text not null,
  action text not null,
  from_status text,
  to_status text,
  device_ip text not null,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists ptw_audit_permit_idx
  on public.ptw_audit_log(permit_id, occurred_at);
create index if not exists ptw_audit_actor_idx
  on public.ptw_audit_log(actor_user_id, occurred_at desc);

alter table public.ptw_users enable row level security;
alter table public.ptw_permits enable row level security;
alter table public.ptw_notifications enable row level security;
alter table public.ptw_audit_log enable row level security;

revoke all on table public.ptw_users from anon, authenticated;
revoke all on table public.ptw_permits from anon, authenticated;
revoke all on table public.ptw_notifications from anon, authenticated;
revoke all on table public.ptw_audit_log from anon, authenticated;

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
        id, permit_number, platform_code, status, version, data, created_at, updated_at
      )
      values (
        change_item->'data'->>'id',
        change_item->'data'->>'permitNumber',
        change_item->'data'->>'platformCode',
        change_item->'data'->>'status',
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

create or replace function public.ptw_deny_audit_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'PTW audit log is append-only';
end;
$$;

drop trigger if exists ptw_audit_no_update_delete on public.ptw_audit_log;
create trigger ptw_audit_no_update_delete
before update or delete on public.ptw_audit_log
for each row execute function public.ptw_deny_audit_mutation();

revoke all on function public.ptw_apply_permit_transaction(jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.ptw_apply_permit_transaction(jsonb, jsonb, jsonb) to service_role;