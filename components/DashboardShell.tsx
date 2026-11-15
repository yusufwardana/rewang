import { useState, type ComponentType, type FormEvent, type ReactNode } from "react";
import { ArrowLeft, Home, LogOut } from "lucide-react";
import { supabase } from "../lib/supabase";
import "../dashboard.css";

export type DashboardLink = { href: string; label: string };
export type DashboardNavItem = { id: string; label: string; icon: ComponentType<{ size?: number }> };

export function DashboardShell({
  title, subtitle, email, active, items, onNavigate, roleLinks, onSignOut, children,
}: {
  title: string; subtitle: string; email: string; active: string; items: DashboardNavItem[];
  onNavigate: (id: string) => void; roleLinks: DashboardLink[]; onSignOut: () => void; children: ReactNode;
}) {
  return <div className="dashboard-root">
    <header className="dashboard-topbar">
      <a className="dashboard-brand" href="/" aria-label="RewangOS beranda">
        <span className="dashboard-brand-mark"><Home size={19} strokeWidth={2.2} /></span>
        <span className="dashboard-brand-word">RewangOS</span>
      </a>
      <div className="dashboard-topbar-right">
        <span className="dashboard-user-email" title={email}>{email}</span>
        {roleLinks.length > 0 && <details className="dashboard-mobile-role-switch"><summary>Ganti</summary><div>{roleLinks.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}</div></details>}
        <button className="dashboard-logout" onClick={onSignOut}><LogOut size={16} /> Keluar</button>
      </div>
    </header>
    <div className="dashboard-frame">
      <aside className="dashboard-sidebar" aria-label="Navigasi dashboard">
        <div className="dashboard-side-intro"><span>RUANG KERJA</span><h1>{title}</h1><p>{subtitle}</p></div>
        <nav className="dashboard-nav">
          {items.map(item => {
            const Icon = item.icon;
            return <button key={item.id} className={`dashboard-nav-item${active === item.id ? " is-active" : ""}`}
              aria-current={active === item.id ? "page" : undefined} onClick={() => onNavigate(item.id)}>
              <Icon size={18} /><span>{item.label}</span>
            </button>;
          })}
        </nav>
        <div className="dashboard-role-switch">
          <span>BERALIH TAMPILAN</span>
          <a href="/" className="dashboard-switch-link"><ArrowLeft size={15} /> Direktori</a>
          {roleLinks.map(link => <a key={link.href} href={link.href} className="dashboard-switch-link">{link.label}</a>)}
        </div>
      </aside>
      <main className="dashboard-main">
        <div className="dashboard-page-content">{children}</div>
      </main>
    </div>
    <nav className="dashboard-mobile-nav" aria-label="Navigasi dashboard">
      {items.map(item => {
        const Icon = item.icon;
        return <button key={item.id} className={active === item.id ? "is-active" : ""}
          aria-current={active === item.id ? "page" : undefined} onClick={() => onNavigate(item.id)}>
          <Icon size={19} /><span>{item.label}</span>
        </button>;
      })}
    </nav>
  </div>;
}

export function DashboardAuth({ title, description, shouldCreateUser = true }: {
  title: string; description: string; shouldCreateUser?: boolean;
}) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) { setError("Koneksi akun belum dikonfigurasi."); return; }
    setBusy(true); setError(""); setMessage("");
    const result = await supabase.auth.signInWithOtp({
      email: email.trim(), options: { shouldCreateUser, emailRedirectTo: `${location.origin}${location.pathname}` },
    });
    setBusy(false);
    if (result.error) setError("Tautan masuk belum terkirim. Periksa email lalu coba lagi.");
    else setMessage("Tautan masuk sudah dikirim. Buka email ini untuk melanjutkan.");
  }
  return <div className="dashboard-auth-page">
    <a className="dashboard-brand" href="/"><span className="dashboard-brand-mark"><Home size={19}/></span><span className="dashboard-brand-word">RewangOS</span></a>
    <form className="dashboard-auth-card" onSubmit={send}>
      <span className="dashboard-kicker">AKUN REWANGOS</span><h1>{title}</h1><p>{description}</p>
      <label>Email<input type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} placeholder="nama@email.com" /></label>
      <button className="dashboard-primary" disabled={busy}>{busy ? "Mengirim tautan…" : "Kirim tautan masuk"}</button>
      {message && <p className="dashboard-success" role="status">{message}</p>}
      {error && <p className="dashboard-error" role="alert">{error}</p>}
    </form>
  </div>;
}

