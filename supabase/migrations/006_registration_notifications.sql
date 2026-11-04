-- Jeazy Club - avisos administrativos de nuevos registros y solicitudes.
-- Ejecutar después de 005_remove_unconfirmed_payment_amount.sql.

create table if not exists public.notification_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null
    check (event_type in ('account_created', 'application_submitted')),
  user_id uuid references auth.users(id) on delete set null,
  application_id uuid references public.membership_applications(id) on delete set null,
  email text not null,
  full_name text,
  application_code text,
  dedupe_key text not null unique,
  delivery_status text not null default 'pending'
    check (delivery_status in ('pending', 'sent', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  provider_message_id text,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

alter table public.notification_events enable row level security;
revoke all on table public.notification_events from anon, authenticated;

-- No se crean políticas para visitantes ni socios. La tabla solamente puede ser
-- consultada desde el panel de Supabase o mediante la función de servicio.

create or replace function public.queue_new_account_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is null then
    return new;
  end if;

  insert into public.notification_events (
    event_type,
    user_id,
    email,
    full_name,
    dedupe_key
  )
  values (
    'account_created',
    new.id,
    new.email,
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    'account_created:' || new.id::text
  )
  on conflict (dedupe_key) do nothing;

  return new;
end;
$$;

revoke all on function public.queue_new_account_notification() from public;

drop trigger if exists queue_new_account_notification on auth.users;
create trigger queue_new_account_notification
after insert on auth.users
for each row execute function public.queue_new_account_notification();

create or replace function public.queue_application_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_email text;
  selected_name text;
begin
  if new.status <> 'submitted' then
    return new;
  end if;

  select
    coalesce(nullif(trim(p.email), ''), u.email),
    coalesce(
      nullif(trim(p.full_name), ''),
      nullif(trim(u.raw_user_meta_data ->> 'full_name'), '')
    )
  into selected_email, selected_name
  from auth.users u
  left join public.profiles p on p.id = u.id
  where u.id = new.user_id;

  if selected_email is null then
    return new;
  end if;

  insert into public.notification_events (
    event_type,
    user_id,
    application_id,
    email,
    full_name,
    application_code,
    dedupe_key
  )
  values (
    'application_submitted',
    new.user_id,
    new.id,
    selected_email,
    selected_name,
    new.application_code,
    'application_submitted:' || new.id::text || ':' || new.submitted_at::text
  )
  on conflict (dedupe_key) do nothing;

  return new;
end;
$$;

revoke all on function public.queue_application_notification() from public;

drop trigger if exists queue_application_notification on public.membership_applications;
create trigger queue_application_notification
after insert or update of status, submitted_at
on public.membership_applications
for each row execute function public.queue_application_notification();

