import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { Activity, BadgeCheck, BriefcaseBusiness, CircleHelp, CreditCard, LayoutDashboard, MessageCircle, Users, Wallet } from "lucide-react";
import { DashboardAuth, DashboardShell, type DashboardLink, type DashboardNavItem } from "./components/DashboardShell";
import { supabase } from "./lib/supabase";
import { WorkerListingConsent } from "./AdminWorkerInput";

type PageKey = "overview" | "orders" | "contacts" | "claims" | "profile" | "workers" | "payments";
type Purchase = { id?: string; order_id: string; buyer_email?: string; jumlah_kredit_dibeli: number; harga_total: number; status: string; payment_type?: string | null; paid_at?: string | null; created_at: string; snap_token?: string | null };
type Contact = { id: string; worker_id: number; no_wa_terbuka: string; unlocked_at: string; garansi_sampai: string; status: string; sudah_chat: boolean; worker_name?: string };
type Claim = { id: string; unlocked_id: string; alasan: string; bukti_chat?: string | null; status: string; created_at: string; resolved_at?: string | null; kredit_dikembalikan?: boolean };
type WorkerSummary = {
  worker_id: number; nama: string; kategori: string; kecamatan: string; tarif_harian: number;
  foto_profil_url: string | null; deskripsi: string | null; pengalaman_tahun: number | null; keahlian: string[] | null; portofolio: string | null;
  is_verified: boolean; is_available: boolean; listing_active: boolean;
  consent_recorded_at: string | null; consent_withdrawn_at: string | null;
  contact_opens: number; opens_last_30_days: number;
};
type AdminWorker = {
  worker_id: number; nama: string; kategori: string; is_available: boolean; listing_active: boolean;
  consent_recorded_at: string | null; consent_withdrawn_at: string | null;
  account_email: string | null; invited_email: string | null; contact_opens: number;
};
type AdminSummary = { paid_revenue: number; paid_orders: number; pending_orders: number; pending_reports: number; active_workers: number; contact_opens_30d: number };

const buyerNav: DashboardNavItem[] = [
  { id: "overview", label: "Ringkasan", icon: LayoutDashboard },
  { id: "orders", label: "Order kredit", icon: CreditCard },
  { id: "contacts", label: "Kontak dibuka", icon: MessageCircle },
  { id: "claims", label: "Klaim garansi", icon: CircleHelp },
];
const workerNav: DashboardNavItem[] = [
  { id: "overview", label: "Ringkasan", icon: LayoutDashboard },
  { id: "profile", label: "Profil saya", icon: BriefcaseBusiness },
];
const adminNav: DashboardNavItem[] = [
  { id: "overview", label: "Ringkasan", icon: LayoutDashboard },
  { id: "payments", label: "Transaksi", icon: CreditCard },
  { id: "claims", label: "Klaim garansi", icon: CircleHelp },
  { id: "workers", label: "Pekerja", icon: Users },
];

function useSession() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);
  return { user, loading };
}

function money(value: number) { return `Rp ${Number(value || 0).toLocaleString("id-ID")}`; }
function date(value?: string | null) { return value ? new Date(value).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) : "—"; }
function statusLabel(status: string) {
  const labels: Record<string, string> = { paid: "Lunas", pending: "Menunggu", failed: "Gagal", expired: "Kedaluwarsa", approved: "Disetujui", rejected: "Ditolak", active: "Aktif", reported: "Ditinjau", refunded: "Dikembalikan" };
  return labels[status] ?? status;
}
function signOut() { if (supabase) void supabase.auth.signOut(); }
function LoadingPanel() { return <div className="dashboard-state" role="status">Memuat data akun…</div>; }
function ErrorPanel({ children }: { children: string }) { return <p className="dashboard-error" role="alert">{children}</p>; }
function Empty({ children }: { children: string }) { return <p className="dashboard-empty">{children}</p>; }
function Kpi({ label, value, note, icon: Icon }: { label: string; value: string | number; note: string; icon: DashboardNavItem["icon"] }) {
  return <article className="dashboard-kpi"><span className="dashboard-kpi-icon"><Icon size={18} /></span><p>{label}</p><strong>{value}</strong><small>{note}</small></article>;
}
function Panel({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return <section className="dashboard-panel"><div className="dashboard-panel-heading"><h2>{title}</h2>{action}</div>{children}</section>;
}
function SwitcherLinks({ user, workerLinked, current }: { user: User; workerLinked?: boolean; current: "buyer" | "worker" | "admin" }): DashboardLink[] {
  const links: DashboardLink[] = [];
  if (current !== "buyer") links.push({ href: "/akun", label: "Dashboard buyer" });
  if (current !== "worker" && workerLinked) links.push({ href: "/pekerja", label: "Dashboard worker" });
  if (current !== "admin" && user.app_metadata?.role === "admin") links.push({ href: "/admin", label: "Dashboard admin" });
  return links;
}
function dashboardLayoutProps(user: User, current: "buyer" | "worker" | "admin", workerLinked?: boolean) {
  return { email: user.email ?? "", roleLinks: SwitcherLinks({ user, workerLinked, current }), onSignOut: signOut };
}

export function BuyerDashboard() {
  const { user, loading: sessionLoading } = useSession();
  if (sessionLoading) return <LoadingPanel />;
  if (!user) return <DashboardAuth title="Dashboard buyer" description="Masuk untuk melihat saldo, order kredit, kontak yang pernah dibuka, dan klaim garansi." />;
  return <BuyerAccount key={user.id} user={user} />;
}

function BuyerAccount({ user }: { user: User }) {
  const [active, setActive] = useState<PageKey>("overview");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [credits, setCredits] = useState(0);
  const [orders, setOrders] = useState<Purchase[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [workerLinked, setWorkerLinked] = useState(false);
  const [claimBusy, setClaimBusy] = useState(false);
  const refresh = useCallback(async () => {
    if (!supabase || !user) return;
    setLoading(true); setError("");
    const [balance, purchaseRows, contactRows, claimRows, workerAccess] = await Promise.all([
      supabase.rpc("get_buyer_balance"),
      supabase.from("purchases").select("id,order_id,jumlah_kredit_dibeli,harga_total,status,payment_type,paid_at,created_at,snap_token").eq("buyer_id", user.id).order("created_at", { ascending: false }).limit(50),
      supabase.from("unlocked_contacts").select("id,worker_id,no_wa_terbuka,unlocked_at,garansi_sampai,status,sudah_chat").eq("buyer_id", user.id).order("unlocked_at", { ascending: false }).limit(50),
      supabase.from("buyer_reports").select("id,unlocked_id,alasan,bukti_chat,status,created_at,resolved_at,kredit_dikembalikan").eq("buyer_id", user.id).order("created_at", { ascending: false }).limit(50),
      supabase.rpc("worker_dashboard"),
    ]);
    const failed = balance.error ?? purchaseRows.error ?? contactRows.error ?? claimRows.error;
    if (failed) setError("Data akun belum bisa dimuat. Muat ulang halaman atau hubungi admin.");
    else {
      setCredits(Number(balance.data ?? 0));
      setOrders((purchaseRows.data ?? []) as Purchase[]);
      setClaims((claimRows.data ?? []) as Claim[]);
      const rows = (contactRows.data ?? []) as Contact[];
      if (rows.length) {
        const { data: workerNames } = await supabase.from("workers_directory").select("id,nama").in("id", rows.map(row => row.worker_id));
        const names = new Map((workerNames ?? []).map(row => [Number(row.id), row.nama]));
        setContacts(rows.map(row => ({ ...row, worker_name: names.get(row.worker_id) ?? "Profil pekerja" })));
      } else setContacts([]);
      setWorkerLinked(Boolean(workerAccess.data && (workerAccess.data as WorkerSummary[]).length));
    }
    setLoading(false);
  }, [user]);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const clientKey = import.meta.env.VITE_MIDTRANS_CLIENT_KEY?.trim();
    if (!clientKey || document.querySelector('script[data-rewang-snap="true"]')) return;
    const script = document.createElement("script");
    script.src = "https://app.sandbox.midtrans.com/snap/snap.js"; script.dataset.clientKey = clientKey; script.dataset.rewangSnap = "true"; script.async = true;
    document.body.appendChild(script);
  }, []);

  const openClaims = claims.filter(claim => claim.status === "pending").length;
  const paidTotal = orders.filter(order => order.status === "paid").reduce((total, order) => total + Number(order.harga_total), 0);
  const resume = (order: Purchase) => {
    if (!order.snap_token || !window.snap) { setError("Checkout belum tersedia. Muat ulang halaman beberapa saat lagi."); return; }
    window.snap.pay(order.snap_token, { onSuccess: () => void refresh(), onPending: () => void refresh(), onError: () => setError("Pembayaran gagal diproses."), onClose: () => void refresh() });
  };
  async function submitClaim(unlockedId: string, reason: string, evidence: string) {
    if (!supabase || claimBusy) return;
    setClaimBusy(true); setError("");
    const { error: submitError } = await supabase.rpc("submit_buyer_report", {
      p_unlocked_id: unlockedId, p_alasan: reason, p_bukti_chat: evidence.trim() || null,
    });
    if (submitError) setError("Klaim belum dapat dikirim. Pastikan masa garansi masih berlaku dan belum ada klaim aktif.");
    else await refresh();
    setClaimBusy(false);
  }
  return <DashboardShell {...dashboardLayoutProps(user, "buyer", workerLinked)} title="Akun buyer" subtitle="Saldo, pembelian kredit, dan kontak yang sudah Anda buka." active={active} items={buyerNav} onNavigate={id => setActive(id as PageKey)}>
    <div className="dashboard-page-heading"><div><span className="dashboard-kicker">AKUN PENCARI KERJA</span><h2>{active === "overview" ? "Ringkasan akun" : buyerNav.find(item => item.id === active)?.label}</h2><p>Data akun Anda tersimpan bersama riwayat transaksi di RewangOS.</p></div><div className="dashboard-heading-actions"><a className="dashboard-outline" href="/">Cari pekerja</a><a className="dashboard-primary dashboard-primary--auto" href="/?beli-kredit=1">Beli kredit</a></div></div>
    {error && <ErrorPanel>{error}</ErrorPanel>}{loading && <LoadingPanel />}
    {active === "overview" && !loading && <>
      <div className="dashboard-kpi-grid">
        <Kpi label="Saldo kredit" value={`${credits} kredit`} note="Satu kredit membuka satu kontak" icon={Wallet} />
        <Kpi label="Order lunas" value={orders.filter(order => order.status === "paid").length} note={`Total pembelian ${money(paidTotal)}`} icon={CreditCard} />
        <Kpi label="Kontak dibuka" value={contacts.length} note="Riwayat milik akun ini" icon={MessageCircle} />
        <Kpi label="Klaim menunggu" value={openClaims} note="Garansi kontak 24 jam" icon={CircleHelp} />
      </div>
      <Panel title="Order terbaru" action={<button className="dashboard-text-button" onClick={() => setActive("orders")}>Semua order</button>}>
        <PurchaseList orders={orders.slice(0, 5)} onResume={resume} />
      </Panel>
      <Panel title="Kontak terakhir" action={<button className="dashboard-text-button" onClick={() => setActive("contacts")}>Semua kontak</button>}>
        <ContactList contacts={contacts.slice(0, 4)} />
      </Panel>
    </>}
    {active === "orders" && !loading && <Panel title="Riwayat order kredit"><PurchaseList orders={orders} onResume={resume} /></Panel>}
    {active === "contacts" && !loading && <Panel title="Kontak yang pernah dibuka"><ContactList contacts={contacts} /></Panel>}
    {active === "claims" && !loading && <Panel title="Klaim garansi"><BuyerClaims claims={claims} contacts={contacts} busy={claimBusy} onSubmit={submitClaim} /></Panel>}
  </DashboardShell>;
}

function PurchaseList({ orders, onResume }: { orders: Purchase[]; onResume: (order: Purchase) => void }) {
  if (!orders.length) return <Empty>Belum ada order kredit di akun ini.</Empty>;
  return <div className="dashboard-record-list">{orders.map(order => <article className="dashboard-record" key={order.order_id}>
    <div className="dashboard-record-main"><strong>{order.jumlah_kredit_dibeli} kredit <span>· {money(order.harga_total)}</span></strong><small>{order.order_id} · {date(order.created_at)}</small></div>
    <div className="dashboard-record-side"><span className={`dashboard-status status-${order.status}`}>{statusLabel(order.status)}</span>{order.payment_type && <small>{order.payment_type}</small>}{order.status === "pending" && order.snap_token && <button className="dashboard-mini-button" onClick={() => onResume(order)}>Lanjut bayar</button>}</div>
  </article>)}</div>;
}
function ContactList({ contacts }: { contacts: Contact[] }) {
  if (!contacts.length) return <Empty>Kontak yang Anda buka akan tampil di sini.</Empty>;
  return <div className="dashboard-record-list">{contacts.map(contact => <article className="dashboard-record" key={contact.id}>
    <div className="dashboard-record-main"><strong>{contact.worker_name}</strong><small>Dibuka {date(contact.unlocked_at)} · Garansi sampai {date(contact.garansi_sampai)}</small></div>
    <div className="dashboard-record-side"><span className={`dashboard-status status-${contact.status}`}>{statusLabel(contact.status)}</span><a className="dashboard-mini-button" href={`https://wa.me/${contact.no_wa_terbuka.replace(/\D/g, "").replace(/^0/, "62")}`} target="_blank" rel="noopener noreferrer">Buka WhatsApp</a></div>
  </article>)}</div>;
}
function ClaimList({ claims }: { claims: Claim[] }) {
  if (!claims.length) return <Empty>Belum ada klaim garansi dari akun ini.</Empty>;
  return <div className="dashboard-record-list">{claims.map(claim => <article className="dashboard-record" key={claim.id}>
    <div className="dashboard-record-main"><strong>{claim.alasan.replaceAll("_", " ")}</strong><small>Dikirim {date(claim.created_at)}{claim.resolved_at ? ` · Diproses ${date(claim.resolved_at)}` : ""}</small></div>
    <div className="dashboard-record-side"><span className={`dashboard-status status-${claim.status}`}>{statusLabel(claim.status)}</span>{claim.kredit_dikembalikan && <small>1 kredit dikembalikan</small>}</div>
  </article>)}</div>;
}
function BuyerClaims({ claims, contacts, busy, onSubmit }: {
  claims: Claim[]; contacts: Contact[]; busy: boolean; onSubmit: (unlockedId: string, reason: string, evidence: string) => void;
}) {
  const [formFor, setFormFor] = useState<string | null>(null);
  const [reason, setReason] = useState("nomor_tidak_aktif");
  const [evidence, setEvidence] = useState("");
  const existing = new Set(claims.filter(claim => claim.status === "pending").map(claim => claim.unlocked_id));
  const eligible = contacts.filter(contact => contact.status === "active" && Date.now() <= Date.parse(contact.garansi_sampai) && !existing.has(contact.id));
  function submit(event: FormEvent<HTMLFormElement>, unlockedId: string) {
    event.preventDefault(); onSubmit(unlockedId, reason, evidence);
    setFormFor(null); setEvidence("");
  }
  return <>
    <ClaimList claims={claims} />
    {eligible.length > 0 && <div className="dashboard-claim-entry"><h3>Laporkan masalah kontak</h3><p>Klaim tersedia sampai 24 jam setelah kontak dibuka. Admin meninjau laporan sebelum kredit dikembalikan.</p>{eligible.map(contact => <div className="dashboard-claim-contact" key={contact.id}><div><strong>{contact.worker_name}</strong><small>Garansi sampai {date(contact.garansi_sampai)}</small></div>{formFor === contact.id ? <form onSubmit={event => submit(event, contact.id)}><label>Alasan<select value={reason} onChange={event => setReason(event.target.value)}><option value="nomor_tidak_aktif">Nomor tidak aktif</option><option value="pekerja_menolak">Worker menolak dihubungi</option><option value="nomor_salah">Nomor salah</option></select></label><label>Bukti atau catatan (opsional)<textarea rows={3} maxLength={2000} value={evidence} onChange={event => setEvidence(event.target.value)} placeholder="Catatan singkat atau tautan bukti" /></label><div className="dashboard-action-row"><button className="dashboard-mini-button" disabled={busy}>Kirim klaim</button><button type="button" className="dashboard-mini-button is-muted" onClick={() => { setFormFor(null); setEvidence(""); }}>Batal</button></div></form> : <button className="dashboard-mini-button is-muted" onClick={() => { setFormFor(contact.id); setReason("nomor_tidak_aktif"); }}>Laporkan</button>}</div>)}</div>}
  </>;
}

export function WorkerDashboard() {
  const { user, loading: sessionLoading } = useSession();
  if (sessionLoading) return <LoadingPanel />;
  if (!user) return <DashboardAuth title="Dashboard worker" description="Masuk memakai email yang menerima undangan dari admin RewangOS." />;
  return <WorkerAccount key={user.id} user={user} />;
}

function WorkerAccount({ user }: { user: User }) {
  const [active, setActive] = useState<PageKey>("overview");
  const [worker, setWorker] = useState<WorkerSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    if (!supabase || !user) return;
    setLoading(true); setError("");
    // An invitation is accepted only after Supabase confirms the email address.
    await supabase.rpc("accept_worker_invite");
    const { data, error: loadError } = await supabase.rpc("worker_dashboard");
    if (loadError) setError("Profil worker belum dapat dimuat. Pastikan Anda membuka tautan undangan dengan email yang sama.");
    else setWorker(((data ?? []) as WorkerSummary[])[0] ?? null);
    setLoading(false);
  }, [user]);
  useEffect(() => { void refresh(); }, [refresh]);
  async function toggleAvailability() {
    if (!supabase || !worker || busy) return;
    setBusy(true); setMessage(""); setError("");
    const { error: updateError } = await supabase.rpc("worker_set_availability", { p_is_available: !worker.is_available });
    if (updateError) setError(updateError.message.includes("consent") ? "Ketersediaan aktif setelah listing dan izin tampil disetujui admin." : "Status ketersediaan belum bisa diubah.");
    else { setWorker(current => current ? { ...current, is_available: !current.is_available } : current); setMessage("Ketersediaan berhasil diperbarui."); }
    setBusy(false);
  }
  return <DashboardShell {...dashboardLayoutProps(user, "worker")} title="Ruang worker" subtitle="Status listing dan ketersediaan profil Anda." active={active} items={workerNav} onNavigate={id => setActive(id as PageKey)}>
    <div className="dashboard-page-heading"><div><span className="dashboard-kicker">RUANG WORKER</span><h2>{active === "overview" ? "Ringkasan profil" : "Profil saya"}</h2><p>Kelola ketersediaan dan lihat ringkasan kontak profil Anda.</p></div><a className="dashboard-outline" href="/">Lihat direktori</a></div>
    {message && <p className="dashboard-success" role="status">{message}</p>}{error && <ErrorPanel>{error}</ErrorPanel>}{loading && <LoadingPanel />}
    {!loading && !worker && <section className="dashboard-panel dashboard-invitation"><span className="dashboard-kicker">AKSES WORKER</span><h2>Profil belum terhubung</h2><p>Akses dashboard aktif setelah admin mengundang email akun ini dan email tersebut diverifikasi. Jika baru menerima undangan, buka tautan dari kotak masuk Anda.</p><p>Jika tautan undangan bermasalah, hubungi admin yang mengirimkannya.</p></section>}
    {!loading && worker && active === "overview" && <>
      <section className="worker-profile-banner">{worker.foto_profil_url ? <img className="worker-avatar worker-avatar--photo" src={worker.foto_profil_url} alt={`Foto ${worker.nama}`} /> : <div className="worker-avatar">{worker.nama.split(/\s+/).slice(0,2).map(part => part[0]).join("").toUpperCase()}</div>}<div className="worker-banner-copy"><span className="dashboard-kicker">PROFIL DIREKTORI</span><h2>{worker.nama}</h2><p>{worker.kategori} · {worker.kecamatan} · {money(worker.tarif_harian)} / hari</p></div><span className={`dashboard-status ${worker.listing_active ? "status-active" : "status-pending"}`}>{worker.listing_active ? "Tampil di direktori" : "Belum tampil"}</span></section>
      <div className="dashboard-kpi-grid dashboard-kpi-grid--worker">
        <Kpi label="Kontak dibuka" value={worker.contact_opens} note="Total profil Anda dibuka" icon={MessageCircle} />
        <Kpi label="30 hari terakhir" value={worker.opens_last_30_days} note="Kontak dibuka dalam periode ini" icon={Activity} />
        <Kpi label="Verifikasi" value={worker.is_verified ? "Test call tercatat" : "Belum diverifikasi"} note="Dicatat oleh admin" icon={BadgeCheck} />
      </div>
      <Panel title="Ketersediaan"><div className="availability-control"><div><strong>{worker.is_available ? "Open Job" : "Busy"}</strong><p>{worker.is_available ? "Profil Anda siap menerima pertanyaan lewat WhatsApp." : "Profil tetap tampil, tetapi status memberi tahu bahwa Anda sedang tidak tersedia."}</p></div><button className={worker.is_available ? "dashboard-toggle is-on" : "dashboard-toggle"} role="switch" aria-checked={worker.is_available} aria-label="Ketersediaan kerja" disabled={busy || !worker.listing_active || !worker.consent_recorded_at || Boolean(worker.consent_withdrawn_at)} onClick={() => void toggleAvailability()}><span /></button></div></Panel>
      <Panel title="Izin dan listing"><div className="dashboard-record-list"><div className="dashboard-record"><div className="dashboard-record-main"><strong>Formulir persetujuan</strong><small>{worker.consent_withdrawn_at ? `Izin ditarik · ${date(worker.consent_withdrawn_at)}` : worker.consent_recorded_at ? `Tercatat · ${date(worker.consent_recorded_at)}` : "Belum tercatat"}</small></div><span className={`dashboard-status ${worker.consent_withdrawn_at || !worker.consent_recorded_at ? "status-pending" : "status-active"}`}>{worker.consent_withdrawn_at ? "Izin ditarik" : worker.consent_recorded_at ? "Aktif" : "Perlu ditinjau"}</span></div></div></Panel>
    </>}
    {!loading && worker && active === "profile" && <Panel title="Pratinjau profil"><div className="worker-preview">{worker.foto_profil_url ? <img className="worker-preview-avatar" src={worker.foto_profil_url} alt={`Foto ${worker.nama}`} /> : <span className="worker-preview-avatar">{worker.nama.split(/\s+/).slice(0,2).map(part => part[0]).join("").toUpperCase()}</span>}<div><h3>{worker.nama}</h3><p>{worker.kategori} · {worker.kecamatan}</p><strong>{money(worker.tarif_harian)} / hari{worker.pengalaman_tahun ? ` · ${worker.pengalaman_tahun} tahun pengalaman` : ""}</strong>{worker.deskripsi && <p>{worker.deskripsi}</p>}{Boolean(worker.keahlian?.length) && <div className="worker-skill-list">{worker.keahlian?.map(skill => <span key={skill}>{skill}</span>)}</div>}{worker.portofolio && <p className="worker-preview-note">Portofolio: {worker.portofolio}</p>}<p className="worker-preview-note">Untuk mengubah biodata atau foto, hubungi admin yang mendaftarkan profil ini agar perubahan tetap sesuai persetujuan yang tersimpan.</p></div></div></Panel>}
  </DashboardShell>;
}

export function AdminDashboard() {
  const { user, loading: sessionLoading } = useSession();
  if (sessionLoading) return <LoadingPanel />;
  if (!user) return <DashboardAuth title="Dashboard admin" description="Masuk menggunakan email admin RewangOS." shouldCreateUser={false} />;
  if (user.app_metadata?.role !== "admin") return <div className="dashboard-auth-page"><a className="dashboard-brand" href="/"><span className="dashboard-brand-mark"><LayoutDashboard size={19}/></span><span className="dashboard-brand-word">RewangOS</span></a><section className="dashboard-auth-card"><span className="dashboard-kicker">AKSES TERBATAS</span><h1>Akses admin diperlukan</h1><p>Akun {user.email} tidak memiliki peran admin. Gunakan akun admin RewangOS untuk membuka halaman ini.</p><div className="dashboard-heading-actions"><a className="dashboard-outline" href="/akun">Dashboard buyer</a><button className="dashboard-primary dashboard-primary--auto" onClick={signOut}>Keluar</button></div></section></div>;
  return <AdminAccount key={user.id} user={user} />;
}

function AdminAccount({ user }: { user: User }) {
  const [active, setActive] = useState<PageKey>("overview");
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [workers, setWorkers] = useState<AdminWorker[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [reports, setReports] = useState<Claim[]>([]);
  const [workerLinked, setWorkerLinked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<number | string | null>(null);
  const [inviteEmails, setInviteEmails] = useState<Record<number, string>>({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    if (!supabase || !user || user.app_metadata?.role !== "admin") return;
    setLoading(true); setError("");
    const [summaryResult, workerResult, purchaseResult, reportResult] = await Promise.all([
      supabase.rpc("admin_dashboard_summary"), supabase.rpc("admin_list_dashboard_workers"),
      supabase.rpc("admin_list_dashboard_purchases"),
      supabase.from("buyer_reports").select("id,unlocked_id,alasan,bukti_chat,status,created_at,resolved_at,kredit_dikembalikan").order("created_at", { ascending: false }).limit(100),
    ]);
    const failed = summaryResult.error ?? workerResult.error ?? purchaseResult.error ?? reportResult.error;
    if (failed) setError("Data admin belum bisa dimuat. Pastikan migrasi dashboard sudah diterapkan.");
    else {
      setSummary(((summaryResult.data ?? []) as AdminSummary[])[0] ?? null);
      setWorkers((workerResult.data ?? []) as AdminWorker[]);
      setPurchases((purchaseResult.data ?? []) as Purchase[]);
      setReports((reportResult.data ?? []) as Claim[]);
      const { data: ownWorker } = await supabase.rpc("worker_dashboard");
      setWorkerLinked(Boolean(ownWorker && (ownWorker as WorkerSummary[]).length));
    }
    setLoading(false);
  }, [user]);
  useEffect(() => { void refresh(); }, [refresh]);
  async function invite(worker: AdminWorker) {
    const email = (inviteEmails[worker.worker_id]?.trim() || worker.invited_email || "").trim().toLowerCase();
    if (!supabase || !email) return;
    setBusyId(worker.worker_id); setError(""); setMessage("");
    const { error: inviteError } = await supabase.rpc("admin_invite_worker", { p_worker_id: worker.worker_id, p_email: email });
    if (inviteError) { setError(inviteError.message.includes("consent") || inviteError.message.includes("active") ? "Hanya Worker dengan listing dan izin aktif yang dapat diundang." : "Undangan belum dapat disimpan."); setBusyId(null); return; }
    const { error: mailError } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: `${location.origin}/pekerja` } });
    if (mailError) setError("Undangan tersimpan, tetapi email belum terkirim. Tekan kirim ulang untuk mencoba lagi.");
    else setMessage(`Tautan verifikasi dikirim ke ${email}.`);
    await refresh(); setBusyId(null);
  }
  async function setAvailability(worker: AdminWorker) {
    if (!supabase) return;
    setBusyId(worker.worker_id); setError(""); setMessage("");
    const { error: updateError } = await supabase.rpc("admin_set_worker_availability", { p_worker_id: worker.worker_id, p_is_available: !worker.is_available });
    if (updateError) setError("Ketersediaan Worker belum dapat diperbarui.");
    else { setMessage(`Status ${worker.nama} diperbarui.`); await refresh(); }
    setBusyId(null);
  }
  async function resolve(claim: Claim, approved: boolean) {
    if (!supabase) return;
    setBusyId(claim.id); setError(""); setMessage("");
    const { error: resolveError } = await supabase.rpc("resolve_buyer_report", { p_report_id: claim.id, p_approved: approved });
    if (resolveError) setError("Klaim belum dapat diproses.");
    else { setMessage(approved ? "Klaim disetujui dan kredit dikembalikan satu kali." : "Klaim ditolak."); await refresh(); }
    setBusyId(null);
  }
  const latestOrders = useMemo(() => purchases.slice(0, 6), [purchases]);
  return <DashboardShell {...dashboardLayoutProps(user, "admin", workerLinked)} title="Operasional" subtitle="Pembayaran, klaim, dan pengelolaan Worker RewangOS." active={active} items={adminNav} onNavigate={id => setActive(id as PageKey)}>
    <div className="dashboard-page-heading"><div><span className="dashboard-kicker">ADMIN REWANGOS</span><h2>{active === "overview" ? "Ringkasan operasional" : adminNav.find(item => item.id === active)?.label}</h2><p>Angka transaksi berasal dari order dan ledger yang tercatat di Supabase.</p></div><a className="dashboard-outline" href="/admin/input-pekerja">Input pekerja</a></div>
    {message && <p className="dashboard-success" role="status">{message}</p>}{error && <ErrorPanel>{error}</ErrorPanel>}{loading && <LoadingPanel />}
    {!loading && active === "overview" && summary && <>
      <div className="dashboard-kpi-grid"><Kpi label="Penjualan lunas" value={money(summary.paid_revenue)} note={`${summary.paid_orders} order lunas`} icon={Wallet} /><Kpi label="Order menunggu" value={summary.pending_orders} note="Status mengikuti verifikasi gateway" icon={CreditCard} /><Kpi label="Klaim menunggu" value={summary.pending_reports} note="Perlu ditinjau admin" icon={CircleHelp} /><Kpi label="Listing aktif" value={summary.active_workers} note={`${summary.contact_opens_30d} kontak dibuka 30 hari`} icon={Users} /></div>
      <Panel title="Order terbaru" action={<button className="dashboard-text-button" onClick={() => setActive("payments")}>Buka transaksi</button>}><AdminPurchaseList purchases={latestOrders} /></Panel>
      <Panel title="Klaim yang menunggu" action={<button className="dashboard-text-button" onClick={() => setActive("claims")}>Buka antrean</button>}><AdminClaimList reports={reports.filter(report => report.status === "pending").slice(0, 4)} busyId={busyId} onResolve={resolve} /></Panel>
    </>}
    {!loading && active === "payments" && <Panel title="Transaksi QRIS dan kredit"><AdminPurchaseList purchases={purchases} /></Panel>}
    {!loading && active === "claims" && <Panel title="Antrean klaim garansi"><AdminClaimList reports={reports} busyId={busyId} onResolve={resolve} /></Panel>}
    {!loading && active === "workers" && <Panel title="Listing dan akses Worker" action={<a className="dashboard-text-button" href="/admin/input-pekerja">Tambah pekerja</a>}><AdminWorkerList workers={workers} inviteEmails={inviteEmails} setInviteEmails={setInviteEmails} busyId={busyId} onInvite={invite} onAvailability={setAvailability} /></Panel>}
    {active === "workers" && <WorkerListingConsent adminId={user.id} onChange={() => void refresh()} />}
  </DashboardShell>;
}

function AdminPurchaseList({ purchases }: { purchases: Purchase[] }) {
  if (!purchases.length) return <Empty>Belum ada order yang tercatat.</Empty>;
  return <div className="dashboard-table-wrap"><table className="dashboard-table"><thead><tr><th>Order</th><th>Pembeli</th><th>Paket</th><th>Jumlah</th><th>Status</th><th>Waktu</th></tr></thead><tbody>{purchases.map(purchase => <tr key={purchase.order_id}><td data-label="Order"><strong>{purchase.order_id}</strong>{purchase.payment_type && <small>{purchase.payment_type}</small>}</td><td data-label="Pembeli">{purchase.buyer_email ?? "—"}</td><td data-label="Paket">{purchase.jumlah_kredit_dibeli} kredit</td><td data-label="Jumlah">{money(purchase.harga_total)}</td><td data-label="Status"><span className={`dashboard-status status-${purchase.status}`}>{statusLabel(purchase.status)}</span></td><td data-label="Waktu">{date(purchase.paid_at ?? purchase.created_at)}</td></tr>)}</tbody></table></div>;
}
function AdminClaimList({ reports, busyId, onResolve }: { reports: Claim[]; busyId: number | string | null; onResolve: (claim: Claim, approved: boolean) => void }) {
  if (!reports.length) return <Empty>Tidak ada klaim yang menunggu ditinjau.</Empty>;
  return <div className="dashboard-record-list">{reports.map(report => <article key={report.id} className="dashboard-record dashboard-record--claim"><div className="dashboard-record-main"><strong>{report.alasan.replaceAll("_", " ")}</strong><small>{report.status === "pending" ? "Diterima" : "Diperbarui"} {date(report.resolved_at ?? report.created_at)}</small>{report.bukti_chat && <p className="dashboard-claim-evidence">Bukti/catatan: {report.bukti_chat}</p>}</div><div className="dashboard-record-side"><span className={`dashboard-status status-${report.status}`}>{statusLabel(report.status)}</span>{report.status === "pending" && <div className="dashboard-action-row"><button disabled={busyId === report.id} className="dashboard-mini-button" onClick={() => onResolve(report, true)}>Setujui + kredit</button><button disabled={busyId === report.id} className="dashboard-mini-button is-muted" onClick={() => onResolve(report, false)}>Tolak</button></div>}</div></article>)}</div>;
}
function AdminWorkerList({ workers, inviteEmails, setInviteEmails, busyId, onInvite, onAvailability }: {
  workers: AdminWorker[]; inviteEmails: Record<number, string>; setInviteEmails: (value: Record<number, string>) => void;
  busyId: number | string | null; onInvite: (worker: AdminWorker) => void; onAvailability: (worker: AdminWorker) => void;
}) {
  if (!workers.length) return <Empty>Belum ada profil Worker. Gunakan Input pekerja untuk menambahkan profil.</Empty>;
  return <div className="admin-worker-list">{workers.map(worker => {
    const consent = Boolean(worker.consent_recorded_at && !worker.consent_withdrawn_at);
    const eligible = worker.listing_active && consent;
    return <article key={worker.worker_id} className="admin-worker-row"><div className="admin-worker-identity"><span className="worker-avatar worker-avatar--small">{worker.nama.split(/\s+/).slice(0,2).map(part => part[0]).join("").toUpperCase()}</span><div><strong>{worker.nama}</strong><small>{worker.kategori} · {worker.contact_opens} kontak dibuka</small></div></div><div className="admin-worker-status"><span className={`dashboard-status ${worker.listing_active ? "status-active" : "status-pending"}`}>{worker.listing_active ? "Listing aktif" : "Disembunyikan"}</span><span className={`dashboard-status ${consent ? "status-active" : "status-pending"}`}>{consent ? "Izin aktif" : "Izin belum aktif"}</span></div><div className="admin-worker-actions">{worker.account_email ? <span className="admin-linked-email">Akun · {worker.account_email}</span> : <><label className="visually-hidden" htmlFor={`worker-email-${worker.worker_id}`}>Email undangan {worker.nama}</label><input id={`worker-email-${worker.worker_id}`} type="email" value={inviteEmails[worker.worker_id] ?? worker.invited_email ?? ""} disabled={!eligible || busyId === worker.worker_id} onChange={event => setInviteEmails({ ...inviteEmails, [worker.worker_id]: event.target.value })} placeholder="Email Worker"/><button className="dashboard-mini-button" disabled={!eligible || busyId === worker.worker_id || !(inviteEmails[worker.worker_id] ?? worker.invited_email)} onClick={() => onInvite(worker)}>{worker.invited_email ? "Kirim ulang" : "Undang"}</button></>}{worker.listing_active && <button className="dashboard-mini-button is-muted" disabled={busyId === worker.worker_id} onClick={() => onAvailability(worker)}>{worker.is_available ? "Set Busy" : "Set Open Job"}</button>}</div></article>;
  })}</div>;
}
