import type { ReactNode } from "react";
import { LEGAL_PATHS, LEGAL_VERSION } from "./lib/legal";
import "./legal.css";

const operator = "COSMICLABS MEDIA";
const address = "Wuryantoro, Wonogiri";
const complaintNumber = "083871374743";
const contact = <a className="legal-phone" href={`tel:+62${complaintNumber.slice(1)}`}>{complaintNumber}</a>;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className="mb-8"><h2 className="mb-3 text-xl font-bold text-[var(--primary)]">{title}</h2><div className="space-y-3 leading-relaxed">{children}</div></section>;
}

export default function LegalPage() {
  const path = location.pathname.replace(/\/+$/, "");
  const title = path === LEGAL_PATHS.terms ? "Syarat Layanan Pencari Pekerja"
    : path === LEGAL_PATHS.worker ? "Ketentuan Worker"
    : path === LEGAL_PATHS.privacy ? "Kebijakan Privasi"
    : path === LEGAL_PATHS.consent ? "Formulir Persetujuan Worker" : "";
  if (!title) return <main className="mx-auto max-w-3xl p-6"><h1>Halaman tidak ditemukan</h1><a href="/">Kembali ke RewangOS</a></main>;
  return <div className="legal-page min-h-screen bg-[var(--surface-2)] text-[var(--ink)]">
    <header className="legal-header bg-[var(--primary)] px-5 py-3 text-white print:hidden">
      <div className="mx-auto flex max-w-[44rem] flex-wrap items-center justify-between gap-x-4">
        <a href="/" className="legal-nav-link font-display text-xl">RewangOS</a>
        <a href="/" className="legal-nav-link text-sm underline">Kembali ke direktori</a>
      </div>
    </header>
    <main className="legal-document mx-auto my-5 max-w-[44rem] bg-[var(--surface)] px-5 py-8 shadow-sm sm:px-10">
      <p className="mb-2 text-sm text-[var(--muted)]">Versi {LEGAL_VERSION}</p>
      <h1 className="mb-7 font-display text-3xl sm:text-4xl">{title}</h1>
      {path === LEGAL_PATHS.terms && <>
        <Section title="1. Para pihak dan layanan"><p>RewangOS dioperasikan oleh {operator}, beralamat di {address}, dengan kontak resmi {contact}. Pengguna jasa (“Pencari Pekerja”) dapat melihat direktori penyedia jasa (“Worker”), membeli kredit, dan membuka nomor WhatsApp Worker. RewangOS menyediakan direktori dan akses kontak, bukan pihak dalam kesepakatan pekerjaan antara Pencari Pekerja dan Worker.</p></Section>
        <Section title="2. Akun, paket, dan kredit"><p>Pencari Pekerja masuk menggunakan email dan melengkapi profil yang benar. Harga, jumlah kredit, dan biaya per kontak ditampilkan sebelum pembayaran. Pembayaran diproses oleh Midtrans; kredit masuk setelah pembayaran terverifikasi. Satu kredit membuka satu nomor Worker untuk akun pembeli yang sama. Kredit tidak kedaluwarsa selama akun aktif. Kredit tidak dapat ditukar menjadi uang tunai; permintaan pengembalian pembayaran yang diwajibkan hukum tetap dapat disampaikan kepada RewangOS.</p></Section>
        <Section title="3. Penggunaan kontak dan kesepakatan kerja"><p>Nomor yang dibuka hanya boleh digunakan untuk menghubungi Worker mengenai jasa yang ditampilkan. Dilarang menyebarkan, menjual, mengirim spam, melecehkan, atau memakai nomor untuk tujuan melawan hukum. Pencari Pekerja dan Worker sendiri yang menyepakati tarif akhir, lingkup kerja, jadwal, lokasi, pembayaran upah, keselamatan, dan pelaksanaan pekerjaan setelah saling menghubungi.</p><p>Kejadian yang timbul dari pertemuan, komunikasi, kesepakatan, atau pekerjaan di luar aplikasi menjadi urusan para pihak yang terlibat. RewangOS tetap bertanggung jawab atas kewajibannya terkait layanan aplikasi, informasi yang diberikannya, pelindungan data, transaksi kredit, serta garansi yang dinyatakan di sini sesuai hukum yang berlaku.</p></Section>
        <Section title="4. Garansi kontak 24 jam"><p>Dalam 24 jam sejak nomor dibuka, Pencari Pekerja dapat mengajukan laporan melalui fitur “Laporkan masalah kontak” apabila nomor salah, nomor tidak aktif, atau Worker menolak dihubungi untuk jasa yang ditampilkan. RewangOS meninjau alasan dan bukti yang diberikan. Apabila klaim disetujui, satu kredit dikembalikan ke saldo akun sekali untuk kontak tersebut. Garansi ini menyangkut akses kontak, bukan jaminan Worker menerima pekerjaan atau hasil pekerjaan. Pengaduan lain tetap dapat diajukan melalui {contact}.</p></Section>
        <Section title="5. Informasi profil dan verifikasi"><p>Tarif, ketersediaan, keahlian, dan informasi profil dapat berubah. Label “Terverifikasi” berarti admin telah mencatat test call; label tersebut bukan jaminan identitas, kecakapan, keamanan, atau hasil pekerjaan. Periksa kecocokan pekerjaan langsung dengan Worker sebelum membuat kesepakatan.</p></Section>
        <Section title="6. Keluhan, perubahan, dan hukum"><p>Keluhan tentang pembayaran, kontak, data pribadi, atau layanan dapat dikirim ke {contact}. RewangOS akan memeriksa dan memberi tanggapan melalui kontak yang tersedia. Perubahan syarat diumumkan dengan versi dan tanggal baru; transaksi baru memerlukan penerimaan versi terbaru. Hukum Indonesia berlaku, tanpa mengurangi hak pengguna menurut peraturan perlindungan konsumen.</p></Section>
      </>}
      {path === LEGAL_PATHS.worker && <>
        <Section title="1. Pencantuman profil"><p>Worker mengizinkan {operator} menampilkan nama, kategori, area kerja, tarif indikatif, keahlian, bio, foto profil, dan portofolio yang disetujui pada direktori RewangOS. Nomor WhatsApp tidak tampil dalam direktori umum; nomor dibuka kepada Pencari Pekerja yang memakai satu kredit. Worker tidak dikenai biaya untuk pencantuman profil dalam layanan saat ini.</p></Section>
        <Section title="2. Persetujuan dan pemeriksaan"><p>Saat didaftarkan, Worker menerima penjelasan ini dan Kebijakan Privasi, lalu menandatangani satu Formulir Persetujuan Worker. Admin menyimpan bukti persetujuan secara privat. Perubahan status ketersediaan, seperti Open Job atau Busy, tidak memerlukan formulir baru. Foto KTP, jika diberikan, hanya untuk pemeriksaan internal dan tidak tampil kepada publik. Label “Terverifikasi” menunjukkan adanya test call yang dicatat admin; bukan sertifikasi keterampilan atau jaminan hasil kerja.</p></Section>
        <Section title="3. Hubungan dengan Pencari Pekerja"><p>Worker menentukan sendiri kesediaan menerima permintaan. Tarif akhir, jadwal, lingkup, lokasi, pembayaran, dan pelaksanaan pekerjaan disepakati langsung dengan Pencari Pekerja. Kedua pihak bertanggung jawab atas tindakan dan kesepakatannya di luar aplikasi. RewangOS tetap menangani kewajibannya atas direktori, data pribadi, pembayaran kredit, dan garansi kontak sesuai hukum.</p></Section>
        <Section title="4. Koreksi dan penarikan profil"><p>Worker dapat meminta koreksi atau penonaktifan profil serta menarik persetujuan pembagian nomor melalui {contact}. Setelah permintaan terverifikasi, RewangOS menghentikan penayangan profil dan pembukaan kontak baru. Nomor yang sudah dibuka sebelumnya mungkin telah tersimpan pada akun Pencari Pekerja; RewangOS tidak dapat menarik kembali salinan yang telah diterima pihak tersebut. Data yang masih wajib disimpan karena transaksi atau hukum ditangani menurut Kebijakan Privasi.</p></Section>
        <Section title="5. Perubahan"><p>Perubahan materi persetujuan listing memerlukan persetujuan worker yang baru sebelum profil diterbitkan kembali. Hukum Indonesia berlaku.</p></Section>
      </>}
      {path === LEGAL_PATHS.privacy && <>
        <Section title="1. Pengendali data dan kontak"><p>Pengendali data adalah {operator}, {address}. Permintaan terkait data pribadi dapat dikirim ke {contact}. Pemberitahuan ini berlaku untuk Pencari Pekerja dan Worker.</p></Section>
        <Section title="2. Data dan tujuan"><p>Untuk Pencari Pekerja, kami memproses email login, nama, nomor WhatsApp, area, jenis pengguna, order, saldo dan riwayat kredit, kontak yang dibuka, laporan, serta catatan persetujuan untuk menjalankan akun, pembayaran, akses kontak, bantuan, dan pencegahan penyalahgunaan. Untuk Worker, kami memproses nama, nomor WhatsApp, area, tarif, keahlian, foto profil dan portofolio, hasil test call, formulir persetujuan, serta foto KTP jika diberikan untuk menampilkan profil, membuka kontak sesuai izin, dan pemeriksaan internal.</p><p>Data yang diperlukan untuk layanan dan transaksi diproses untuk pelaksanaan perjanjian dan kewajiban hukum yang relevan. Penayangan profil dan pembagian nomor Worker didasarkan pada persetujuan tertulis Worker yang dapat ditarik. Pemberitahuan lewat WhatsApp hanya dikirim bila fitur dan penyedia terkait diaktifkan.</p></Section>
        <Section title="3. Penerima dan akses"><p>Profil dan foto publik dapat dilihat pengunjung. Nomor Worker hanya diberikan kepada akun Pencari Pekerja yang membuka kontak. Admin berwenang mengakses data operasional, foto KTP, dan formulir persetujuan yang tersimpan privat. Supabase digunakan untuk autentikasi, basis data, dan penyimpanan; Midtrans memproses pembayaran. WhatsApp/Meta dapat menerima data yang diperlukan ketika pengguna membuka chat atau pemberitahuan Worker diaktifkan. Masing-masing penyedia memproses data sesuai perannya dan kebijakan yang berlaku.</p></Section>
        <Section title="4. Penyimpanan dan penghapusan">
          <p>Data akun dan profil yang diperlukan untuk layanan disimpan selama akun atau profil aktif. Saat profil ditarik, RewangOS menghentikan penayangan dan pembukaan kontak baru. Data operasional yang tidak lagi diperlukan dihapus atau dianonimkan paling lambat 90 hari setelah akun ditutup atau profil ditarik.</p>
          <ul className="list-disc space-y-2 pl-6">
            <li>Foto KTP yang diberikan untuk pemeriksaan dihapus paling lambat 30 hari setelah pemeriksaan selesai atau dibatalkan.</li>
            <li>Bukti izin tampil disimpan selama izin aktif dan sampai satu tahun setelah izin berakhir.</li>
            <li>Catatan perdagangan elektronik yang berkaitan dengan transaksi keuangan disimpan 10 tahun sejak diperoleh. Catatan perdagangan elektronik lain yang wajib disimpan, termasuk konfirmasi, persetujuan kontrak, dan pengaduan, disimpan 5 tahun sejak diperoleh.</li>
          </ul>
          <p>RewangOS menyimpan data lebih lama jika diwajibkan hukum atau jika data masih diperlukan untuk sengketa yang sedang berjalan. Salinan cadangan mengikuti siklus penghapusan penyedia penyimpanan. RewangOS memberi tahu pemohon tentang hasil permintaan penghapusan yang telah diverifikasi.</p>
        </Section>
        <Section title="5. Hak subjek data"><p>Anda dapat meminta informasi, akses, salinan, perbaikan, penarikan persetujuan, penghentian pemrosesan, atau penghapusan sesuai hukum yang berlaku melalui {contact}. Kami akan memverifikasi identitas pemohon dan memberi jawaban melalui kontak yang tersedia. Penarikan izin listing menghentikan penerbitan profil dan pembukaan kontak baru, tetapi tidak otomatis menghapus catatan transaksi yang masih wajib dipertahankan.</p></Section>
        <Section title="6. Keamanan, perubahan, dan pengaduan"><p>RewangOS membatasi akses ke data privat berdasarkan peran, menggunakan saluran aman, dan meninjau insiden data sesuai kewajiban hukum. Perubahan kebijakan diberi versi baru dan diberitahukan sebelum perubahan pemrosesan berbasis persetujuan berlaku. Pengaduan dapat dikirim ke {contact}.</p></Section>
      </>}
      {path === LEGAL_PATHS.consent && <>
        <p className="mb-6 print:hidden">Cetak atau simpan formulir ini, jelaskan kepada Worker, minta tanda tangan Worker, lalu unggah hasilnya melalui halaman admin. Versi ketentuan dan privasi: {LEGAL_VERSION}.</p>
        <Section title="Identitas Worker">
          <dl className="legal-paper-fields">
            {["Nama lengkap", "Nomor WhatsApp", "Kategori jasa"].map(label => (
              <div key={label}><dt>{label}</dt><dd /></div>
            ))}
          </dl>
        </Section>
        <Section title="Pernyataan persetujuan"><p>Saya telah membaca atau menerima penjelasan tentang <a className="underline" href={LEGAL_PATHS.worker}>Ketentuan Worker</a> dan <a className="underline" href={LEGAL_PATHS.privacy}>Kebijakan Privasi</a> versi {LEGAL_VERSION}. Saya mengizinkan profil, foto, dan portofolio yang saya berikan ditampilkan pada direktori RewangOS, serta nomor WhatsApp saya diberikan kepada Pencari Pekerja yang membuka kontak menggunakan kredit. Saya memahami bahwa foto KTP, jika saya berikan, disimpan privat untuk pemeriksaan internal. Saya dapat meminta koreksi atau penarikan listing melalui kontak resmi RewangOS.</p></Section>
        <dl className="legal-paper-fields legal-signatures">
          <div><dt>Tempat/tanggal</dt><dd /></div>
          <div className="legal-signature"><dt>Tanda tangan Worker</dt><dd /></div>
          <div><dt>Nama admin penerima</dt><dd /></div>
        </dl>
        <button type="button" className="legal-print-action mt-8 rounded-lg bg-[var(--primary)] px-4 py-2 text-white print:hidden" onClick={() => window.print()}>Cetak formulir</button>
      </>}
      <nav className="mt-10 flex flex-wrap gap-x-4 gap-y-1 border-t border-[var(--line)] pt-4 text-sm print:hidden">
        <a className="legal-nav-link underline" href={LEGAL_PATHS.terms}>Syarat Pencari Pekerja</a>
        <a className="legal-nav-link underline" href={LEGAL_PATHS.worker}>Ketentuan Worker</a>
        <a className="legal-nav-link underline" href={LEGAL_PATHS.privacy}>Kebijakan Privasi</a>
      </nav>
    </main>
  </div>;
}
