import React, { useEffect, useMemo, useRef, useState } from "react";
import { Search, MapPin, Star, BadgeCheck, Clock, Phone, Lock, Home, ChevronRight, X, Check, Wallet, Users, MessageCircle, Filter, RotateCcw, LogOut, Mail, ShieldAlert } from "lucide-react";
import { supabase } from "./lib/supabase";
import { LEGAL_PATHS, LEGAL_VERSION } from "./lib/legal";

type Worker = {
  id: string;
  name: string;
  category: string;
  district: string;
  rate: number;
  rating: number;
  jobs: number;
  verified: boolean;
  available: boolean;
  desc?: string;
  experience?: string;
  skills?: string[];
  portfolio?: string;
  photo?: string;
  phone: string;
  initials: string;
  color: string;
  reviews?: { name: string; area: string; text: string; stars: number }[];
};

type WorkerRow = {
  id: number | string;
  nama: string | null;
  kategori: string | null;
  kecamatan: string | null;
  tarif_harian: number | string | null;
  is_verified: boolean | null;
  is_available: boolean | null;
  rating: number | string | null;
  total_job: number | string | null;
  deskripsi: string | null;
  pengalaman: string | null;
  keahlian: string[] | null;
  portofolio: string | null;
  foto_profil_url?: string | null;
  reviews: { name: string; area: string; text: string; stars: number }[] | null;
};

type CreditPackage = { id: string; nama_paket: string; jumlah_kredit: number; harga: number; harga_per_kontak: number; label: string | null };
type UnlockedContact = { id: string; worker_id: number; no_wa_terbuka: string; garansi_sampai: string; status: "active" | "reported" | "refunded"; sudah_chat: boolean };
type BuyerProfile = { nama: string; no_wa: string; kecamatan: string; tipe_buyer: string };
type BuyerReport = { id: string; buyer_id: string; unlocked_id: string; alasan: string; bukti_chat: string | null; status: string; created_at: string };
type PurchaseSummary = { id: string; order_id: string; jumlah_kredit_dibeli: number; harga_total: number; status: "pending" | "paid" | "failed" | "expired"; snap_token: string | null; created_at: string };

function mapWorker(row: WorkerRow): Worker {
  const name = row.nama?.trim() || "Pekerja";
  const initials = name.split(/\s+/).slice(0, 2).map(part => part[0] ?? "").join("").toUpperCase();
  return {
    id: String(row.id),
    name,
    category: row.kategori?.trim() || "Lainnya",
    district: row.kecamatan?.trim() || "Solo Raya",
    rate: Number(row.tarif_harian ?? 0),
    rating: Number(row.rating ?? 0),
    jobs: Number(row.total_job ?? 0),
    verified: Boolean(row.is_verified),
    available: Boolean(row.is_available),
    desc: row.deskripsi?.trim() || undefined,
    experience: row.pengalaman?.trim() || undefined,
    skills: row.keahlian ?? [],
    portfolio: row.portofolio?.trim() || undefined,
    photo: row.foto_profil_url || undefined,
    reviews: row.reviews ?? [],
    phone: "",
    initials,
    color: "var(--primary-2)",
  };
}

function formatIDR(n:number){ return "Rp " + n.toLocaleString("id-ID"); }
function maskPhone(phone:string){
  const digits = phone.replace(/\D/g, "");
  const local = digits.startsWith("62") ? `0${digits.slice(2)}` : digits;
  return local.length >= 6 ? local.slice(0,4) + "-xxx-xxx-" + local.slice(-2) : phone;
}
function waLink(w:Worker, phone: string){
  const honor = w.name.startsWith("Bu") ? "Bu" : "Pak";
  const msg = `Halo ${honor} ${w.name}, saya dapat kontak dari RewangOS, mau tanya soal jasa ${w.category} di ${w.district}. Apakah masih tersedia? Terima kasih.`;
  const digits = phone.replace(/\D/g, "");
  const whatsappNumber = digits.startsWith("0") ? `62${digits.slice(1)}` : digits.startsWith("8") ? `62${digits}` : digits;
  return `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(msg)}`;
}
type ModalDialogProps = {
  label: string;
  className?: string;
  onClose: () => void;
  children: React.ReactNode;
};

function ModalDialog({ label, className = "", onClose, children }: ModalDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
      if (returnFocusRef.current?.isConnected) returnFocusRef.current.focus();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className={`app-dialog ${className}`}
      aria-label={label}
      onCancel={event => { event.preventDefault(); onClose(); }}
      onClick={event => { if (event.target === event.currentTarget) onClose(); }}
    >
      {children}
    </dialog>
  );
}

export default function App(){
  const [workers,setWorkers]=useState<Worker[]>([]);
  const [search,setSearch]=useState("");
  const [category,setCategory]=useState("Semua");
  const [district,setDistrict]=useState("Semua");
  const [onlyAvailable,setOnlyAvailable]=useState(false);
  const [credits,setCredits]=useState(0);
  const [packages,setPackages]=useState<CreditPackage[]>([]);
  const [unlockedContacts,setUnlockedContacts]=useState<Record<string,UnlockedContact>>({});
  const [user,setUser]=useState<{id:string;email:string;isAdmin:boolean}|null>(null);
  const [buyerProfile,setBuyerProfile]=useState<BuyerProfile>({nama:"",no_wa:"",kecamatan:"",tipe_buyer:"perorangan"});
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [apiNote,setApiNote]=useState("");
  const [selected,setSelected]=useState<Worker|null>(null);
  const [showPackages,setShowPackages]=useState(false);
  const [chosenPkg,setChosenPkg]=useState<CreditPackage|null>(null);
  const [toast,setToast]=useState("");
  const [lastUnlockedName,setLastUnlockedName]=useState("");
  const [showAuth,setShowAuth]=useState(false);
  const [showProfile,setShowProfile]=useState(false);
  const [authEmail,setAuthEmail]=useState("");
  const [showReport,setShowReport]=useState(false);
  const [reportReason,setReportReason]=useState("nomor_tidak_aktif");
  const [reportEvidence,setReportEvidence]=useState("");
  const [authMessage,setAuthMessage]=useState("");
  const [showAdminReports,setShowAdminReports]=useState(false);
  const [adminReports,setAdminReports]=useState<BuyerReport[]>([]);
  const [purchases,setPurchases]=useState<PurchaseSummary[]>([]);
  const [showPurchases,setShowPurchases]=useState(false);
  const [acceptedTerms,setAcceptedTerms]=useState(false);
  const [readPrivacy,setReadPrivacy]=useState(false);
  const buyerReady = Boolean(user && buyerProfile.nama.trim() && buyerProfile.no_wa.trim());

  const unlocked=useMemo(()=>Object.values(unlockedContacts).map(contact=>String(contact.worker_id)),[unlockedContacts]);

  async function refreshBuyerData(userId:string){
    if(!supabase) return;
    const [balanceResult, contactsResult, buyerResult, purchasesResult]=await Promise.all([
      supabase.rpc("get_buyer_balance"),
      supabase.from("unlocked_contacts").select("id,worker_id,no_wa_terbuka,garansi_sampai,status,sudah_chat").eq("buyer_id",userId),
      supabase.from("buyers").select("nama,no_wa,kecamatan,tipe_buyer").eq("id",userId).maybeSingle(),
      supabase.from("purchases").select("id,order_id,jumlah_kredit_dibeli,harga_total,status,snap_token,created_at").eq("buyer_id",userId).order("created_at",{ascending:false}).limit(10),
    ]);
    if(balanceResult.error) throw balanceResult.error;
    if(contactsResult.error) throw contactsResult.error;
    if(purchasesResult.error) throw purchasesResult.error;
    setCredits(Number(balanceResult.data ?? 0));
    const mapped:Record<string,UnlockedContact>={};
    for(const contact of contactsResult.data ?? []) mapped[String(contact.worker_id)]=contact as UnlockedContact;
    setUnlockedContacts(mapped);
    setPurchases((purchasesResult.data ?? []) as PurchaseSummary[]);
    if(buyerResult.data) setBuyerProfile({
      nama:buyerResult.data.nama ?? "", no_wa:buyerResult.data.no_wa ?? "",
      kecamatan:buyerResult.data.kecamatan ?? "", tipe_buyer:buyerResult.data.tipe_buyer ?? "perorangan",
    });
  }

  async function loadAdminReports(){
    if(!supabase || !user?.isAdmin) return;
    const {data,error}=await supabase.from("buyer_reports").select("id,buyer_id,unlocked_id,alasan,bukti_chat,status,created_at").order("created_at",{ascending:false});
    if(error){setToast("Daftar laporan gagal dimuat.");return;}
    setAdminReports((data ?? []) as BuyerReport[]);
  }

  useEffect(()=>{
    let alive=true;
    (async()=>{
      try{
        if(!supabase){
          if(alive) setApiNote("Isi VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY di .env untuk memuat data pekerja.");
          return;
        }
        const [{ data, error }, packageResult, sessionResult] = await Promise.all([
          supabase.from("workers_directory").select("*"),
          supabase.from("credit_packages").select("id,nama_paket,jumlah_kredit,harga,harga_per_kontak,label").eq("is_active",true).order("harga"),
          supabase.auth.getSession(),
        ]);
        if(error) throw error;
        if(packageResult.error) throw packageResult.error;
        if(alive){
          setWorkers((data ?? []).map(row => mapWorker(row as WorkerRow)));
          const nextPackages=(packageResult.data ?? []) as CreditPackage[];
          setPackages(nextPackages);
          setChosenPkg(current=>current ?? nextPackages.find(item=>item.id==="hemat") ?? nextPackages[0] ?? null);
          const sessionUser=sessionResult.data.session?.user;
          if(sessionUser?.email){
            setUser({id:sessionUser.id,email:sessionUser.email,isAdmin:sessionUser.app_metadata?.role==="admin"});
            await refreshBuyerData(sessionUser.id);
          }
          setApiNote("");
        }
      }catch{
        if(alive) setApiNote("Data pekerja gagal dimuat. Periksa konfigurasi Supabase, eksposur Data API, dan izin SELECT publik.");
      }
      finally{ if(alive) setLoading(false); }
    })();
    return ()=>{ alive=false; };
  },[]);

  useEffect(()=>{
    if(!supabase) return;
    const client=supabase;
    const {data:{subscription}}=client.auth.onAuthStateChange((event,session)=>{
      const sessionUser=session?.user;
      if(sessionUser?.email){
        setUser({id:sessionUser.id,email:sessionUser.email,isAdmin:sessionUser.app_metadata?.role==="admin"});
        window.setTimeout(async()=>{
          try{
            await refreshBuyerData(sessionUser.id);
            if(event==="SIGNED_IN"){
              const {data:profile}=await client.from("buyers").select("nama,no_wa").eq("id",sessionUser.id).maybeSingle();
              setShowAuth(false);
              if(!profile?.nama || !profile?.no_wa) setShowProfile(true);
              else setShowPackages(true);
            }
          }catch{setToast("Profil pembeli belum termuat. Muat ulang halaman.");}
        },0);
      }else{
        setUser(null); setCredits(0); setUnlockedContacts({});
      }
    });
    return ()=>subscription.unsubscribe();
  },[]);

  useEffect(()=>{
    const clientKey=import.meta.env.VITE_MIDTRANS_CLIENT_KEY?.trim();
    if(!clientKey) return;
    const script=document.createElement("script");
    script.src="https://app.sandbox.midtrans.com/snap/snap.js";
    script.dataset.clientKey=clientKey;
    script.async=true;
    document.body.appendChild(script);
    return ()=>{ script.remove(); };
  },[]);

  useEffect(()=>{ if(toast){ const t=setTimeout(()=>setToast(""), 4200); return ()=>clearTimeout(t); } },[toast]);

  useEffect(()=>{
    const params=new URLSearchParams(window.location.search);
    if(params.get("beli-kredit")!=="1") return;
    setShowPackages(true);
    window.history.replaceState({},"",window.location.pathname);
  },[]);

  const categories = useMemo(()=>["Semua", ...new Set(workers.map(w=>w.category).filter(Boolean))], [workers]);
  const districts = useMemo(()=>["Semua", ...new Set(workers.map(w=>w.district).filter(Boolean))], [workers]);

  const filtered = useMemo(()=>{
    const q = search.trim().toLowerCase();
    return workers.filter(w=>{
      if(category!=="Semua" && w.category!==category) return false;
      if(district!=="Semua" && w.district!==district) return false;
      if(onlyAvailable && !w.available) return false;
      if(q){
        const hay = `${w.name} ${w.category} ${w.district} ${w.rate}`.toLowerCase();
        if(!hay.includes(q)) return false;
      }
      return true;
    });
  },[workers,search,category,district,onlyAvailable]);

  function closeCheckout() {
    setShowPackages(false);
    setAcceptedTerms(false);
    setReadPrivacy(false);
  }

  async function handleBuy(){
    if(saving || !chosenPkg) return;
    if(!user){ setShowPackages(false); setShowAuth(true); return; }
    if(!buyerProfile.nama.trim() || !buyerProfile.no_wa.trim()){
      setShowPackages(false); setShowProfile(true); return;
    }
    if(!acceptedTerms || !readPrivacy){ setToast("Baca syarat layanan dan kebijakan privasi sebelum melanjutkan."); return; }
    if(!supabase){ setToast("Konfigurasi Supabase belum tersedia."); return; }
    setSaving(true);
    try{
      const {error:profileError}=await supabase.from("buyers").update({
        nama:buyerProfile.nama.trim(), no_wa:buyerProfile.no_wa.trim(),
        kecamatan:buyerProfile.kecamatan.trim() || null, tipe_buyer:buyerProfile.tipe_buyer,
      }).eq("id",user.id);
      if(profileError) throw profileError;
      const {error:legalError}=await supabase.rpc("accept_buyer_legal",{
        p_terms_version:LEGAL_VERSION,p_privacy_version:LEGAL_VERSION,
      });
      if(legalError) throw legalError;
      const {data,error}=await supabase.functions.invoke("create-midtrans-snap",{body:{package_id:chosenPkg.id}});
      if(error) throw error;
      if(!data?.snap_token) throw new Error("Token pembayaran belum tersedia.");
      const snap=window.snap;
      if(!snap) throw new Error("Midtrans Snap belum siap. Periksa VITE_MIDTRANS_CLIENT_KEY.");
      closeCheckout();
      snap.pay(data.snap_token,{
        onSuccess:()=>{setToast("Pembayaran diterima Midtrans. Kredit akan masuk setelah notifikasi pembayaran terverifikasi."); window.setTimeout(()=>void refreshBuyerData(user.id),2500);},
        onPending:()=>setToast("Pembayaran menunggu konfirmasi. Kredit masuk setelah pembayaran terverifikasi."),
        onError:()=>setToast("Pembayaran gagal diproses. Silakan coba kembali."),
        onClose:()=>setToast("Checkout ditutup. Status order dapat diperiksa kembali setelah pembayaran."),
      });
    }catch(e:unknown){
      setToast(e instanceof Error ? e.message : "Checkout gagal dibuat.");
    } finally{ setSaving(false); }
  }

  async function handleUnlock(w:Worker){
    if(unlockedContacts[w.id]) return;
    if(!user){ setShowAuth(true); return; }
    if(credits<=0){ setSelected(null); setShowPackages(true); return; }
    if(!supabase) return;
    setSaving(true);
    try{
      const {error}=await supabase.rpc("unlock_worker_contact",{p_worker_id:Number(w.id)});
      if(error) throw error;
      await refreshBuyerData(user.id);
      setLastUnlockedName(w.name);
      setToast(`Kontak ${w.name} terbuka. 1 kredit digunakan.`);
    }catch(e:unknown){ setToast(e instanceof Error ? e.message : "Kontak gagal dibuka."); }
    finally{ setSaving(false); }
  }

  async function handleSignIn(){
    if(!supabase || !authEmail.trim()) return;
    setSaving(true); setAuthMessage("");
    const {error}=await supabase.auth.signInWithOtp({email:authEmail.trim(),options:{emailRedirectTo:window.location.origin}});
    setSaving(false);
    setAuthMessage(error ? error.message : "Tautan masuk telah dikirim. Buka email ini untuk melanjutkan.");
  }

  async function handleSaveProfile(){
    if(!supabase || !user) return;
    setSaving(true);
    const {error}=await supabase.from("buyers").update({
      nama:buyerProfile.nama.trim(), no_wa:buyerProfile.no_wa.trim(),
      kecamatan:buyerProfile.kecamatan.trim() || null, tipe_buyer:buyerProfile.tipe_buyer,
    }).eq("id",user.id);
    setSaving(false);
    if(error){setToast(error.message);return;}
    setShowProfile(false); setShowPackages(true);
  }

  async function submitReport(){
    if(!supabase || !user || !selected) return;
    const contact=unlockedContacts[selected.id];
    if(!contact) return;
    setSaving(true);
    const {error}=await supabase.rpc("submit_buyer_report",{
      p_unlocked_id:contact.id,p_alasan:reportReason,p_bukti_chat:reportEvidence.trim() || null,
    });
    setSaving(false);
    if(error){setToast(error.message);return;}
    await refreshBuyerData(user.id); setShowReport(false); setReportEvidence("");
    setToast("Klaim garansi dikirim untuk ditinjau.");
  }

  async function resolveReport(reportId:string,approved:boolean){
    if(!supabase || !user?.isAdmin) return;
    setSaving(true);
    const {error}=await supabase.rpc("resolve_buyer_report",{p_report_id:reportId,p_approved:approved});
    setSaving(false);
    if(error){setToast(error.message);return;}
    await loadAdminReports();
    setToast(approved?"Klaim disetujui dan satu kredit dikembalikan.":"Klaim ditolak.");
  }

  function markChat(contact:UnlockedContact){
    if(supabase) void supabase.functions.invoke("notify-worker-chat",{body:{unlocked_id:contact.id}})
      .then(({error})=>{if(error) setToast("WhatsApp terbuka, tetapi status klik chat gagal disimpan ke server.");});
  }

  function resumePayment(purchase:PurchaseSummary){
    if(!purchase.snap_token || !window.snap) return;
    window.snap.pay(purchase.snap_token,{
      onSuccess:()=>{setToast("Pembayaran diterima Midtrans. Kredit akan masuk setelah notifikasi pembayaran terverifikasi.");if(user)window.setTimeout(()=>void refreshBuyerData(user.id),2500);},
      onPending:()=>setToast("Pembayaran menunggu konfirmasi."),
      onError:()=>setToast("Pembayaran gagal diproses."),
      onClose:()=>setToast("Checkout ditutup. Status order dapat diperiksa di sini."),
    });
  }

  function resetFilters(){ setSearch(""); setCategory("Semua"); setDistrict("Semua"); setOnlyAvailable(false); }
  return (
    <div data-safe-area-inset-root style={{paddingTop:"var(--safe-area-inset-top, 0px)", minHeight:"100vh"}} className="overflow-x-clip">
      {/* HEADER */}
      <header data-safe-area-sticky-top style={{top:"var(--safe-area-inset-top, 0px)"}} className="site-header sticky z-30 border-b border-white/20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-3">
          <div className="header-main flex items-center justify-between gap-4">
            <div className="header-brand flex min-w-0 items-center gap-3">
              <div className="w-11 h-11 shrink-0 rounded-2xl bg-[#E8B44A] text-[#1A3C2A] grid place-items-center shadow"><Home size={24} strokeWidth={2.2}/></div>
              <div className="min-w-0">
                <h1 className="brand-name font-display text-2xl sm:text-[28px] leading-none">RewangOS</h1>
              </div>
            </div>
            <div className="header-actions flex shrink-0 items-center gap-2">
              <div className="flex min-h-11 items-center gap-2 rounded-lg border border-white/20 bg-white/5 px-3"><Wallet size={16} className="text-[var(--gold)]" aria-hidden="true"/><span className="whitespace-nowrap text-xs"><b className="text-[var(--gold)]">{credits}</b> kredit</span></div>
              {user?.isAdmin && <button onClick={()=>{setShowAdminReports(true);void loadAdminReports();}} className="flex min-h-11 items-center gap-2 rounded-lg border border-white/20 px-3 text-xs font-bold text-white"><ShieldAlert size={15}/> Laporan</button>}
              {user && <button onClick={()=>setShowPurchases(true)} className="flex min-h-11 items-center gap-2 rounded-lg border border-white/20 px-3 text-xs font-bold text-white"><Wallet size={15}/> Order</button>}
              {user ? <button onClick={()=>void supabase?.auth.signOut()} className="flex min-h-11 items-center gap-2 rounded-lg border border-white/20 px-3 text-xs font-bold text-white"><LogOut size={15}/> Keluar</button> : <button onClick={()=>setShowAuth(true)} className="flex min-h-11 items-center gap-2 rounded-lg border border-white/20 px-3 text-xs font-bold text-white"><Mail size={15}/> Masuk</button>}
            </div>
          </div>
          <p className="header-locations mt-2 leading-relaxed">Surakarta • Sukoharjo • Wonogiri • Klaten • Boyolali • Karanganyar • Sragen</p>
          <nav className="mt-2 flex flex-wrap gap-2" aria-label="Dashboard akun">
            <a href="/akun" className="inline-flex min-h-11 items-center rounded-lg border border-white/20 px-3 text-xs font-bold text-white">Akun buyer</a>
            <a href="/pekerja" className="inline-flex min-h-11 items-center rounded-lg border border-white/20 px-3 text-xs font-bold text-white">Ruang worker</a>
            {user?.isAdmin && <><a href="/admin" className="inline-flex min-h-11 items-center rounded-lg border border-white/20 px-3 text-xs font-bold text-white">Dashboard admin</a><a href="/admin/input-pekerja" className="inline-flex min-h-11 items-center rounded-lg border border-white/20 px-3 text-xs font-bold text-white">Input pekerja</a></>}
          </nav>
        </div>
      </header>

      <main>
        {/* HERO */}
        <section className="hero-feature">
          <div className="hero-columns mx-auto max-w-7xl px-4 sm:px-6">
            <div>
              <p className="text-xs font-bold tracking-wide text-[var(--gold)]">WARGA SOLO • LANGSUNG CHAT WA • TANPA PERANTARA</p>
              <h2 className="hero-title">Butuh tenaga pocokan hari ini?<em>Cari, buka kontak, langsung chat.</em></h2>
              <p className="hero-description">Rewang hajatan, ART, tukang, sopir, sampai baby sitter dari Solo Raya. Lihat tarif harian dan kecamatan sebelum membuka kontak.</p>
            </div>
            <div className="search-panel">
              <form onSubmit={event=>{event.preventDefault(); document.getElementById("daftar")?.scrollIntoView();}}>
                <label htmlFor="worker-search" className="block mb-2 font-bold">Cari nama atau kategori</label>
                <div className="search-field">
                  <Search className="text-[var(--muted)] shrink-0" size={20} aria-hidden="true"/>
                  <input id="worker-search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Misal: tukang, IRT, rewang"/>
                </div>
                <button type="submit" className="mt-3 w-full bg-[var(--accent)] text-white font-bold px-5 py-3 rounded-lg text-sm hover:brightness-110">Cari Pekerja</button>
              </form>
              <div className="flex flex-wrap gap-2 mt-4">
                {["rewang","tukang","IRT","baby sitter","sopir"].map(t=><button key={t} type="button" onClick={()=>setSearch(t)} className="quick-chip">#{t}</button>)}
              </div>
              <p className="mt-4 border-t border-[var(--line)] pt-3 text-[13px] text-[var(--muted)]"><b className="text-[var(--ink)]">{workers.filter(w=>w.available).length}</b> pekerja tersedia menurut data profil.</p>
            </div>
          </div>
        </section>

        {/* Informasi yang tersedia sebelum kontak dibuka */}
        <div className="trust-strip mx-auto max-w-7xl px-4 sm:px-6">
          <div className="bg-[var(--surface)] border border-[var(--line)] rounded-xl px-4 py-4 flex gap-3 items-start sm:items-center">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[var(--surface-2)] text-[var(--primary)]"><MapPin size={20}/></div>
            <div className="min-w-0"><p className="font-bold text-sm text-[var(--primary)]">Periksa profil sebelum membuka kontak</p><p className="text-xs leading-relaxed text-[var(--muted)] sm:text-sm">Bandingkan kategori, kecamatan, ketersediaan, dan tarif harian. Setelah dibuka, Anda dapat menghubungi pekerja melalui WhatsApp.</p></div>
          </div>
        </div>

        {/* FILTER */}
        <section id="daftar" className="mx-auto max-w-7xl scroll-mt-32 px-4 pt-10 sm:px-6 sm:pt-14">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--line)] pb-5">
            <div><p className="text-xs font-bold tracking-widest text-[var(--primary)]">DAFTAR PEKERJA</p><h3 className="mt-1 font-display text-3xl font-bold leading-tight sm:text-4xl">Siapa yang mau direwang hari ini?</h3></div>
            <p className="text-sm text-[var(--muted)]">Menampilkan <b className="text-[var(--ink)]">{filtered.length}</b> dari {workers.length} pekerja • {unlocked.length} kontak terbuka</p>
          </div>

          <div className="directory-layout mt-5 sm:mt-6">
            <aside className="filter-rail min-w-0 p-4 sm:p-5" aria-label="Filter pekerja">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-bold text-[var(--primary)]"><Filter size={17}/> Filter pekerja</div>
                <button onClick={resetFilters} className="inline-flex items-center gap-2 rounded-lg px-2 text-sm font-semibold text-[var(--primary)] hover:bg-[var(--surface-2)]"><RotateCcw size={15}/> Atur Ulang</button>
              </div>
              <div className="filter-fields mt-4">
              <fieldset className="min-w-0">
                <legend className="mb-2 text-xs font-semibold text-[var(--muted)]">Kategori</legend>
                <div className="category-options flex min-w-0 flex-col gap-1">
                  {categories.map(c=>(
                    <button key={c} onClick={()=>setCategory(c)} aria-pressed={category===c} className={`w-full min-w-0 whitespace-normal break-words rounded-lg border px-3 py-2 text-left text-sm font-semibold ${category===c?"border-[var(--primary)] bg-[var(--primary)] text-white":"border-transparent bg-[var(--surface-2)] hover:border-[var(--line)]"}`}>{c}</button>
                  ))}
                </div>
                <label className="category-select mt-2 block">
                  <span className="sr-only">Kategori</span>
                  <select value={category} onChange={e=>setCategory(e.target.value)} className="w-full min-w-0 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5 text-sm font-semibold">
                    {categories.map(c=><option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
              </fieldset>
              <label className="filter-district block min-w-0">
                <span className="mb-2 block text-xs font-semibold text-[var(--muted)]">Kecamatan</span>
                <span className="flex items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5">
                  <MapPin size={16} className="shrink-0 text-[var(--primary)]"/>
                  <select value={district} onChange={e=>setDistrict(e.target.value)} className="min-w-0 flex-1 bg-transparent text-sm font-semibold">{districts.map(d=><option key={d}>{d}</option>)}</select>
                </span>
              </label>
              </div>
              <button onClick={()=>setOnlyAvailable(!onlyAvailable)} aria-pressed={onlyAvailable} className={`availability-filter mt-4 flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-left text-sm font-semibold ${onlyAvailable?"border-[var(--primary)] bg-[var(--primary)] text-white":"border-[var(--line)] bg-[var(--surface)]"}`}>
                <span className="flex items-center gap-2"><Clock size={16}/> Tersedia Hari Ini</span>
                <span aria-hidden="true" className={`flex h-5 w-9 shrink-0 rounded-full p-0.5 ${onlyAvailable?"justify-end bg-[#E8B44A]":"justify-start bg-gray-300"}`}><span className="h-4 w-4 rounded-full bg-white shadow"/></span>
              </button>
            </aside>

          {/* GRID */}
          {filtered.length===0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--line)] bg-[var(--surface)] p-8 text-center sm:p-12">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[var(--surface-2)] text-[var(--primary)]"><Search size={24} aria-hidden="true"/></div>
              <h4 className="mt-4 font-display text-2xl font-bold">{loading ? "Memuat daftar pekerja" : apiNote ? "Daftar pekerja belum bisa dimuat" : "Belum ada pekerja di area ini"}</h4>
              {loading && <p role="status" className="mt-1 text-sm text-[var(--muted)]">Mengambil data profil pekerja.</p>}
              {!loading && apiNote && <p role="alert" className="mx-auto mt-1 max-w-md text-sm text-[var(--muted)]">{apiNote}</p>}
              {!loading && !apiNote && <p className="mx-auto mt-1 max-w-md text-sm text-[var(--muted)]">Coba ubah kata kunci, kategori, atau kecamatan.</p>}
              {!loading && apiNote && <button onClick={()=>window.location.reload()} className="mt-4 rounded-lg bg-[var(--primary)] px-5 py-2.5 text-sm font-bold text-[#FFF6E8]">Muat Ulang</button>}
              {!loading && !apiNote && <button onClick={resetFilters} className="mt-4 rounded-lg bg-[var(--primary)] px-5 py-2.5 text-sm font-bold text-[#FFF6E8]">Hapus Filter</button>}
            </div>
          ) : (
            <div className="worker-grid min-w-0">
              {filtered.map(w=>{
                const openedContact = unlockedContacts[w.id];
                const isOpen = Boolean(openedContact);
                return (
                <article key={w.id} className="worker-card card-hover flex min-w-0 flex-col overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
                  <div className="flex gap-3 p-4 pb-0 sm:p-5 sm:pb-0">
                    <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-[var(--primary)] font-display text-lg font-bold text-[#FFE4A1]">{w.photo ? <img src={w.photo} alt="" loading="lazy" className="h-full w-full object-cover" /> : w.initials}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1"><h4 className="break-words text-base font-bold leading-snug">{w.name}</h4>{w.verified && <span className="inline-flex items-center gap-1 rounded-full bg-[#E6F4EB] px-2 py-0.5 text-xs font-bold text-[#216342]"><BadgeCheck size={13}/> Terverifikasi</span>}</div>
                      <p className="mt-1 text-sm font-bold text-[var(--primary)]">{w.category}</p>
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-[var(--muted)]"><MapPin size={13}/> {w.district}, Solo Raya</p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 px-4 sm:px-5">
                    <span className="flex items-center gap-1 text-sm font-bold"><Star size={14} className="fill-[#E8B44A] text-[#AD7714]"/> {w.rating.toFixed(1)} <span className="text-xs font-normal text-[var(--muted)]">• {w.jobs} job selesai</span></span>
                    <span className={`rounded-full px-2 py-1 text-xs font-bold ${w.available?"bg-[#E6F4EB] text-[#216342]":"bg-[#FDECEA] text-[#A33A2A]"}`}>{w.available?"Open Job":"Busy"}</span>
                  </div>
                  {w.desc && <p className="mt-3 line-clamp-2 px-4 text-sm leading-relaxed text-[var(--muted)] sm:px-5">{w.desc}</p>}
                  <div className="mt-auto flex flex-wrap items-baseline gap-1 px-4 py-3 sm:px-5"><span className="font-display text-2xl font-bold">{formatIDR(w.rate)}</span><span className="text-xs text-[var(--muted)]">/hari</span></div>
                  <div className="border-t border-[var(--line)] bg-[var(--surface-2)] p-4 sm:px-5">
                    <div className="flex items-center gap-2 text-sm"><Phone size={15} className="shrink-0 text-[var(--muted)]"/><span className="break-all font-mono font-bold tracking-wide">{isOpen ? openedContact.no_wa_terbuka : "Kontak terkunci"}</span></div>
                    {!isOpen && <p className="mt-1 flex items-center gap-1 text-xs text-[var(--muted)]"><Lock size={12}/> Terbuka setelah memakai kredit</p>}
                    {isOpen ? (
                      <a href={waLink(w,openedContact.no_wa_terbuka)} target="_blank" rel="noopener noreferrer" onClick={e=>{e.stopPropagation();markChat(openedContact);}} className="mt-2 flex items-center justify-center gap-2 w-full bg-[#1F7A4D] text-white font-bold text-sm py-3 rounded-xl hover:bg-[#16663E]"><MessageCircle size={17}/> Chat WhatsApp Sekarang</a>
                    ) : (
                      <button disabled={saving} onClick={()=>handleUnlock(w)} className="mt-2 w-full bg-[var(--accent)] text-white font-bold text-sm py-3 rounded-xl hover:brightness-110 disabled:opacity-60">{credits > 0 ? "Buka kontak, 1 kredit" : "Beli kredit untuk membuka"}</button>
                    )}
                    <button onClick={()=>setSelected(w)} className="mt-2 flex min-h-10 w-full items-center justify-center gap-1 rounded-lg px-2 text-sm font-bold text-[var(--primary)] hover:bg-[var(--surface)]">Lihat Detail & Review <ChevronRight size={15}/></button>
                  </div>
                </article>
                );
              })}
            </div>
          )}
          </div>
        </section>

        {/* PAKET */}
        <section className="packages-band mt-12 py-10 sm:py-14">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="flex items-end justify-between gap-3 flex-wrap"><div><p className="text-xs font-bold tracking-widest text-[var(--primary)]">KREDIT KONTAK</p><h3 className="font-display text-3xl sm:text-4xl font-bold">Pilih jumlah kontak.</h3><p className="text-sm text-[var(--muted)] mt-1">Pembayaran diproses melalui Midtrans. Kredit masuk setelah pembayaran dikonfirmasi.</p></div><button onClick={()=>setShowPackages(true)} className="bg-[var(--primary)] text-[#FFF6E8] px-4 py-2.5 rounded-lg text-sm font-bold">Pilih Paket</button></div>
          <div className="grid md:grid-cols-3 gap-4 mt-5">
            {packages.map(p=>(
              <div key={p.id} className="package-card flex flex-col rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5">
                <h4 className="font-display text-xl font-bold">{p.nama_paket}</h4><p className="text-sm text-[var(--muted)]">{p.jumlah_kredit} nomor WhatsApp{p.label ? ` • ${p.label}` : ""}</p>
                <p className="mt-3"><span className="font-display text-3xl font-bold">{formatIDR(p.harga)}</span></p><p className="text-xs font-bold text-[#1F7A4D] mt-1">{formatIDR(p.harga_per_kontak)} per kontak</p>
                <div className="mt-auto pt-4">
                  <button onClick={()=>{setChosenPkg(p); setShowPackages(true);}} className="w-full rounded-lg bg-[var(--primary)] py-3 text-sm font-bold text-[#FFF6E8] hover:brightness-110">Pilih {p.nama_paket}</button>
                </div>
              </div>
            ))}
          </div>
          </div>
        </section>

        {/* CARA KERJA */}
        <section className="mx-auto max-w-7xl px-4 sm:px-6 pt-12">
          <p className="text-xs font-bold tracking-widest text-[var(--primary)]">CARA KERJA</p><h3 className="font-display text-3xl sm:text-4xl font-bold mt-1">Tiga langkah, langsung beres.</h3>
          <div className="grid md:grid-cols-3 gap-4 mt-5">
            {[{n:"1",t:"Cari Pekerja",d:"Ketik keahlian atau pilih kategori dan kecamatan. Bandingkan data yang tercantum di profil.",icon:Search},{n:"2",t:"Buka Kontak",d:"Beli paket kredit melalui checkout Midtrans sandbox, lalu buka kontak dengan satu kredit.",icon:Wallet},{n:"3",t:"Hubungi via WhatsApp",d:"Gunakan nomor yang terbuka untuk menanyakan jadwal dan menyepakati tarif.",icon:MessageCircle}].map(s=>(
              <div key={s.n} className="bg-[var(--surface)] border border-[var(--line)] rounded-3xl p-5"><div className="flex justify-between"><div className="w-11 h-11 rounded-2xl bg-[#1A3C2A] text-[#E8B44A] grid place-items-center"><s.icon size={20}/></div><span className="font-display text-4xl font-bold text-[#E8DCC2]">{s.n}</span></div><h4 className="font-bold text-lg mt-4">{s.t}</h4><p className="text-sm text-[var(--muted)] leading-relaxed mt-1">{s.d}</p></div>
            ))}
          </div>
        </section>

        {/* Rincian data profil */}
        <section className="mx-auto max-w-7xl px-4 sm:px-6 py-12">
          <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-6 sm:p-8">
              <p className="text-xs font-bold tracking-widest text-[var(--primary)]">SEBELUM MENGHUBUNGI</p>
              <h3 className="mt-2 font-display text-3xl font-bold leading-tight sm:text-4xl">Bandingkan informasi profil lebih dulu.</h3>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--muted)]">Setiap profil menampilkan data yang tersedia dari pekerja. Gunakan tarif dan lokasi untuk menentukan siapa yang ingin Anda hubungi.</p>
              <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-[var(--line)] pt-5 sm:grid-cols-4">
                <div><dt className="text-xs font-semibold text-[var(--muted)]">Kategori</dt><dd className="mt-1 font-bold">Jenis jasa</dd></div>
                <div><dt className="text-xs font-semibold text-[var(--muted)]">Kecamatan</dt><dd className="mt-1 font-bold">Lokasi profil</dd></div>
                <div><dt className="text-xs font-semibold text-[var(--muted)]">Tarif</dt><dd className="mt-1 font-bold">Per hari</dd></div>
                <div><dt className="text-xs font-semibold text-[var(--muted)]">Kontak</dt><dd className="mt-1 font-bold">WhatsApp</dd></div>
              </dl>
          </div>
        </section>
      </main>

      <footer className="site-footer bg-[var(--surface)]">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-6 sm:px-6 sm:py-7">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--primary)] text-[var(--gold)]"><Home size={20}/></div>
            <div>
              <p className="font-display text-lg font-bold leading-none">RewangOS</p>
              <p className="mt-1 text-xs text-[var(--muted)]">Direktori Tenaga Pocokan Lokal Solo Raya</p>
            </div>
          </div>
          <nav aria-label="Dokumen legal" className="flex flex-wrap gap-x-4 gap-y-2 text-xs">
            <a href={LEGAL_PATHS.terms} className="underline">Syarat Pencari Pekerja</a>
            <a href={LEGAL_PATHS.worker} className="underline">Ketentuan Worker</a>
            <a href={LEGAL_PATHS.privacy} className="underline">Kebijakan Privasi</a>
          </nav>
          <p className="text-[11px] text-[var(--muted)]">© 2026 RewangOS</p>
        </div>
      </footer>

      {/* Checkout kredit */}
      {showPackages && (
        <ModalDialog label="Pilih paket kredit" className="app-dialog--package" onClose={closeCheckout}>
          <div className="p-5 sm:p-6">
            <div className="flex justify-between gap-3">
              <div>
                <h3 className="font-display text-2xl font-bold">Pilih Paket Kredit</h3>
                <p className="text-sm text-[var(--muted)]">Saldo Anda: <b className="text-[var(--ink)]">{credits}</b> kredit.</p>
              </div>
              <button autoFocus onClick={closeCheckout} aria-label="Tutup" className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-[var(--surface-2)]"><X size={18}/></button>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {packages.map(p=>(
                <button key={p.id} type="button" aria-pressed={chosenPkg?.id===p.id} onClick={()=>setChosenPkg(p)} className={`rounded-xl border p-4 text-left ${chosenPkg?.id===p.id?"border-[var(--primary)] bg-[var(--surface-2)] ring-2 ring-[var(--primary)]/20":"border-[var(--line)]"}`}>
                  <span className="font-bold">{p.nama_paket}</span>
                  <span className="mt-1 block text-xs text-[var(--muted)]">{p.jumlah_kredit} nomor WhatsApp{p.label ? ` • ${p.label}` : ""}</span>
                  <span className="mt-2 block font-display text-xl font-bold">{formatIDR(p.harga)}</span>
                  <span className="mt-1 block text-xs font-semibold text-[var(--muted)]">{formatIDR(p.harga_per_kontak)} per kontak</span>
                  {chosenPkg?.id===p.id && <span className="mt-2 flex items-center gap-1 text-xs font-bold text-[var(--primary)]"><Check size={14}/> Dipilih</span>}
                </button>
              ))}
            </div>
            <p className="mt-4 text-sm text-[var(--muted)]">Satu kredit membuka satu kontak. Kredit tidak kedaluwarsa selama akun aktif. Garansi masalah kontak berlaku 24 jam sejak dibuka.</p>
            {buyerReady && <fieldset className="mt-4 space-y-2 text-sm">
              <legend className="font-semibold">Sebelum membayar</legend>
              <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={acceptedTerms} onChange={event=>setAcceptedTerms(event.target.checked)}/><span>Saya menyetujui <a href={LEGAL_PATHS.terms} target="_blank" rel="noopener noreferrer" className="underline">Syarat Layanan Pencari Pekerja</a> versi {LEGAL_VERSION}.</span></label>
              <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={readPrivacy} onChange={event=>setReadPrivacy(event.target.checked)}/><span>Saya telah membaca <a href={LEGAL_PATHS.privacy} target="_blank" rel="noopener noreferrer" className="underline">Kebijakan Privasi</a> versi {LEGAL_VERSION}.</span></label>
            </fieldset>}
            <button disabled={saving || !chosenPkg || (buyerReady && (!acceptedTerms || !readPrivacy))} onClick={handleBuy} className="mt-5 min-h-11 w-full rounded-lg bg-[var(--accent)] px-4 py-3 font-bold text-white hover:brightness-110 disabled:opacity-60">
              {saving ? "Menyiapkan checkout…" : !chosenPkg ? "Paket belum tersedia" : !user ? "Masuk untuk lanjut" : !buyerReady ? "Lengkapi profil" : `Bayar ${formatIDR(chosenPkg.harga)} lewat Midtrans`}
            </button>
            <p className="mt-2 text-center text-xs text-[var(--muted)]">Kredit masuk setelah pembayaran Midtrans terverifikasi. Kesepakatan kerja dibuat langsung dengan Worker di luar aplikasi.</p>
          </div>
        </ModalDialog>
      )}

      {showAuth && (
        <ModalDialog label="Masuk dengan email" onClose={()=>setShowAuth(false)}>
          <form onSubmit={event=>{event.preventDefault();void handleSignIn();}} className="p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3"><div><h3 className="font-display text-2xl font-bold">Masuk ke RewangOS</h3><p className="mt-1 text-sm text-[var(--muted)]">Kami kirim tautan OTP tanpa password ke email Anda.</p></div><button type="button" autoFocus onClick={()=>setShowAuth(false)} aria-label="Tutup" className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[var(--surface-2)]"><X size={18}/></button></div>
            <label className="mt-5 block text-sm font-semibold">Email<input required type="email" autoComplete="email" value={authEmail} onChange={event=>setAuthEmail(event.target.value)} className="mt-1 w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-3" placeholder="nama@email.com"/></label>
            <button disabled={saving} className="mt-4 min-h-11 w-full rounded-lg bg-[var(--primary)] px-4 py-3 font-bold text-white disabled:opacity-60">{saving?"Mengirim…":"Kirim tautan masuk"}</button>
            {authMessage && <p role="status" className="mt-3 text-sm text-[var(--muted)]">{authMessage}</p>}
          </form>
        </ModalDialog>
      )}

      {showProfile && user && (
        <ModalDialog label="Lengkapi profil pembeli" onClose={()=>setShowProfile(false)}>
          <form onSubmit={event=>{event.preventDefault();void handleSaveProfile();}} className="p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3"><div><h3 className="font-display text-2xl font-bold">Lengkapi profil pembeli</h3><p className="mt-1 text-sm text-[var(--muted)]">Nama dan WhatsApp dipakai untuk detail order dan bantuan pembayaran.</p></div><button type="button" autoFocus onClick={()=>setShowProfile(false)} aria-label="Tutup" className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[var(--surface-2)]"><X size={18}/></button></div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-semibold">Nama<input required value={buyerProfile.nama} onChange={event=>setBuyerProfile({...buyerProfile,nama:event.target.value})} className="mt-1 w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-3" autoComplete="name"/></label>
              <label className="text-sm font-semibold">Nomor WhatsApp<input required type="tel" value={buyerProfile.no_wa} onChange={event=>setBuyerProfile({...buyerProfile,no_wa:event.target.value})} className="mt-1 w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-3" autoComplete="tel" placeholder="08…"/></label>
              <label className="text-sm font-semibold">Kecamatan<input value={buyerProfile.kecamatan} onChange={event=>setBuyerProfile({...buyerProfile,kecamatan:event.target.value})} className="mt-1 w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-3"/></label>
              <label className="text-sm font-semibold">Jenis pembeli<select value={buyerProfile.tipe_buyer} onChange={event=>setBuyerProfile({...buyerProfile,tipe_buyer:event.target.value})} className="mt-1 w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-3"><option value="perorangan">Perorangan</option><option value="usaha">Usaha</option><option value="eo">EO</option><option value="kontraktor">Kontraktor</option></select></label>
            </div>
            <button disabled={saving} className="mt-5 min-h-11 w-full rounded-lg bg-[var(--primary)] px-4 py-3 font-bold text-white disabled:opacity-60">{saving?"Menyimpan…":"Simpan profil"}</button>
          </form>
        </ModalDialog>
      )}

      {showReport && selected && unlockedContacts[selected.id] && (
        <ModalDialog label="Klaim garansi kontak" onClose={()=>setShowReport(false)}>
          <form onSubmit={event=>{event.preventDefault();void submitReport();}} className="p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3"><div><h3 className="font-display text-2xl font-bold">Laporkan masalah kontak</h3><p className="mt-1 text-sm text-[var(--muted)]">Klaim tersedia selama 24 jam setelah kontak dibuka.</p></div><button type="button" autoFocus onClick={()=>setShowReport(false)} aria-label="Tutup" className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[var(--surface-2)]"><X size={18}/></button></div>
            <label className="mt-5 block text-sm font-semibold">Alasan<select value={reportReason} onChange={event=>setReportReason(event.target.value)} className="mt-1 w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-3"><option value="nomor_tidak_aktif">Nomor tidak aktif</option><option value="pekerja_menolak">Pekerja menolak</option><option value="nomor_salah">Nomor salah</option></select></label>
            <label className="mt-3 block text-sm font-semibold">Bukti chat (opsional)<textarea value={reportEvidence} onChange={event=>setReportEvidence(event.target.value)} rows={3} maxLength={2000} className="mt-1 w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-3" placeholder="Catatan singkat atau tautan bukti"/></label>
            <button disabled={saving || unlockedContacts[selected.id].status==="reported"} className="mt-4 min-h-11 w-full rounded-lg bg-[var(--primary)] px-4 py-3 font-bold text-white disabled:opacity-60">{unlockedContacts[selected.id].status==="reported"?"Klaim sedang ditinjau":saving?"Mengirim…":"Kirim klaim"}</button>
          </form>
        </ModalDialog>
      )}

      {showAdminReports && user?.isAdmin && (
        <ModalDialog label="Review klaim garansi" onClose={()=>setShowAdminReports(false)}>
          <div className="max-h-[85vh] overflow-y-auto p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3"><div><h3 className="font-display text-2xl font-bold">Klaim garansi</h3><p className="mt-1 text-sm text-[var(--muted)]">Keputusan refund dicatat sekali di ledger kredit.</p></div><button autoFocus onClick={()=>setShowAdminReports(false)} aria-label="Tutup" className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[var(--surface-2)]"><X size={18}/></button></div>
            <div className="mt-5 space-y-3">{adminReports.filter(report=>report.status==="pending").length===0 ? <p className="rounded-lg bg-[var(--surface-2)] p-4 text-sm text-[var(--muted)]">Tidak ada klaim yang menunggu.</p> : adminReports.filter(report=>report.status==="pending").map(report=>(
              <article key={report.id} className="rounded-xl border border-[var(--line)] p-4"><p className="font-bold">{report.alasan.replaceAll("_"," ")}</p><p className="mt-1 break-all text-xs text-[var(--muted)]">Pembeli {report.buyer_id} • Kontak {report.unlocked_id}</p>{report.bukti_chat && <p className="mt-2 whitespace-pre-wrap text-sm">{report.bukti_chat}</p>}<p className="mt-2 text-xs text-[var(--muted)]">{new Date(report.created_at).toLocaleString("id-ID")}</p><div className="mt-3 grid grid-cols-2 gap-2"><button disabled={saving} onClick={()=>void resolveReport(report.id,true)} className="rounded-lg bg-[var(--primary)] px-3 py-2.5 text-sm font-bold text-white disabled:opacity-60">Setujui + refund</button><button disabled={saving} onClick={()=>void resolveReport(report.id,false)} className="rounded-lg border border-[var(--line)] px-3 py-2.5 text-sm font-bold disabled:opacity-60">Tolak</button></div></article>
            ))}</div>
          </div>
        </ModalDialog>
      )}

      {showPurchases && user && (
        <ModalDialog label="Riwayat order kredit" onClose={()=>setShowPurchases(false)}>
          <div className="max-h-[85vh] overflow-y-auto p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3"><div><h3 className="font-display text-2xl font-bold">Order kredit</h3><p className="mt-1 text-sm text-[var(--muted)]">Saldo saat ini: {credits} kredit.</p></div><button autoFocus onClick={()=>setShowPurchases(false)} aria-label="Tutup" className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[var(--surface-2)]"><X size={18}/></button></div>
            <div className="mt-5 space-y-3">{purchases.length===0 ? <p className="rounded-lg bg-[var(--surface-2)] p-4 text-sm text-[var(--muted)]">Belum ada order.</p> : purchases.map(purchase=>(
              <article key={purchase.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--line)] p-4"><div><p className="font-bold">{purchase.jumlah_kredit_dibeli} kredit • {formatIDR(purchase.harga_total)}</p><p className="mt-1 text-xs text-[var(--muted)]">{purchase.order_id} • {new Date(purchase.created_at).toLocaleString("id-ID")}</p><p className={`mt-1 text-xs font-bold ${purchase.status==="paid"?"text-[#216342]":purchase.status==="pending"?"text-[#9A6700]":"text-[var(--muted)]"}`}>{purchase.status==="paid"?"Lunas":purchase.status==="pending"?"Menunggu pembayaran":purchase.status==="expired"?"Kedaluwarsa":"Gagal"}</p></div>{purchase.status==="pending" && purchase.snap_token && <button onClick={()=>resumePayment(purchase)} className="rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-bold text-white">Lanjut bayar</button>}</article>
            ))}</div>
          </div>
        </ModalDialog>
      )}

      {/* DETAIL PEKERJA */}
      {selected && (
        <ModalDialog label={`Detail ${selected.name}`} className="detail-dialog" onClose={()=>setSelected(null)}>
            <div className="detail-header text-[#FFF6E8]">
              <div className="detail-avatar shrink-0 bg-[#E8B44A] text-[#1A3C2A] grid place-items-center font-display font-bold text-xl">{selected.initials}</div>
              <div className="min-w-0 flex-1"><h3 className="font-display text-2xl font-bold leading-tight">{selected.name}</h3><p className="text-sm text-[#E8B44A] font-bold">{selected.category} • {selected.district}</p><p className="text-xs text-[#D9E8D6] mt-1 flex items-center gap-1"><Star size={13} className="fill-[#E8B44A] text-[#E8B44A]"/> {selected.rating} • {selected.jobs} job{selected.experience ? ` • ${selected.experience}` : ""}</p></div>
              <button autoFocus onClick={()=>setSelected(null)} aria-label="Tutup detail" className="detail-close"><X size={18}/></button>
            </div>
            <div className="detail-body space-y-5">
              {(selected.desc || selected.skills?.length) && <div><h4 className="font-bold flex items-center gap-2"><Users size={17}/> Tentang</h4>{selected.desc && <p className="text-sm text-[var(--muted)] leading-relaxed mt-1">{selected.desc}</p>}<div className="flex flex-wrap gap-2 mt-3">{selected.skills?.map(s=><span key={s} className="bg-[var(--surface-2)] border border-[var(--line)] px-3 py-1 rounded-full text-xs font-semibold">{s}</span>)}</div></div>}
              {selected.portfolio && <div><h4 className="font-bold">Portofolio Singkat</h4><p className="text-sm text-[var(--muted)] leading-relaxed mt-1">{selected.portfolio}</p></div>}
              {!!selected.reviews?.length && <div><h4 className="font-bold">Review Pelanggan</h4><div className="space-y-3 mt-2">{selected.reviews.map((r,i)=>(<div key={i} className="bg-[var(--surface-2)] rounded-2xl p-3"><div className="flex justify-between"><p className="font-bold text-sm">{r.name} <span className="font-normal text-xs text-[var(--muted)]">• {r.area}</span></p><span className="text-[#E8B44A] text-xs">{"★".repeat(r.stars)}</span></div><p className="text-sm text-[var(--muted)] mt-1 leading-relaxed">“{r.text}”</p></div>))}</div></div>}
            </div>
            <div className="detail-footer bg-[var(--surface-2)]">
                {unlockedContacts[selected.id] ? <><div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm"><Phone size={16}/><b>{unlockedContacts[selected.id].no_wa_terbuka}</b></div><a href={waLink(selected,unlockedContacts[selected.id].no_wa_terbuka)} target="_blank" rel="noopener noreferrer" onClick={()=>markChat(unlockedContacts[selected.id])} className="mt-3 flex items-center justify-center gap-2 w-full bg-[#1F7A4D] text-white font-bold py-3 rounded-xl"><MessageCircle size={17}/> Chat WhatsApp Sekarang</a>{unlockedContacts[selected.id].status === "active" && Date.now() <= Date.parse(unlockedContacts[selected.id].garansi_sampai) && <button onClick={()=>setShowReport(true)} className="mt-2 flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-[var(--line)] px-3 text-sm font-bold"><ShieldAlert size={16}/> Laporkan masalah kontak</button>}</> : <><div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm"><Phone size={16}/><b>Kontak terkunci</b><span className="text-xs text-[var(--muted)]">• 1 kredit untuk membuka</span></div><button disabled={saving} onClick={()=>handleUnlock(selected)} className="mt-3 w-full bg-[var(--accent)] text-white font-bold py-3 rounded-xl disabled:opacity-60">{credits>0?`Buka kontak, 1 kredit. Sisa: ${credits}`:"Beli kredit untuk membuka"}</button></>}
                <p className="text-[11px] text-[var(--muted)] mt-2 text-center">Kontak dan riwayat kredit tersimpan pada akun Anda.</p>
          </div>
        </ModalDialog>
      )}

      {/* TOAST */}
      {toast && <div role="status" aria-live="polite" className="fixed left-1/2 -translate-x-1/2 bottom-5 z-[60] w-[calc(100%-32px)] max-w-md bg-[#1A3C2A] text-white rounded-2xl px-4 py-3 shadow-2xl flex gap-2 items-start"><Check className="text-[#E8B44A] shrink-0 mt-0.5" size={18}/><p className="text-sm leading-snug flex-1">{toast}</p><button onClick={()=>setToast("")} aria-label="Tutup notifikasi" className="shrink-0"><X size={16}/></button></div>}
      {lastUnlockedName && <span className="sr-only">Kontak {lastUnlockedName} terbuka</span>}
    </div>
  );
}
