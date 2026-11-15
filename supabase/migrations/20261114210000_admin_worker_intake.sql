begin;

alter table public.workers
  add column if not exists slug text,
  add column if not exists nama_panggilan text,
  add column if not exists jenis_kelamin text,
  add column if not exists tanggal_lahir date,
  add column if not exists foto_profil_url text,
  add column if not exists kelurahan text,
  add column if not exists kabupaten_kota text,
  add column if not exists tarif_per_jam integer,
  add column if not exists pengalaman_tahun integer;

create unique index if not exists workers_slug_unique on public.workers (slug);

create schema if not exists worker_intake_private;
revoke all on schema worker_intake_private from public;
grant usage on schema worker_intake_private to authenticated;

create function worker_intake_private.local_phone(p_phone text)
returns text language sql immutable strict set search_path = '' as $$
  select regexp_replace(regexp_replace(p_phone, '[^0-9]', '', 'g'), '^(62|0)?8', '08')
$$;

-- Existing fixtures can share a number. Preserve those rows and index the normalized lookup.
create index if not exists workers_intake_phone_lookup
  on public.workers (worker_intake_private.local_phone(no_wa));

create table if not exists public.worker_skills (
  id uuid primary key default gen_random_uuid(),
  worker_id bigint not null references public.workers(id) on delete cascade,
  skill text not null,
  created_at timestamptz not null default now(),
  unique (worker_id, skill)
);

create table if not exists public.worker_portfolios (
  worker_id bigint not null references public.workers(id) on delete cascade,
  position integer not null check (position between 1 and 3),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  media_url text not null,
  primary key (worker_id, position)
);

create table if not exists public.worker_verifications (
  worker_id bigint primary key references public.workers(id) on delete cascade,
  foto_ktp_path text,
  izin_sebar_nomor boolean not null check (izin_sebar_nomor),
  test_called_at timestamptz,
  recorded_by uuid references auth.users(id) on delete set null,
  recorded_at timestamptz not null default now()
);

alter table public.worker_skills enable row level security;
alter table public.worker_portfolios enable row level security;
alter table public.worker_verifications enable row level security;
revoke all on public.worker_skills, public.worker_portfolios, public.worker_verifications from public, anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('worker-public-media', 'worker-public-media', true, 5242880, array['image/jpeg','image/png','image/webp']),
       ('worker-private-ktp', 'worker-private-ktp', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy worker_intake_media_upload on storage.objects for insert to authenticated
  with check (bucket_id in ('worker-public-media','worker-private-ktp')
    and (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy worker_intake_media_read on storage.objects for select to authenticated
  using (bucket_id in ('worker-public-media','worker-private-ktp')
    and (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
create policy worker_intake_media_cleanup on storage.objects for delete to authenticated
  using (bucket_id in ('worker-public-media','worker-private-ktp')
    and (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    and (storage.foldername(name))[1] = (select auth.uid())::text);

create function worker_intake_private.assert_admin()
returns uuid language plpgsql stable set search_path = '' as $$
begin
  if auth.uid() is null or (auth.jwt() -> 'app_metadata' ->> 'role') is distinct from 'admin' then
    raise exception 'Admin role required' using errcode = '42501';
  end if;
  return auth.uid();
end;
$$;

create function worker_intake_private.phone_exists(p_no_wa text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
  perform worker_intake_private.assert_admin();
  if p_no_wa is null or p_no_wa !~ '^08[0-9]{8,11}$' then
    raise exception 'Invalid WhatsApp number' using errcode = '22023';
  end if;
  return exists (
    select 1 from public.workers w where worker_intake_private.local_phone(w.no_wa) = p_no_wa
  );
end;
$$;

create function worker_intake_private.create_worker(
  p_worker jsonb, p_upload_folder text, p_profile_path text, p_ktp_path text,
  p_portfolios jsonb, p_public_base text
) returns text language plpgsql security definer set search_path = '' as $$
declare
  v_admin uuid := worker_intake_private.assert_admin();
  v_name text := btrim(p_worker ->> 'nama_lengkap');
  v_phone text := p_worker ->> 'no_wa';
  v_base_slug text := p_worker ->> 'slug';
  v_slug text := v_base_slug;
  v_worker_id bigint;
  v_suffix integer := 1;
  v_verified boolean := (p_worker ->> 'is_verified')::boolean;
  v_available boolean := (p_worker ->> 'is_available')::boolean;
  v_daily integer := (p_worker ->> 'tarif_harian')::integer;
  v_hourly integer := (p_worker ->> 'tarif_per_jam')::integer;
  v_years integer := (p_worker ->> 'pengalaman_tahun')::integer;
  v_birth date := nullif(p_worker ->> 'tanggal_lahir', '')::date;
  v_gender text := nullif(p_worker ->> 'jenis_kelamin', '');
  v_bio text := nullif(btrim(p_worker ->> 'bio'), '');
  v_skills text[];
  v_item jsonb;
  v_path text;
  v_title text;
  v_position integer := 0;
begin
  if (p_worker ->> 'izin_sebar_nomor')::boolean is distinct from true
    or coalesce(char_length(v_name), 0) not between 1 and 120
    or v_phone is null or v_phone !~ '^08[0-9]{8,11}$'
    or v_base_slug is null or v_base_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(v_base_slug) > 160
    or coalesce(char_length(btrim(p_worker ->> 'kategori_utama')), 0) not between 1 and 100
    or coalesce(char_length(btrim(p_worker ->> 'kecamatan')), 0) not between 1 and 100
    or coalesce(char_length(btrim(p_worker ->> 'kelurahan')), 0) not between 1 and 100
    or coalesce(char_length(btrim(p_worker ->> 'kabupaten_kota')), 0) not between 1 and 100
    or char_length(p_worker ->> 'nama_panggilan') > 60 or char_length(v_bio) > 200
    or v_daily is null or v_daily < 1 or v_hourly < 1 or v_years not between 0 and 100
    or v_gender not in ('perempuan', 'laki-laki') or v_birth > (now() at time zone 'Asia/Jakarta')::date
    or v_verified is null or v_available is null
  then raise exception 'Invalid worker details' using errcode = '22023'; end if;

  if jsonb_typeof(p_portfolios) is distinct from 'array' or jsonb_array_length(p_portfolios) > 3
    or jsonb_typeof(p_worker -> 'keahlian') is distinct from 'array'
    or p_upload_folder is null or p_upload_folder !~ ('^' || v_admin::text || '/[0-9a-f-]{36}$')
    or p_public_base is null or p_public_base !~ '^https?://[a-zA-Z0-9.:-]+/storage/v1/object/public/worker-public-media$'
  then raise exception 'Invalid worker media or skills' using errcode = '22023'; end if;

  select coalesce(array_agg(distinct btrim(skill)), '{}'::text[]) into v_skills
    from jsonb_array_elements_text(p_worker -> 'keahlian') as skill
    where char_length(btrim(skill)) between 1 and 100;

  if p_profile_path is not null and (p_profile_path !~ ('^' || p_upload_folder || '/profil\.(jpg|png|webp)$')
    or not exists (select 1 from storage.objects where bucket_id = 'worker-public-media' and name = p_profile_path))
  then raise exception 'Invalid profile photo' using errcode = '22023'; end if;
  if p_ktp_path is not null and (p_ktp_path !~ ('^' || p_upload_folder || '/ktp\.(jpg|png|webp)$')
    or not exists (select 1 from storage.objects where bucket_id = 'worker-private-ktp' and name = p_ktp_path))
  then raise exception 'Invalid KTP photo' using errcode = '22023'; end if;

  -- Serialize checks for the same number across concurrent admin submissions.
  perform pg_advisory_xact_lock(71411, hashtext(v_phone));
  if worker_intake_private.phone_exists(v_phone) then
    raise exception 'WhatsApp number already registered' using errcode = 'RW001';
  end if;

  loop
    insert into public.workers (
      nama, kategori, kecamatan, tarif_harian, no_wa, is_verified, is_available, deskripsi, pengalaman,
      keahlian, portofolio, slug, nama_panggilan, jenis_kelamin, tanggal_lahir, foto_profil_url,
      kelurahan, kabupaten_kota, tarif_per_jam, pengalaman_tahun
    ) values (
      v_name, btrim(p_worker ->> 'kategori_utama'), btrim(p_worker ->> 'kecamatan'), v_daily, v_phone,
      v_verified, v_available, v_bio, case when v_years is not null then v_years || ' tahun' end,
      v_skills, nullif(btrim(p_portfolios -> 0 ->> 'title'), ''), v_slug,
      nullif(btrim(p_worker ->> 'nama_panggilan'), ''), v_gender, v_birth,
      case when p_profile_path is not null then p_public_base || '/' || p_profile_path end,
      btrim(p_worker ->> 'kelurahan'), btrim(p_worker ->> 'kabupaten_kota'), v_hourly, v_years
    ) on conflict (slug) do nothing returning id into v_worker_id;
    exit when v_worker_id is not null;
    v_suffix := v_suffix + 1;
    v_slug := v_base_slug || '-' || v_suffix;
  end loop;

  insert into public.worker_skills (worker_id, skill)
    select v_worker_id, unnest(v_skills);
  for v_item in select value from jsonb_array_elements(p_portfolios) loop
    v_position := v_position + 1;
    v_title := btrim(v_item ->> 'title');
    v_path := v_item ->> 'path';
    if coalesce(char_length(v_title), 0) not between 1 and 120 or v_path is null
      or v_path !~ ('^' || p_upload_folder || '/portofolio-' || v_position || '\.(jpg|png|webp)$')
      or not exists (select 1 from storage.objects where bucket_id = 'worker-public-media' and name = v_path)
    then raise exception 'Invalid portfolio item' using errcode = '22023'; end if;
    insert into public.worker_portfolios (worker_id, position, title, media_url)
      values (v_worker_id, v_position, v_title, p_public_base || '/' || v_path);
  end loop;

  insert into public.worker_verifications (worker_id, foto_ktp_path, izin_sebar_nomor, test_called_at, recorded_by)
    values (v_worker_id, p_ktp_path, true, case when v_verified then now() end, v_admin);
  return v_slug;
end;
$$;

create function public.admin_worker_phone_exists(p_no_wa text)
returns boolean language sql stable security invoker set search_path = '' as $$
  select worker_intake_private.phone_exists(p_no_wa)
$$;

create function public.admin_create_worker(
  p_worker jsonb, p_upload_folder text, p_profile_path text, p_ktp_path text,
  p_portfolios jsonb, p_public_base text
) returns text language sql security invoker set search_path = '' as $$
  select worker_intake_private.create_worker(p_worker, p_upload_folder, p_profile_path, p_ktp_path, p_portfolios, p_public_base)
$$;

revoke all on all functions in schema worker_intake_private from public, anon, authenticated;
grant execute on function worker_intake_private.phone_exists(text),
  worker_intake_private.create_worker(jsonb,text,text,text,jsonb,text) to authenticated;
revoke all on function public.admin_worker_phone_exists(text),
  public.admin_create_worker(jsonb,text,text,text,jsonb,text) from public, anon, authenticated;
grant execute on function public.admin_worker_phone_exists(text),
  public.admin_create_worker(jsonb,text,text,text,jsonb,text) to authenticated;

grant select (foto_profil_url) on public.workers to anon, authenticated;
create or replace view public.workers_directory with (security_invoker = true) as
select id,nama,kategori,kecamatan,tarif_harian,is_verified,is_available,rating,total_job,
       deskripsi,pengalaman,keahlian,portofolio,reviews,foto_profil_url from public.workers;

notify pgrst, 'reload schema';
commit;
