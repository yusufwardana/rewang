begin;

create table public.buyer_legal_acceptances (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references public.buyers(id) on delete restrict,
  terms_version text not null,
  privacy_version text not null,
  accepted_at timestamptz not null default now(),
  unique (buyer_id, terms_version, privacy_version)
);
alter table public.buyer_legal_acceptances enable row level security;
revoke all on public.buyer_legal_acceptances from public, anon, authenticated;
grant select on public.buyer_legal_acceptances to authenticated;
create policy buyer_legal_read_own on public.buyer_legal_acceptances
  for select to authenticated using (buyer_id = (select auth.uid()));

create function public.accept_buyer_legal(p_terms_version text, p_privacy_version text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_terms_version <> '2026-11-15' or p_privacy_version <> '2026-11-15' then
    raise exception 'Legal documents changed; review the current versions';
  end if;
  insert into public.buyer_legal_acceptances (buyer_id, terms_version, privacy_version)
    values (auth.uid(), p_terms_version, p_privacy_version)
    on conflict (buyer_id, terms_version, privacy_version) do nothing;
end;
$$;
revoke all on function public.accept_buyer_legal(text,text) from public, anon;
grant execute on function public.accept_buyer_legal(text,text) to authenticated;

alter table public.purchases
  add column terms_version text,
  add column privacy_version text;
create function public.require_purchase_legal()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.buyer_legal_acceptances
    where buyer_id = new.buyer_id and terms_version = '2026-11-15'
      and privacy_version = '2026-11-15'
  ) then raise exception 'Accept the current legal documents before checkout'; end if;
  new.terms_version := '2026-11-15';
  new.privacy_version := '2026-11-15';
  return new;
end;
$$;
create trigger purchases_require_legal before insert on public.purchases
  for each row execute function public.require_purchase_legal();
revoke all on function public.require_purchase_legal() from public, anon, authenticated;

-- Keep existing directory rows visible while signed legacy forms are collected.
-- New rows start hidden and the consent-backed admin RPC publishes them.
alter table public.workers add column listing_active boolean not null default true;
alter table public.workers alter column listing_active set default false;
alter table public.worker_verifications
  add column consent_path text,
  add column consent_version text,
  add column consent_recorded_at timestamptz,
  add column consent_withdrawn_at timestamptz;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('worker-private-consent','worker-private-consent',false,5242880,
  array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=false, file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;
create policy worker_consent_upload on storage.objects for insert to authenticated
  with check (bucket_id='worker-private-consent'
    and (select auth.jwt() -> 'app_metadata' ->> 'role')='admin'
    and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy worker_consent_read on storage.objects for select to authenticated
  using (bucket_id='worker-private-consent'
    and (select auth.jwt() -> 'app_metadata' ->> 'role')='admin');
create policy worker_consent_cleanup on storage.objects for delete to authenticated
  using (bucket_id='worker-private-consent'
    and (select auth.jwt() -> 'app_metadata' ->> 'role')='admin'
    and (storage.foldername(name))[1]=(select auth.uid())::text);

create function worker_intake_private.attach_consent(
  p_worker_id bigint, p_consent_path text, p_consent_version text
) returns void language plpgsql security definer set search_path = '' as $$
declare v_admin uuid := worker_intake_private.assert_admin();
begin
  if p_consent_version is distinct from '2026-11-15'
    or p_consent_path is null
    or p_consent_path !~ ('^' || v_admin::text || '/[0-9a-f-]{36}/persetujuan\.(pdf|jpg|png|webp)$')
    or not exists (select 1 from storage.objects
      where bucket_id='worker-private-consent' and name=p_consent_path)
  then raise exception 'Signed consent document is required' using errcode='22023'; end if;

  perform 1 from public.workers where id=p_worker_id for update;
  if not found then raise exception 'Worker not found' using errcode='P0002'; end if;

  if exists (
    select 1 from public.worker_verifications
    where worker_id=p_worker_id and consent_path is not null
      and (consent_withdrawn_at is null or consent_path=p_consent_path)
  ) then
    raise exception 'Existing consent is active or this form was withdrawn' using errcode='22023';
  end if;

  update public.worker_verifications set consent_path=p_consent_path,
    consent_version=p_consent_version, consent_recorded_at=now(),
    consent_withdrawn_at=null, izin_sebar_nomor=true, recorded_by=v_admin
    where worker_id=p_worker_id;
  if not found then
    insert into public.worker_verifications
      (worker_id,izin_sebar_nomor,recorded_by,consent_path,consent_version,consent_recorded_at)
    values (p_worker_id,true,v_admin,p_consent_path,p_consent_version,now());
  end if;
  update public.workers set listing_active=true where id=p_worker_id;
end;
$$;
revoke all on function worker_intake_private.attach_consent(bigint,text,text) from public,anon,authenticated;

create function public.admin_create_worker_with_consent(
  p_worker jsonb, p_upload_folder text, p_profile_path text, p_ktp_path text,
  p_portfolios jsonb, p_public_base text, p_consent_path text, p_consent_version text
) returns text language plpgsql security definer set search_path = '' as $$
declare v_slug text; v_id bigint;
begin
  perform worker_intake_private.assert_admin();
  v_slug := worker_intake_private.create_worker(
    p_worker,p_upload_folder,p_profile_path,p_ktp_path,p_portfolios,p_public_base);
  select id into v_id from public.workers where slug=v_slug;
  perform worker_intake_private.attach_consent(v_id,p_consent_path,p_consent_version);
  return v_slug;
end;
$$;
revoke all on function public.admin_create_worker_with_consent(jsonb,text,text,text,jsonb,text,text,text)
  from public,anon;
grant execute on function public.admin_create_worker_with_consent(jsonb,text,text,text,jsonb,text,text,text)
  to authenticated;
revoke execute on function public.admin_create_worker(jsonb,text,text,text,jsonb,text) from authenticated;
revoke execute on function worker_intake_private.create_worker(jsonb,text,text,text,jsonb,text) from authenticated;

create function public.admin_list_worker_listings()
returns table(id bigint,nama text,kategori text,is_available boolean,listing_active boolean,
  consent_recorded_at timestamptz,consent_withdrawn_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  perform worker_intake_private.assert_admin();
  return query select w.id,w.nama,w.kategori,w.is_available,w.listing_active,
    v.consent_recorded_at,v.consent_withdrawn_at
    from public.workers w left join public.worker_verifications v on v.worker_id=w.id
    order by w.id desc;
end;
$$;
revoke all on function public.admin_list_worker_listings() from public,anon;
grant execute on function public.admin_list_worker_listings() to authenticated;

create function public.admin_set_worker_availability(p_worker_id bigint,p_is_available boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform worker_intake_private.assert_admin();
  update public.workers set is_available=p_is_available where id=p_worker_id;
  if not found then raise exception 'Worker not found' using errcode='P0002'; end if;
end;
$$;
revoke all on function public.admin_set_worker_availability(bigint,boolean) from public,anon;
grant execute on function public.admin_set_worker_availability(bigint,boolean) to authenticated;

create function public.admin_publish_worker_with_consent(
  p_worker_id bigint,p_consent_path text,p_consent_version text
) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform worker_intake_private.attach_consent(p_worker_id,p_consent_path,p_consent_version);
end;
$$;
revoke all on function public.admin_publish_worker_with_consent(bigint,text,text) from public,anon;
grant execute on function public.admin_publish_worker_with_consent(bigint,text,text) to authenticated;

create function public.admin_withdraw_worker_listing(p_worker_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform worker_intake_private.assert_admin();
  update public.workers set listing_active=false where id=p_worker_id;
  if not found then raise exception 'Worker not found'; end if;
  update public.worker_verifications set consent_withdrawn_at=now()
    where worker_id=p_worker_id and consent_withdrawn_at is null;
end;
$$;
revoke all on function public.admin_withdraw_worker_listing(bigint) from public,anon;
grant execute on function public.admin_withdraw_worker_listing(bigint) to authenticated;

create function public.require_active_worker_unlock()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.workers where id=new.worker_id and listing_active) then
    raise exception 'Worker listing is unavailable';
  end if;
  return new;
end;
$$;
create trigger unlocked_contacts_require_active_worker before insert on public.unlocked_contacts
  for each row execute function public.require_active_worker_unlock();
revoke all on function public.require_active_worker_unlock() from public,anon,authenticated;

create or replace view public.workers_directory with (security_invoker=true) as
select id,nama,kategori,kecamatan,tarif_harian,is_verified,is_available,rating,total_job,
  deskripsi,pengalaman,keahlian,portofolio,reviews,foto_profil_url
from public.workers where listing_active;
grant select (listing_active) on public.workers to anon,authenticated;

drop policy if exists workers_read_for_directory on public.workers;
drop policy if exists workers_read_directory on public.workers;
create policy workers_read_directory on public.workers
  for select to anon,authenticated using (listing_active);

notify pgrst,'reload schema';
commit;
