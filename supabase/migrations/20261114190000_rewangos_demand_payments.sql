-- RewangOS buyer, credit, and payment schema.
-- Existing workers.id remains bigint; public contact numbers are exposed only after an unlock.

-- Six worker-side tables complement public.workers and preserve the current directory model.
create table if not exists public.worker_accounts (
  worker_id bigint primary key references public.workers(id) on delete cascade,
  user_id uuid unique references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists public.worker_skills (
  id uuid primary key default gen_random_uuid(),
  worker_id bigint not null references public.workers(id) on delete cascade,
  skill text not null,
  created_at timestamptz not null default now(), unique (worker_id, skill)
);
create table if not exists public.worker_portfolio_items (
  id uuid primary key default gen_random_uuid(),
  worker_id bigint not null references public.workers(id) on delete cascade,
  title text not null, description text, media_url text,
  created_at timestamptz not null default now()
);
create table if not exists public.worker_availability (
  id uuid primary key default gen_random_uuid(),
  worker_id bigint not null references public.workers(id) on delete cascade,
  starts_at timestamptz not null, ends_at timestamptz not null,
  is_available boolean not null default true,
  created_at timestamptz not null default now(), check (ends_at > starts_at)
);
create table if not exists public.worker_reviews (
  id uuid primary key default gen_random_uuid(),
  worker_id bigint not null references public.workers(id) on delete cascade,
  buyer_id uuid, author_name text not null, author_area text, review_text text not null,
  stars smallint not null check (stars between 1 and 5),
  created_at timestamptz not null default now()
);
create table if not exists public.worker_reports (
  id uuid primary key default gen_random_uuid(),
  worker_id bigint not null references public.workers(id) on delete cascade,
  reporter_id uuid references auth.users(id) on delete set null,
  reason text not null, details text,
  status text not null default 'pending' check (status in ('pending','reviewed','dismissed')),
  created_at timestamptz not null default now(), resolved_at timestamptz
);

create table if not exists public.buyers (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null, nama text, no_wa text, kecamatan text,
  tipe_buyer text not null default 'perorangan'
    check (tipe_buyer in ('perorangan','usaha','eo','kontraktor')),
  total_transaksi integer not null default 0 check (total_transaksi >= 0),
  created_at timestamptz not null default now()
);
create table if not exists public.credit_packages (
  id text primary key, nama_paket text not null,
  jumlah_kredit integer not null check (jumlah_kredit > 0),
  harga integer not null check (harga > 0),
  harga_per_kontak integer not null check (harga_per_kontak > 0),
  label text, is_active boolean not null default true
);
insert into public.credit_packages (id, nama_paket, jumlah_kredit, harga, harga_per_kontak, label)
values ('satuan','Paket Satuan',1,9900,9900,'Coba Dulu'),
       ('hemat','Paket Hemat',5,29000,5800,'Prioritas Uji'),
       ('usaha','Paket Usaha',20,79000,3950,'Paling Hemat')
on conflict (id) do update set nama_paket=excluded.nama_paket,
  jumlah_kredit=excluded.jumlah_kredit, harga=excluded.harga,
  harga_per_kontak=excluded.harga_per_kontak, label=excluded.label;

create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(), order_id text not null unique,
  buyer_id uuid not null references public.buyers(id) on delete restrict,
  package_id text references public.credit_packages(id) on delete set null,
  jumlah_kredit_dibeli integer not null check (jumlah_kredit_dibeli > 0),
  harga_total integer not null check (harga_total > 0),
  status text not null default 'pending' check (status in ('pending','paid','failed','expired')),
  snap_token text, payment_type text, paid_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.unlocked_contacts (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references public.buyers(id) on delete restrict,
  worker_id bigint not null references public.workers(id) on delete restrict,
  purchase_id uuid references public.purchases(id) on delete set null,
  kredit_terpakai integer not null default 1 check (kredit_terpakai = 1),
  no_wa_terbuka text not null, unlocked_at timestamptz not null default now(),
  garansi_sampai timestamptz not null default (now() + interval '24 hours'),
  status text not null default 'active' check (status in ('active','reported','refunded')),
  sudah_chat boolean not null default false, unique (buyer_id, worker_id)
);
create table if not exists public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references public.buyers(id) on delete restrict,
  purchase_id uuid references public.purchases(id) on delete restrict,
  unlocked_id uuid references public.unlocked_contacts(id) on delete restrict,
  tipe text not null check (tipe in ('masuk','keluar','refund')),
  jumlah integer not null check ((tipe='masuk' and jumlah>0) or (tipe='keluar' and jumlah<0) or (tipe='refund' and jumlah>0)),
  saldo_setelah integer not null check (saldo_setelah >= 0),
  keterangan text not null, created_at timestamptz not null default now()
);
create table if not exists public.buyer_reports (
  id uuid primary key default gen_random_uuid(),
  unlocked_id uuid not null references public.unlocked_contacts(id) on delete restrict,
  buyer_id uuid not null references public.buyers(id) on delete restrict,
  alasan text not null check (alasan in ('nomor_tidak_aktif','pekerja_menolak','nomor_salah')),
  bukti_chat text, status text not null default 'pending' check (status in ('pending','approved','rejected')),
  kredit_dikembalikan boolean not null default false,
  resolved_at timestamptz, created_at timestamptz not null default now()
);

create index if not exists idx_ledger_buyer_created on public.credit_ledger (buyer_id, created_at desc);
create index if not exists idx_unlocked_buyer_worker on public.unlocked_contacts (buyer_id, worker_id);
create index if not exists idx_purchases_buyer_status on public.purchases (buyer_id, status);
create unique index if not exists idx_ledger_paid_purchase_once on public.credit_ledger (purchase_id)
  where tipe='masuk' and purchase_id is not null;
create unique index if not exists idx_ledger_refund_once on public.credit_ledger (unlocked_id)
  where tipe='refund' and unlocked_id is not null;
create unique index if not exists idx_buyer_report_open_once on public.buyer_reports (unlocked_id)
  where status='pending';

create or replace function public.sync_buyer_from_auth_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.email is not null then
    insert into public.buyers (id,email,nama)
    values (new.id,new.email,nullif(new.raw_user_meta_data ->> 'name',''))
    on conflict (id) do update set email=excluded.email;
  end if;
  return new;
end;
$$;
drop trigger if exists on_auth_user_buyer_created on auth.users;
drop trigger if exists on_auth_user_buyer_email_updated on auth.users;
create trigger on_auth_user_buyer_created after insert on auth.users
for each row execute function public.sync_buyer_from_auth_user();
create trigger on_auth_user_buyer_email_updated after update of email on auth.users
for each row execute function public.sync_buyer_from_auth_user();

create or replace function public.create_pending_purchase(p_package_id text, p_order_id text)
returns public.purchases language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid := auth.uid(); v_package public.credit_packages; v_purchase public.purchases;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if p_order_id !~ '^RWG-[0-9]{8}-[A-Fa-f0-9-]{8,36}$' then raise exception 'Invalid order id'; end if;
  select * into v_package from public.credit_packages where id=p_package_id and is_active;
  if not found then raise exception 'Package unavailable'; end if;
  if not exists (select 1 from public.buyers where id=v_user_id) then raise exception 'Buyer profile not found'; end if;
  insert into public.purchases (order_id,buyer_id,package_id,jumlah_kredit_dibeli,harga_total)
  values (p_order_id,v_user_id,v_package.id,v_package.jumlah_kredit,v_package.harga)
  returning * into v_purchase;
  return v_purchase;
end;
$$;

create or replace function public.unlock_worker_contact(p_worker_id bigint)
returns public.unlocked_contacts language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid(); v_existing public.unlocked_contacts;
  v_worker public.workers; v_balance integer; v_unlocked public.unlocked_contacts;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  perform 1 from public.buyers where id=v_user_id for update;
  if not found then raise exception 'Buyer profile not found'; end if;
  select * into v_existing from public.unlocked_contacts where buyer_id=v_user_id and worker_id=p_worker_id;
  if found then return v_existing; end if;
  select * into v_worker from public.workers where id=p_worker_id;
  if not found then raise exception 'Worker not found'; end if;
  if coalesce(trim(v_worker.no_wa),'')='' then raise exception 'Worker has no contact number'; end if;
  select coalesce(sum(jumlah),0)::integer into v_balance from public.credit_ledger where buyer_id=v_user_id;
  if v_balance < 1 then raise exception 'Insufficient credits'; end if;
  insert into public.unlocked_contacts (buyer_id,worker_id,no_wa_terbuka)
  values (v_user_id,p_worker_id,v_worker.no_wa) returning * into v_unlocked;
  insert into public.credit_ledger (buyer_id,unlocked_id,tipe,jumlah,saldo_setelah,keterangan)
  values (v_user_id,v_unlocked.id,'keluar',-1,v_balance-1,'Buka kontak ' || v_worker.nama);
  return v_unlocked;
end;
$$;

create or replace function public.mark_contact_chatted(p_unlocked_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  update public.unlocked_contacts set sudah_chat=true
    where id=p_unlocked_id and buyer_id=auth.uid() and status='active';
  if not found then raise exception 'Contact not found'; end if;
end;
$$;

create or replace function public.submit_buyer_report(p_unlocked_id uuid,p_alasan text,p_bukti_chat text default null)
returns public.buyer_reports language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid:=auth.uid(); v_contact public.unlocked_contacts; v_report public.buyer_reports;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  select * into v_contact from public.unlocked_contacts
    where id=p_unlocked_id and buyer_id=v_user_id for update;
  if not found then raise exception 'Contact not found'; end if;
  if v_contact.status not in ('active','reported') or now()>v_contact.garansi_sampai then raise exception 'Warranty period has ended'; end if;
  insert into public.buyer_reports (unlocked_id,buyer_id,alasan,bukti_chat)
  values (p_unlocked_id,v_user_id,p_alasan,nullif(trim(p_bukti_chat),'')) returning * into v_report;
  update public.unlocked_contacts set status='reported' where id=p_unlocked_id;
  return v_report;
end;
$$;

create or replace function public.resolve_buyer_report(p_report_id uuid,p_approved boolean)
returns public.buyer_reports language plpgsql security definer set search_path = '' as $$
declare v_report public.buyer_reports; v_contact public.unlocked_contacts; v_balance integer;
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role','') <> 'admin' then raise exception 'Admin role required'; end if;
  select * into v_report from public.buyer_reports where id=p_report_id for update;
  if not found then raise exception 'Report not found'; end if;
  if v_report.status <> 'pending' then return v_report; end if;
  select * into v_contact from public.unlocked_contacts where id=v_report.unlocked_id for update;
  if p_approved then
    if v_report.created_at>v_contact.garansi_sampai then raise exception 'Report was filed after the warranty period'; end if;
    perform 1 from public.buyers where id=v_report.buyer_id for update;
    select coalesce(sum(jumlah),0)::integer into v_balance from public.credit_ledger where buyer_id=v_report.buyer_id;
    update public.unlocked_contacts set status='refunded' where id=v_contact.id;
    insert into public.credit_ledger (buyer_id,unlocked_id,tipe,jumlah,saldo_setelah,keterangan)
    values (v_report.buyer_id,v_contact.id,'refund',1,v_balance+1,'Refund klaim kontak');
    update public.buyer_reports set status='approved',kredit_dikembalikan=true,resolved_at=now()
      where id=p_report_id returning * into v_report;
  else
    update public.unlocked_contacts set status='active' where id=v_contact.id and status='reported';
    update public.buyer_reports set status='rejected',resolved_at=now()
      where id=p_report_id returning * into v_report;
  end if;
  return v_report;
end;
$$;

create or replace function public.apply_midtrans_notification(p_order_id text,p_gross_amount integer,p_status text,p_payment_type text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_purchase public.purchases; v_balance integer;
begin
  if coalesce(auth.jwt() ->> 'role','') <> 'service_role' then raise exception 'Service role required'; end if;
  select * into v_purchase from public.purchases where order_id=p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_purchase.harga_total <> p_gross_amount then raise exception 'Payment amount mismatch'; end if;
  if v_purchase.status='paid' or v_purchase.status<>'pending' then return; end if;
  if p_status not in ('paid','pending','failed','expired') then raise exception 'Invalid payment status'; end if;
  update public.purchases set status=p_status,payment_type=nullif(p_payment_type,''),
    paid_at=case when p_status='paid' then now() else paid_at end where id=v_purchase.id;
  if p_status='paid' then
    perform 1 from public.buyers where id=v_purchase.buyer_id for update;
    select coalesce(sum(jumlah),0)::integer into v_balance from public.credit_ledger where buyer_id=v_purchase.buyer_id;
    insert into public.credit_ledger (buyer_id,purchase_id,tipe,jumlah,saldo_setelah,keterangan)
    values (v_purchase.buyer_id,v_purchase.id,'masuk',v_purchase.jumlah_kredit_dibeli,
      v_balance+v_purchase.jumlah_kredit_dibeli,'Beli paket ' || coalesce(v_purchase.package_id,'kredit'))
    on conflict (purchase_id) where tipe='masuk' do nothing;
    update public.buyers set total_transaksi=total_transaksi+1 where id=v_purchase.buyer_id;
  end if;
end;
$$;

create or replace function public.get_buyer_balance()
returns integer language sql stable security invoker set search_path = '' as $$
  select coalesce(sum(jumlah),0)::integer from public.credit_ledger where buyer_id=auth.uid()
$$;

-- The base-table grants are column-scoped, so neither the view nor direct reads expose no_wa.
alter table public.workers enable row level security;
create or replace view public.workers_directory with (security_invoker = true) as
select id,nama,kategori,kecamatan,tarif_harian,is_verified,is_available,rating,total_job,
       deskripsi,pengalaman,keahlian,portofolio,reviews from public.workers;

do $$
declare t text;
begin
  foreach t in array array['buyers','credit_packages','purchases','credit_ledger','unlocked_contacts','buyer_reports',
    'worker_accounts','worker_skills','worker_portfolio_items','worker_availability','worker_reviews','worker_reports'] loop
    execute format('alter table public.%I enable row level security',t);
  end loop;
end;
$$;

revoke all on public.workers from anon,authenticated;
grant select (id,nama,kategori,kecamatan,tarif_harian,is_verified,is_available,rating,total_job,
  deskripsi,pengalaman,keahlian,portofolio,reviews) on public.workers to anon,authenticated;
grant select on public.workers_directory to anon,authenticated;
grant select on public.credit_packages to anon,authenticated;
grant select on public.buyers to authenticated;
revoke update on public.buyers from authenticated;
grant update (nama,no_wa,kecamatan,tipe_buyer) on public.buyers to authenticated;
grant select on public.purchases,public.credit_ledger,public.unlocked_contacts,public.buyer_reports to authenticated;
drop policy if exists buyers_read_own on public.buyers;
create policy buyers_read_own on public.buyers for select to authenticated using (id=(select auth.uid()));
drop policy if exists buyers_update_own on public.buyers;
create policy buyers_update_own on public.buyers for update to authenticated using (id=(select auth.uid())) with check (id=(select auth.uid()));
drop policy if exists packages_read_active on public.credit_packages;
create policy packages_read_active on public.credit_packages for select to anon,authenticated using (is_active);
drop policy if exists purchases_read_own on public.purchases;
create policy purchases_read_own on public.purchases for select to authenticated using (buyer_id=(select auth.uid()));
drop policy if exists ledger_read_own on public.credit_ledger;
create policy ledger_read_own on public.credit_ledger for select to authenticated using (buyer_id=(select auth.uid()));
drop policy if exists unlocked_read_own on public.unlocked_contacts;
create policy unlocked_read_own on public.unlocked_contacts for select to authenticated using (buyer_id=(select auth.uid()));
drop policy if exists reports_read_own on public.buyer_reports;
create policy reports_read_own on public.buyer_reports for select to authenticated using (buyer_id=(select auth.uid()));
drop policy if exists reports_read_admin on public.buyer_reports;
create policy reports_read_admin on public.buyer_reports for select to authenticated
  using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
drop policy if exists workers_read_directory on public.workers;
create policy workers_read_directory on public.workers for select to anon,authenticated using (true);
revoke all on public.worker_accounts,public.worker_skills,public.worker_portfolio_items,
  public.worker_availability,public.worker_reviews,public.worker_reports from anon,authenticated;

revoke all on function public.create_pending_purchase(text,text) from public,anon;
grant execute on function public.create_pending_purchase(text,text) to authenticated;
revoke all on function public.unlock_worker_contact(bigint) from public,anon;
grant execute on function public.unlock_worker_contact(bigint) to authenticated;
revoke all on function public.mark_contact_chatted(uuid) from public,anon;
grant execute on function public.mark_contact_chatted(uuid) to authenticated;
revoke all on function public.submit_buyer_report(uuid,text,text) from public,anon;
grant execute on function public.submit_buyer_report(uuid,text,text) to authenticated;
revoke all on function public.resolve_buyer_report(uuid,boolean) from public,anon,authenticated;
grant execute on function public.resolve_buyer_report(uuid,boolean) to authenticated;
revoke all on function public.apply_midtrans_notification(text,integer,text,text) from public,anon,authenticated;
grant execute on function public.apply_midtrans_notification(text,integer,text,text) to service_role;
revoke all on function public.get_buyer_balance() from public,anon;
grant execute on function public.get_buyer_balance() to authenticated;
revoke all on function public.sync_buyer_from_auth_user() from public,anon,authenticated;
