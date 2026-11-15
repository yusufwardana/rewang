# Operasi legal RewangOS

Versi dokumen aplikasi dan migrasi **2026-11-15**. Operator **COSMICLABS MEDIA**, Wuryantoro, Wonogiri. Kontak pengaduan **083871374743**.

## Sebelum publikasi

1. Unggah aset build dan salinan `index.html` untuk keempat URL legal. Siapkan salinan halaman utama dan admin untuk pergantian versi serta simpan salinan versi yang sedang aktif.
2. Terapkan migrasi `20261115120000_legal_consent_and_worker_listings.sql` setelah migrasi worker intake, lalu unggah halaman utama dan admin. Listing lama tetap tampil selama admin mengumpulkan formulir bertanda tangan. Worker baru terbit melalui RPC yang memeriksa unggahan persetujuan.
3. Pastikan bucket `worker-private-consent` privat dan hanya admin yang dapat membaca. Simpan formulir PDF atau foto maksimal 5 MB.
4. Uji alur checkout di Midtrans sandbox. Setelah akun dan profil siap, pengguna melihat Syarat Layanan Pencari Pekerja dan Kebijakan Privasi sebelum membayar. Database menolak order baru jika penerimaan kedua dokumen versi aktif belum tercatat.

Rilis 15 November 2026 tersedia di [RewangOS](https://rewang-os.cosmiclabs.web.id/). Migrasi legal sudah tercatat di proyek Supabase tertaut. Pemeriksaan setelah migrasi menemukan 12 profil masih tampil, pembatasan checkout aktif, dan bucket persetujuan privat. Admin dapat mencatat formulir pertama untuk profil lama dari bagian **Izin tampil**.

## Permintaan Worker

Unggah formulir bertanda tangan saat input pekerja baru. Setelah itu, gunakan tombol **Ubah ke Busy** atau **Ubah ke Open Job** sesuai ketersediaan. Kedua status tetap tampil di direktori selama izin aktif dan memakai formulir yang sudah tercatat.

Untuk profil lama yang belum punya bukti tersimpan, buka **Izin tampil** pada daftar pekerja dan pilih **Catat izin pertama kali**.

Verifikasi identitas pemohon melalui kanal yang pernah dicatat. Perbarui data yang relevan saat ada koreksi. Jika Worker menarik izinnya, pilih **Izin tampil → Catat penarikan izin**. Profil akan disembunyikan dan kontak baru tidak bisa dibuka. Nomor yang sudah dibuka sebelumnya mungkin sudah diterima oleh Pencari Pekerja. Catat tanggal permintaan, verifikasi, tindakan, dan jawaban. Jika Worker meminta tampil kembali setelah menarik izin, catat formulir baru yang ditandatangani.

## Klaim dan data pribadi

Klaim garansi kontak hanya untuk nomor salah, tidak aktif, atau Worker menolak, maksimal 24 jam setelah pembukaan. Admin meninjau bukti dan memberi alasan keputusan; satu kredit dikembalikan paling banyak sekali jika disetujui. Pengaduan mengenai pekerjaan di luar aplikasi diteruskan kepada para pihak, sementara keluhan tentang layanan RewangOS tetap ditangani operator.

Untuk permintaan akses, koreksi, penarikan persetujuan, atau penghapusan data, verifikasi pemohon, tentukan data dan dasar retensi, kerjakan penghapusan atau anonimisasi yang berlaku, lalu beri jawaban melalui kontak resmi.

Admin mencatat tanggal berakhirnya retensi dan menggunakan Supabase Storage atau basis data untuk menjalankan penghapusan sesuai jenis data. Lakukan peninjauan mingguan. Hapus foto KTP dari bucket privat dan kosongkan referensinya paling lambat 30 hari setelah pemeriksaan selesai atau dibatalkan. Hapus atau anonimkan data operasional yang sudah tidak diperlukan dalam 90 hari sejak penutupan akun atau penarikan profil. Simpan bukti izin aktif hingga satu tahun setelah izin berakhir. Simpan catatan transaksi keuangan perdagangan elektronik selama 10 tahun dan catatan perdagangan elektronik lain yang wajib disimpan selama 5 tahun sejak perolehan, dengan perpanjangan untuk kewajiban hukum atau sengketa aktif. Acuan untuk catatan perdagangan elektronik adalah [PP 80/2019 Pasal 25](https://peraturan.go.id/files/pp80-2019bt.pdf).

## Perubahan dokumen

Naikkan versi di `lib/legal.ts` dan di pemeriksaan versi pada migrasi database berikutnya secara bersamaan. Tampilkan versi baru kepada pengguna sebelum transaksi baru dan minta bukti persetujuan Worker baru untuk perubahan materi listing atau pembagian kontak. Simpan arsip versi lama dan waktu berlakunya.
