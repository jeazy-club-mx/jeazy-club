create or replace function public.admin_registration_tracking()
returns table (
  user_id uuid,
  email text,
  email_confirmed boolean,
  created_at timestamptz,
  last_activity timestamptz,
  full_name text,
  phone text,
  birth_date date,
  city text,
  state text,
  profile_photo_uploaded boolean,
  identity_files integer,
  legal_acceptances integer,
  application_status text,
  application_code text,
  submitted_at timestamptz,
  membership_status text
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_jeazy_admin() then
    raise exception 'Acceso no autorizado';
  end if;

  return query
  select
    u.id,
    coalesce(p.email, u.email)::text,
    (u.email_confirmed_at is not null),
    u.created_at,
    greatest(u.last_sign_in_at, p.updated_at, ma.submitted_at, m.activated_at),
    p.full_name::text,
    p.phone::text,
    p.birth_date,
    p.city::text,
    p.state::text,
    (nullif(trim(p.profile_photo_path), '') is not null),
    coalesce(documents.total, 0)::integer,
    coalesce(acceptances.total, 0)::integer,
    ma.status::text,
    ma.application_code::text,
    ma.submitted_at,
    m.status::text
  from auth.users u
  left join public.profiles p on p.id = u.id
  left join public.membership_applications ma on ma.user_id = u.id
  left join public.memberships m on m.user_id = u.id
  left join lateral (
    select count(distinct d.document_side)::integer as total
    from public.identity_documents d
    where d.user_id = u.id
  ) documents on true
  left join lateral (
    select count(*)::integer as total
    from public.legal_acceptances la
    where la.user_id = u.id
  ) acceptances on true
  order by u.created_at desc;
end;
$$;

revoke all on function public.admin_registration_tracking() from public;
grant execute on function public.admin_registration_tracking() to authenticated;
