# Input pekerja

1. Gunakan database RewangOS yang sudah memiliki tabel dasar `public.workers` (definisi lokal ada di `seed.sql`). Di database pengembangan kosong, jalankan seed lokal sebelum migrasi. Jangan jalankan seed demo pada database berisi data asli.
2. Terapkan migrasi RewangOS sesuai urutan, sampai `20261114210000_admin_worker_intake.sql`. Migrasi input pekerja menambah kolom tanpa mengganti `nama`, `kategori`, `deskripsi`, `pengalaman`, atau data lama. `worker_portfolios` menyimpan unggahan wizard; tabel lama `worker_portfolio_items` tetap utuh.
3. Pada Supabase Auth → URL Configuration, tambahkan URL penuh halaman `/admin/input-pekerja` ke Redirect URLs untuk setiap origin yang digunakan. Masuk dengan akun Auth yang sudah memiliki `app_metadata.role = "admin"`; refresh sesi setelah perubahan role.
4. Isi `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY` dengan konfigurasi proyek yang sama, jalankan `npm run dev`, lalu buka `/admin/input-pekerja`. Atur fallback SPA ke `index.html` jika aplikasi disajikan oleh host statis.

Foto profil dan portofolio disimpan di `worker-public-media`. Foto KTP disimpan di `worker-private-ktp`, dan tabel verifikasi hanya menyimpan path, tanpa URL publik. Jangan tambahkan izin baca umum untuk bucket KTP. Data anak dan profil disimpan dalam satu transaksi; objek Storage adalah operasi terpisah.

Katalog input ada di `lib/worker-intake.ts`: tujuh kategori lama ditambah Perawat Lansia dan Jasa Kebersihan. Daftar 12 kecamatan adalah pilihan cakupan awal untuk penambahan pekerja.
