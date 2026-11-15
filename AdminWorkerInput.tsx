import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, BadgeCheck, Check, Lock, MapPin, UserRound, X } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import { categories, consentAccept, consentError, consentExtensions, districts, DuplicateWhatsApp, emptyWorker, imageAccept, imageError, saveWorker, slugFromName, whatsappPattern, type PortfolioDraft, type WorkerDraft } from "./lib/worker-intake";
import { LEGAL_PATHS, LEGAL_VERSION } from "./lib/legal";
import "./admin-worker.css";

const steps = ["Data Diri", "Pekerjaan", "Verifikasi"];
const money = new Intl.NumberFormat("id-ID");
const maximumInteger = 2147483647;
const localToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="intake-field"><span>{label}</span>{children}</label>;
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="intake-choice intake-toggle"><span>{label}</span>
    <input type="checkbox" role="switch" checked={checked} onChange={event => onChange(event.target.checked)} />
  </label>;
}

function WorkerPreview({ draft, photo }: { draft: WorkerDraft; photo: File | null }) {
  const [image, setImage] = useState("");
  useEffect(() => {
    const url = photo ? URL.createObjectURL(photo) : "";
    setImage(url);
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [photo]);
  const name = draft.nama_lengkap.trim();
  return <aside className="intake-preview" aria-labelledby="intake-preview-title">
    <h2 id="intake-preview-title">Pratinjau kartu</h2>
    <article className="intake-card">
      <div className="intake-card-body">
        <div className="intake-identity">
          <div className="intake-avatar">
            {image ? <img alt="" src={image} /> : name ? name.split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase() : <UserRound size={22} aria-hidden="true" />}
          </div>
          <div>
            <h3>{name || "Nama pekerja"}</h3>
            <p className="intake-category">{draft.kategori_utama || "Kategori pekerjaan"}</p>
            <p className="intake-location"><MapPin size={15} aria-hidden="true" />{draft.kecamatan || "Kecamatan"}, Solo Raya</p>
          </div>
        </div>
        <div className="intake-badges">
          <span className={draft.is_available ? "intake-positive" : "intake-unavailable"}>{draft.is_available ? "Open Job" : "Busy"}</span>
          {draft.is_verified && <span className="intake-positive"><BadgeCheck size={14} aria-hidden="true" /> Terverifikasi</span>}
        </div>
        {draft.bio.trim() && <p className="intake-bio">{draft.bio.trim()}</p>}
        {draft.keahlian.length > 0 && <ul className="intake-skill-preview">{draft.keahlian.map(skill => <li key={skill}>{skill}</li>)}</ul>}
        <p className="intake-rate"><strong>{draft.tarif_harian ? `Rp ${money.format(Number(draft.tarif_harian))}` : "Rp —"}</strong> /hari</p>
      </div>
      <p className="intake-card-footer"><Lock size={15} aria-hidden="true" /> Kontak terkunci</p>
    </article>
  </aside>;
}

function WorkerWizard({ adminId, onSaved }: { adminId: string; onSaved: () => void }) {
  const [draft, setDraft] = useState(emptyWorker);
  const [step, setStep] = useState(0);
  const [photo, setPhoto] = useState<File | null>(null);
  const [ktp, setKtp] = useState<File | null>(null);
  const [consent, setConsent] = useState<File | null>(null);
  const [portfolios, setPortfolios] = useState<PortfolioDraft[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const pending = useRef(false);
  const [focusStep, setFocusStep] = useState(0);
  useEffect(() => { if (focusStep) heading.current?.focus(); }, [focusStep]);

  function go(next: number, message = "") {
    setError(message);
    setStep(next);
    setFocusStep(count => count + 1);
  }

  function change<K extends keyof WorkerDraft>(key: K, value: WorkerDraft[K]) {
    setDraft(current => ({ ...current, [key]: value }));
    if (key === "no_wa") setError("");
  }

  const text = (key: keyof Pick<WorkerDraft, "nama_lengkap" | "nama_panggilan" | "no_wa" | "tanggal_lahir" | "kelurahan" | "tarif_harian" | "tarif_per_jam" | "pengalaman_tahun">) => ({
    name: key, value: draft[key], onChange: (event: React.ChangeEvent<HTMLInputElement>) => change(key, event.target.value),
  });
  const chooseImage = (file: File | undefined, setter: (file: File) => void) => {
    if (!file) return;
    const issue = imageError(file);
    setError(issue);
    if (!issue) setter(file);
  };
  const skills = Object.hasOwn(categories, draft.kategori_utama) ? categories[draft.kategori_utama as keyof typeof categories] : [];
  const slug = slugFromName(draft.nama_lengkap);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    if (step === 0 && !slug) { setError("Nama lengkap harus memuat huruf atau angka untuk membuat slug."); return; }
    if (step === 1 && !draft.kelurahan.trim()) { setError("Isi kelurahan atau desa."); return; }
    if (step < 2) { go(step + 1); return; }
    if (!draft.izin_sebar_nomor || !supabase) return;
    if (!consent || consentError(consent)) { setError("Unggah formulir persetujuan Worker yang sudah ditandatangani."); return; }
    if (portfolios.some(item => !item.title.trim())) { setError("Isi judul untuk setiap foto portofolio."); return; }
    setSuccess("");
    setError("");
    setSaving(true);
    pending.current = true;
    try {
      await saveWorker(supabase, adminId, draft, photo, ktp, portfolios, consent);
      onSaved();
      setSuccess(`${draft.nama_lengkap.trim()} berhasil disimpan. Formulir siap untuk pekerja berikutnya.`);
      form.current?.reset();
      setDraft(emptyWorker());
      setPhoto(null);
      setKtp(null);
      setConsent(null);
      setPortfolios([]);
      go(0);
    } catch (issue) {
      if (issue instanceof DuplicateWhatsApp) go(0, "Nomor WhatsApp sudah terdaftar. Periksa nomor atau gunakan nomor lain.");
      else setError(issue instanceof Error ? issue.message : "Pekerja belum bisa disimpan. Coba lagi.");
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }

  return <>
    <ol className="intake-steps" aria-label="Langkah input pekerja">{steps.map((label, index) =>
      <li key={label} aria-current={step === index ? "step" : undefined}>
        <button type="button" disabled={index > step || saving} onClick={() => { if (index < step) go(index); }}>
          <span className="intake-step-number">{index < step ? <Check size={17} aria-label="Selesai" /> : index + 1}</span>
          <span>{label}</span>
        </button>
      </li>)}</ol>
    {success && <p className="intake-message intake-positive" role="status"><Check size={17} aria-hidden="true" /> {success}</p>}
    <div className="intake-layout">
      <form className="intake-form" ref={form} onSubmit={submit}>
        <div className="intake-form-heading">
          <p>Langkah {step + 1} dari 3</p>
          <h2 ref={heading} tabIndex={-1}>{steps[step]}</h2>
          <p>{["Isi identitas dan kontak WhatsApp pekerja.", "Tentukan area kerja, tarif, dan keahlian.", "Unggah formulir izin tampil sekali saat mendaftarkan pekerja."][step]}</p>
        </div>
        <fieldset key={step} className="intake-fields" disabled={saving} aria-label={steps[step]}>
          {step === 0 && <>
            <Field label="Nama lengkap"><input {...text("nama_lengkap")} required maxLength={120} /></Field>
            <Field label="Nama panggilan (opsional)"><input {...text("nama_panggilan")} maxLength={60} /></Field>
            <Field label="Nomor WhatsApp"><input {...text("no_wa")} type="tel" inputMode="numeric" autoComplete="off" pattern={whatsappPattern.source} title="Mulai dengan 08 dan isi 10–13 digit." placeholder="08xxxxxxxxxx" required maxLength={13} aria-describedby="intake-wa-hint" /><small id="intake-wa-hint">10–13 digit, diawali 08, tanpa spasi.</small></Field>
            <Field label="Jenis kelamin (opsional)"><select value={draft.jenis_kelamin} onChange={event => change("jenis_kelamin", event.target.value)}>
              <option value="">Pilih jenis kelamin</option><option value="perempuan">Perempuan</option><option value="laki-laki">Laki-laki</option>
            </select></Field>
            <Field label="Tanggal lahir (opsional)"><input {...text("tanggal_lahir")} type="date" max={localToday()} /></Field>
            <Field label="Slug profil"><input value={slug} readOnly placeholder="Dibuat dari nama lengkap" /><small>Nama yang sama mendapat akhiran otomatis.</small></Field>
            <div className="intake-wide">
              <Field label="Foto profil (opsional)"><input type="file" accept={imageAccept} onChange={event => { chooseImage(event.target.files?.[0], setPhoto); event.target.value = ""; }} /><small>JPG, PNG, atau WebP. Maks. 5 MB.</small></Field>
              {photo && <SelectedFile file={photo} onRemove={() => setPhoto(null)} />}
            </div>
          </>}
          {step === 1 && <>
            <Field label="Kategori utama"><select required value={draft.kategori_utama} onChange={event => setDraft(current => ({ ...current, kategori_utama: event.target.value, keahlian: [] }))}>
              <option value="">Pilih kategori</option>{Object.keys(categories).map(category => <option key={category}>{category}</option>)}
            </select></Field>
            <Field label="Kecamatan"><select required value={draft.kecamatan} onChange={event => {
              const kecamatan = event.target.value;
              setDraft(current => ({ ...current, kecamatan, kelurahan: "", kabupaten_kota: districts[kecamatan as keyof typeof districts] || "" }));
            }}><option value="">Pilih kecamatan</option>{Object.keys(districts).map(value => <option key={value}>{value}</option>)}</select></Field>
            <Field label="Kelurahan / desa"><input {...text("kelurahan")} required maxLength={100} /></Field>
            <Field label="Kabupaten / kota"><input value={draft.kabupaten_kota} readOnly placeholder="Mengikuti kecamatan" /></Field>
            <Field label="Tarif harian"><span className="intake-currency"><b aria-hidden="true">Rp</b><input {...text("tarif_harian")} type="number" min={1} max={maximumInteger} required /></span></Field>
            <Field label="Tarif per jam (opsional)"><span className="intake-currency"><b aria-hidden="true">Rp</b><input {...text("tarif_per_jam")} type="number" min={1} max={maximumInteger} /></span></Field>
            <Field label="Pengalaman, dalam tahun (opsional)"><input {...text("pengalaman_tahun")} type="number" min={0} max={100} /></Field>
            <fieldset className="intake-wide intake-skills"><legend>Keahlian</legend>
              {skills.length ? <div>{skills.map(skill => <label className="intake-choice" key={skill}>
                <input type="checkbox" checked={draft.keahlian.includes(skill)} onChange={event => change("keahlian", event.target.checked ? [...draft.keahlian, skill] : draft.keahlian.filter(value => value !== skill))} />{skill}
              </label>)}</div> : <small>Pilih kategori untuk melihat pilihan keahlian.</small>}
            </fieldset>
            <div className="intake-wide"><Field label="Bio (opsional)"><textarea rows={3} maxLength={200} value={draft.bio} onChange={event => change("bio", event.target.value)} /><small>{draft.bio.length}/200 karakter</small></Field></div>
          </>}
          {step === 2 && <>
            <div className="intake-wide">
              <Field label="Foto KTP (opsional)"><input type="file" accept={imageAccept} onChange={event => { chooseImage(event.target.files?.[0], setKtp); event.target.value = ""; }} /><small>Hanya admin yang dapat mengaksesnya. Maks. 5 MB.</small></Field>
              {ktp && <SelectedFile file={ktp} onRemove={() => setKtp(null)} />}
            </div>
            <div className="intake-wide">
              <Field label={`Foto portofolio (${portfolios.length}/3)`}><input type="file" multiple accept={imageAccept} disabled={portfolios.length === 3} onChange={event => {
                const files = Array.from(event.target.files ?? []);
                event.target.value = "";
                if (!files.length) return;
                const issue = portfolios.length + files.length > 3 ? "Maksimal 3 foto portofolio." : files.map(imageError).find(Boolean);
                setError(issue || "");
                if (!issue) setPortfolios(current => [...current, ...files.map(file => ({ id: crypto.randomUUID(), file, title: "" }))]);
              }} /><small>Foto portofolio dapat dilihat publik. JPG, PNG, atau WebP, maks. 5 MB per foto.</small></Field>
              {portfolios.map((item, index) => <div className="intake-portfolio" key={item.id}>
                <SelectedFile file={item.file} onRemove={() => setPortfolios(current => current.filter(value => value.id !== item.id))} />
                <Field label={`Judul portofolio ${index + 1}`}><input required maxLength={120} value={item.title} onChange={event => {
                  const title = event.target.value;
                  setPortfolios(current => current.map(value => value.id === item.id ? { ...value, title } : value));
                }} /></Field>
              </div>)}
            </div>
            <Toggle label="Sudah Test Call" checked={draft.is_verified} onChange={checked => change("is_verified", checked)} />
            <Toggle label="Tersedia untuk bekerja" checked={draft.is_available} onChange={checked => change("is_available", checked)} />
            <div className="intake-wide">
              <p>Bacakan <a href={LEGAL_PATHS.worker} target="_blank" rel="noopener noreferrer">Ketentuan Worker</a> dan <a href={LEGAL_PATHS.privacy} target="_blank" rel="noopener noreferrer">Kebijakan Privasi</a>, lalu minta Worker menandatangani <a href={LEGAL_PATHS.consent} target="_blank" rel="noopener noreferrer">formulir persetujuan versi {LEGAL_VERSION}</a>.</p>
              <Field label="Formulir persetujuan bertanda tangan"><input type="file" accept={consentAccept} required={!consent} onChange={event=>{ const file=event.target.files?.[0]; event.target.value=""; if(!file)return; const issue=consentError(file); setError(issue); if(!issue)setConsent(file); }} /><small>PDF atau foto, maksimal 5 MB. Disimpan privat dan hanya dapat diakses admin.</small></Field>
              {consent && <SelectedFile file={consent} onRemove={()=>setConsent(null)} />}
            </div>
            <label className="intake-choice intake-consent intake-wide"><input type="checkbox" name="izin_sebar_nomor" required checked={draft.izin_sebar_nomor} onChange={event => change("izin_sebar_nomor", event.target.checked)} /> <span>Saya sudah memeriksa tanda tangan dan memastikan Worker menyetujui penayangan profil serta pembagian nomor kepada Pencari Pekerja yang membuka kontak. <strong>(Wajib)</strong></span></label>
          </>}
        </fieldset>
        {error && <p role="alert" className="intake-message intake-error">{error}</p>}
        <div className="intake-actions">
          {step > 0 && <button type="button" className="intake-secondary" disabled={saving} onClick={() => go(step - 1)}><ArrowLeft size={16} aria-hidden="true" /> Kembali</button>}
          <button className="intake-primary" disabled={saving}>{saving ? "Menyimpan…" : step === 2 ? "Simpan & Tambah Lagi" : <>Lanjut ke {steps[step + 1]} <ArrowRight size={16} aria-hidden="true" /></>}</button>
        </div>
      </form>
      <WorkerPreview draft={draft} photo={photo} />
    </div>
  </>;
}

function SelectedFile({ file, onRemove }: { file: File; onRemove: () => void }) {
  return <div className="intake-file"><span>{file.name}</span><button type="button" aria-label={`Hapus ${file.name}`} onClick={onRemove}><X size={17} aria-hidden="true" /></button></div>;
}

type WorkerListing = {
  id: number;
  nama: string;
  kategori: string;
  is_available: boolean;
  listing_active: boolean;
  consent_recorded_at: string | null;
  consent_withdrawn_at: string | null;
};

function WorkerListings({ adminId, listRevision }: { adminId: string; listRevision: number }) {
  const [list,setList]=useState<WorkerListing[]>([]);
  const [file,setFile]=useState<File|null>(null);
  const [selectedId,setSelectedId]=useState<number|null>(null);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  async function refresh() {
    if(!supabase)return;
    const {data,error}=await supabase.rpc("admin_list_worker_listings");
    if(error)setMessage("Daftar listing gagal dimuat. Pastikan migrasi legal sudah diterapkan.");
    else setList((data??[]) as WorkerListing[]);
  }
  useEffect(()=>{void refresh();},[listRevision]);

  async function changeAvailability(worker: WorkerListing) {
    if (!supabase || busy) return;
    const isAvailable = !worker.is_available;
    setBusy(true);
    setMessage("");
    try {
      const { error } = await supabase.rpc("admin_set_worker_availability", {
        p_worker_id: worker.id,
        p_is_available: isAvailable,
      });
      if (error) throw error;
      setList(current => current.map(item => item.id === worker.id ? { ...item, is_available: isAvailable } : item));
      setMessage(`Status ${worker.nama} diubah ke ${isAvailable ? "Open Job" : "Busy"}.`);
    } catch {
      setMessage("Status kerja belum bisa diubah. Coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    if(!supabase || !file || selectedId===null)return;
    const issue=consentError(file);
    if(issue){setMessage(issue);return;}
    setBusy(true);setMessage("");
    const path=`${adminId}/${crypto.randomUUID()}/persetujuan.${consentExtensions[file.type]}`;
    const {error:uploadError}=await supabase.storage.from("worker-private-consent").upload(path,file,{contentType:file.type});
    if(uploadError){setMessage("Formulir belum bisa diunggah.");setBusy(false);return;}
    const {error}=await supabase.rpc("admin_publish_worker_with_consent",{
      p_worker_id:selectedId,p_consent_path:path,p_consent_version:LEGAL_VERSION,
    });
    if(error){
      // Keep the file if the server may have saved the consent before losing the response.
      if (error.code === "22023" || error.code === "P0002" || error.code === "42501") {
        await supabase.storage.from("worker-private-consent").remove([path]);
      }
      setMessage("Listing belum bisa diterbitkan. Periksa formulir dan migrasi.");
    } else {
      setMessage("Izin tampil pekerja tercatat.");
      setSelectedId(null);setFile(null);await refresh();
    }
    setBusy(false);
  }
  async function withdraw(id:number) {
    if(!supabase || !window.confirm("Pekerja sudah menarik izinnya? Profil akan disembunyikan dan pengguna tidak bisa membuka kontak baru."))return;
    setBusy(true);setMessage("");
    const {error}=await supabase.rpc("admin_withdraw_worker_listing",{p_worker_id:id});
    setMessage(error ? "Listing belum bisa dinonaktifkan." : "Listing dinonaktifkan. Kontak baru tidak dapat dibuka.");
    if(!error)await refresh();
    setBusy(false);
  }
  return <section className="mt-10 rounded-xl border border-[var(--line)] bg-white p-5" aria-labelledby="listing-title">
    <h2 id="listing-title" className="font-display text-xl font-bold">Status pekerja</h2>
    <p className="mt-2 text-sm">Ubah status kerja ke Open Job atau Busy sesuai ketersediaan pekerja. Profil tetap tampil selama izin tampil aktif.</p>
    <button type="button" className="intake-secondary mt-3" disabled={busy} onClick={()=>void refresh()}>Muat ulang daftar</button>
    {message && <p role="status" className="intake-message">{message}</p>}
    <div className="mt-4 max-h-96 space-y-3 overflow-y-auto">
      {list.map(worker => {
        const canRecordConsent = !worker.consent_recorded_at || Boolean(worker.consent_withdrawn_at);
        return <article key={worker.id} className="rounded-lg border border-[var(--line)] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <strong>{worker.nama}</strong>
              <p className="text-sm">{worker.kategori} · {worker.is_available ? "Open Job" : "Busy"}</p>
            </div>
            <button type="button" className="intake-secondary" disabled={busy} onClick={() => void changeAvailability(worker)}>
              {worker.is_available ? "Ubah ke Busy" : "Ubah ke Open Job"}
            </button>
          </div>
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer font-semibold">Izin tampil · {worker.listing_active ? "Profil tampil" : "Profil disembunyikan"}</summary>
            <p className="my-2">{worker.consent_withdrawn_at ? "Izin ditarik oleh pekerja." : worker.consent_recorded_at ? "Formulir sudah tercatat." : "Formulir belum tercatat untuk profil ini."}</p>
            <div className="flex flex-wrap gap-2">
              {canRecordConsent && <button type="button" className="intake-secondary" disabled={busy} onClick={() => { setSelectedId(worker.id); setFile(null); }}>
                {worker.consent_withdrawn_at ? "Catat izin baru" : "Catat izin pertama kali"}
              </button>}
              {worker.listing_active && <button type="button" className="intake-secondary" disabled={busy} onClick={() => void withdraw(worker.id)}>
                Catat penarikan izin
              </button>}
            </div>
            {canRecordConsent && selectedId === worker.id && <div className="mt-3">
              <p>Unggah formulir yang sudah ditandatangani pekerja. <a href={LEGAL_PATHS.consent} target="_blank" rel="noopener noreferrer" className="underline">Buka formulir</a></p>
              <input className="mt-2" aria-label={`Formulir persetujuan ${worker.nama}`} type="file" accept={consentAccept} disabled={busy} onChange={event => {
                const chosen = event.target.files?.[0];
                const issue = chosen ? consentError(chosen) : "";
                setFile(issue ? null : chosen ?? null);
                setMessage(issue);
              }} />
              <button type="button" className="intake-primary mt-3" disabled={busy || !file} onClick={() => void publish()}>Simpan izin tampil</button>
            </div>}
          </details>
        </article>;
      })}
    </div>
  </section>;
}

export default function AdminWorkerInput() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [authError, setAuthError] = useState("");
  const [sending, setSending] = useState(false);
  const [listRevision, setListRevision] = useState(0);
  useEffect(() => {
    document.title = "Input Pekerja | RewangOS";
    if (!supabase) return;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
    return () => subscription.unsubscribe();
  }, []);
  const isAdmin = user?.app_metadata.role === "admin";
  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || sending) return;
    setSending(true);
    setAuthError("");
    setNote("");
    try {
      const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: false, emailRedirectTo: `${location.origin}/admin/input-pekerja` } });
      if (error) setAuthError("Tautan masuk gagal dikirim. Periksa email admin dan coba lagi.");
      else setNote("Periksa email admin untuk membuka tautan masuk.");
    } catch {
      setAuthError("Tautan masuk gagal dikirim. Coba lagi.");
    } finally { setSending(false); }
  }
  return <div className="intake-page">
    <header className="intake-header"><div className="intake-shell">
      <a className="font-display" href="/">RewangOS</a><span>Admin</span>
      {user && <button type="button" onClick={async () => {
        const result = await supabase?.auth.signOut();
        if (result?.error) setAuthError("Belum bisa keluar. Coba lagi.");
      }}>Keluar</button>}
    </div></header>
    <main className="intake-shell intake-main">
      <a className="intake-back" href="/"><ArrowLeft size={16} aria-hidden="true" /> Direktori</a>
      <h1 className="font-display">Input pekerja</h1>
      <p className="intake-intro">Tambahkan profil pekerja ke direktori RewangOS.</p>
      {authError && <p className="intake-message intake-error" role="alert">{authError}</p>}
      {!supabase ? <p className="intake-message intake-error" role="alert">Koneksi Supabase belum dikonfigurasi.</p>
      : user === undefined ? <p role="status">Memeriksa sesi admin…</p>
      : isAdmin ? <>
        <WorkerWizard key={user.id} adminId={user.id} onSaved={() => setListRevision(revision => revision + 1)} />
        <WorkerListings key={`listings-${user.id}`} adminId={user.id} listRevision={listRevision} />
      </>
      : user ? <div className="intake-gate"><h2>Akses khusus admin</h2><p>Keluar lalu masuk dengan akun admin RewangOS.</p></div>
      : <form className="intake-gate" onSubmit={signIn}>
        <h2>Masuk sebagai admin</h2>
        <p>Masukkan email akun admin untuk menerima tautan masuk.</p>
        <Field label="Email admin"><input type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} /></Field>
        <button className="intake-primary" disabled={sending}>{sending ? "Mengirim…" : "Kirim tautan masuk"}</button>
        {note && <p role="status">{note}</p>}
      </form>}
    </main>
  </div>;
}
