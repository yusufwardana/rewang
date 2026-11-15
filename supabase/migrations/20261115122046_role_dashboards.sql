begin;

-- Worker access is linked only by an admin-created, email-verified invitation.
create table if not exists public.worker_invites (
  id uuid primary key default gen_random_uuid(),
  worker_id bigint not null references public.workers(id) on delete cascade,
  email text not null,
  invited_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  check (email = lower(trim(email)))
);
create unique index if not exists worker_invites_one_pending_per_worker
  on public.worker_invites(worker_id) where accepted_at is null;
create index if not exists worker_invites_email_pending
  on public.worker_invites(email, expires_at) where accepted_at is null;
alter table public.worker_invites enable row level security;
revoke all on public.worker_invites from public, anon, authenticated;

create or replace function public.admin_invite_worker(p_worker_id bigint, p_email text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_admin uuid := auth.uid(); v_email text := lower(trim(p_email));
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role','') <> 'admin' then
    raise exception 'Admin role required' using errcode='42501';
  end if;
  if v_admin is null then raise exception 'Authentication required'; end if;
  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Valid email required' using errcode='22023';
  end if;
  perform 1 from public.workers where id=p_worker_id and listing_active for update;
  if not found then raise exception 'Worker profile must be active'; end if;
  if not exists (
    select 1 from public.worker_verifications v
    where v.worker_id=p_worker_id and v.consent_recorded_at is not null
      and v.consent_withdrawn_at is null
  ) then raise exception 'Active worker consent required'; end if;
  if exists (select 1 from public.worker_accounts where worker_id=p_worker_id and user_id is not null) then
    raise exception 'Worker already has an account';
  end if;
  if exists (
    select 1 from public.worker_accounts a join auth.users u on u.id=a.user_id
    where lower(u.email)=v_email and a.worker_id<>p_worker_id
  ) or exists (
    select 1 from public.worker_invites i
    where i.email=v_email and i.worker_id<>p_worker_id
      and i.accepted_at is null and i.expires_at>now()
  ) then raise exception 'Email is already linked or invited to another worker'; end if;

  update public.worker_invites set email=v_email,invited_by=v_admin,
    created_at=now(),expires_at=now()+interval '7 days'
    where worker_id=p_worker_id and accepted_at is null;
  if not found then
    insert into public.worker_invites(worker_id,email,invited_by)
      values(p_worker_id,v_email,v_admin);
  end if;
end;
$$;
revoke all on function public.admin_invite_worker(bigint,text) from public, anon;
grant execute on function public.admin_invite_worker(bigint,text) to authenticated;

create or replace function public.accept_worker_invite()
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid(); v_email text; v_worker_id bigint; v_linked bigint;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  select lower(email) into v_email from auth.users
    where id=v_user and email_confirmed_at is not null;
  if v_email is null then raise exception 'Verify this email address first' using errcode='42501'; end if;

  select i.worker_id into v_worker_id from public.worker_invites i
    join public.workers w on w.id=i.worker_id and w.listing_active
    join public.worker_verifications v on v.worker_id=w.id
      and v.consent_recorded_at is not null and v.consent_withdrawn_at is null
    where i.email=v_email and i.accepted_at is null and i.expires_at>now()
    order by i.created_at desc limit 1 for update of i;
  if v_worker_id is null then raise exception 'No valid worker invitation for this email'; end if;

  insert into public.worker_accounts(worker_id,user_id) values(v_worker_id,v_user)
    on conflict(worker_id) do update set user_id=excluded.user_id
      where public.worker_accounts.user_id is null or public.worker_accounts.user_id=excluded.user_id
    returning worker_id into v_linked;
  if v_linked is null then raise exception 'Worker profile is already linked to another account'; end if;
  update public.worker_invites set accepted_at=now()
    where worker_id=v_worker_id and email=v_email and accepted_at is null;
  return v_worker_id;
end;
$$;
revoke all on function public.accept_worker_invite() from public, anon;
grant execute on function public.accept_worker_invite() to authenticated;

create or replace function public.worker_dashboard()
returns table(
  worker_id bigint, nama text, kategori text, kecamatan text, tarif_harian integer,
  foto_profil_url text, deskripsi text, pengalaman_tahun integer, keahlian text[], portofolio text,
  is_verified boolean, is_available boolean, listing_active boolean,
  consent_recorded_at timestamptz, consent_withdrawn_at timestamptz,
  contact_opens bigint, opens_last_30_days bigint
) language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists (select 1 from auth.users u where u.id=auth.uid() and u.email_confirmed_at is not null) then
    raise exception 'Verified email required' using errcode='42501';
  end if;
  return query
    select w.id,w.nama,w.kategori,w.kecamatan,w.tarif_harian,w.foto_profil_url,w.deskripsi,
      w.pengalaman_tahun,w.keahlian,w.portofolio,w.is_verified,w.is_available,
      w.listing_active,v.consent_recorded_at,v.consent_withdrawn_at,
      count(uc.id)::bigint,
      count(uc.id) filter(where uc.unlocked_at>=now()-interval '30 days')::bigint
    from public.worker_accounts a
    join public.workers w on w.id=a.worker_id
    left join public.worker_verifications v on v.worker_id=w.id
    left join public.unlocked_contacts uc on uc.worker_id=w.id
    where a.user_id=auth.uid()
    group by w.id,v.consent_recorded_at,v.consent_withdrawn_at;
end;
$$;
revoke all on function public.worker_dashboard() from public, anon;
grant execute on function public.worker_dashboard() to authenticated;

create or replace function public.worker_set_availability(p_is_available boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_worker_id bigint;
begin
  select a.worker_id into v_worker_id from public.worker_accounts a
    where a.user_id=auth.uid();
  if v_worker_id is null then raise exception 'Worker account is not linked' using errcode='42501'; end if;
  if p_is_available and not exists (
    select 1 from public.workers w join public.worker_verifications v on v.worker_id=w.id
    where w.id=v_worker_id and w.listing_active
      and v.consent_recorded_at is not null and v.consent_withdrawn_at is null
  ) then raise exception 'An active listing and consent are required to become available'; end if;
  update public.workers set is_available=p_is_available where id=v_worker_id;
end;
$$;
revoke all on function public.worker_set_availability(boolean) from public, anon;
grant execute on function public.worker_set_availability(boolean) to authenticated;

create or replace function public.admin_dashboard_summary()
returns table(
  paid_revenue bigint, paid_orders bigint, pending_orders bigint,
  pending_reports bigint, active_workers bigint, contact_opens_30d bigint
) language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role','') <> 'admin' then
    raise exception 'Admin role required' using errcode='42501';
  end if;
  return query select
    coalesce((select sum(p.harga_total)::bigint from public.purchases p where p.status='paid'),0),
    (select count(*)::bigint from public.purchases p where p.status='paid'),
    (select count(*)::bigint from public.purchases p where p.status='pending'),
    (select count(*)::bigint from public.buyer_reports r where r.status='pending'),
    (select count(*)::bigint from public.workers w where w.listing_active),
    (select count(*)::bigint from public.unlocked_contacts c
      where c.unlocked_at>=now()-interval '30 days');
end;
$$;
revoke all on function public.admin_dashboard_summary() from public, anon;
grant execute on function public.admin_dashboard_summary() to authenticated;

create or replace function public.admin_list_dashboard_workers()
returns table(
  worker_id bigint, nama text, kategori text, is_available boolean, listing_active boolean,
  consent_recorded_at timestamptz, consent_withdrawn_at timestamptz,
  account_email text, invited_email text, contact_opens bigint
) language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role','') <> 'admin' then
    raise exception 'Admin role required' using errcode='42501';
  end if;
  return query
    select w.id,w.nama,w.kategori,w.is_available,w.listing_active,
      v.consent_recorded_at,v.consent_withdrawn_at,u.email::text,
      (select i.email from public.worker_invites i where i.worker_id=w.id
        and i.accepted_at is null and i.expires_at>now() order by i.created_at desc limit 1),
      (select count(*)::bigint from public.unlocked_contacts c where c.worker_id=w.id)
    from public.workers w
    left join public.worker_verifications v on v.worker_id=w.id
    left join public.worker_accounts a on a.worker_id=w.id
    left join auth.users u on u.id=a.user_id
    order by w.id desc;
end;
$$;
revoke all on function public.admin_list_dashboard_workers() from public, anon;
grant execute on function public.admin_list_dashboard_workers() to authenticated;

create or replace function public.admin_list_dashboard_purchases()
returns table(
  order_id text, buyer_email text, jumlah_kredit_dibeli integer, harga_total integer,
  status text, payment_type text, paid_at timestamptz, created_at timestamptz
) language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role','') <> 'admin' then
    raise exception 'Admin role required' using errcode='42501';
  end if;
  return query select p.order_id,b.email,p.jumlah_kredit_dibeli,p.harga_total,
    p.status,p.payment_type,p.paid_at,p.created_at
    from public.purchases p join public.buyers b on b.id=p.buyer_id
    order by p.created_at desc limit 100;
end;
$$;
revoke all on function public.admin_list_dashboard_purchases() from public, anon;
grant execute on function public.admin_list_dashboard_purchases() to authenticated;

notify pgrst,'reload schema';
commit;
