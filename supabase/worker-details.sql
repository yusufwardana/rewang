alter table public.workers
  add column if not exists deskripsi text,
  add column if not exists pengalaman text,
  add column if not exists keahlian text[] not null default '{}',
  add column if not exists portofolio text,
  add column if not exists reviews jsonb not null default '[]'::jsonb;
update public.workers as w
set
  deskripsi = d.deskripsi,
  pengalaman = d.pengalaman,
  keahlian = d.keahlian,
  portofolio = d.portofolio,
  reviews = d.reviews
from (
  values
    ('Bu Siti Rahayu', 'Laweyan', 'IRT / Asisten Rumah Tangga', 'Terbiasa menjaga rumah tetap bersih dan rapi, termasuk dapur, kamar, dan area keluarga. Bisa mengikuti jadwal serta kebiasaan rumah.', '8 tahun', array['Bersih-bersih rumah', 'Cuci setrika', 'Masak harian']::text[], 'Perawatan rumah harian di Laweyan dan sekitarnya.', '[{"name":"Bu Rina","area":"Laweyan","text":"Kerjanya teliti, rumah jadi rapi dan nyaman." ,"stars":5}]'::jsonb),
    ('Pak Budi Santoso', 'Banjarsari', 'Tukang Bangunan', 'Berpengalaman mengerjakan renovasi rumah dari persiapan sampai finishing. Terbiasa bekerja rapi dan membicarakan kebutuhan material lebih dulu.', '10 tahun', array['Pasang bata', 'Plester', 'Pasang keramik']::text[], 'Renovasi kamar mandi dan dapur rumah warga Banjarsari.', '[{"name":"Pak Arif","area":"Banjarsari","text":"Pengerjaannya rapi dan selesai sesuai kesepakatan." ,"stars":5}]'::jsonb),
    ('Bu Marni Wijaya', 'Jebres', 'Tenaga Rewang Hajatan', 'Ketua regu rewang hajatan. Siap masak besar, racik-racik, dan beres-beres hajatan. Pernah handle hajatan 400 porsi di Jebres & Pasar Kliwon. Tim 6 orang siap dipanggil.', '14 tahun • 203 hajatan di Solo Raya', array['Masak hajatan 200–500 porsi', 'Racik & hidang', 'Cuci piring massal', 'Koordinasi regu']::text[], 'Pernah handle hajatan 400 porsi di Jebres & Pasar Kliwon. Tim 6 orang siap dipanggil.', '[{"name":"Bu Sari","area":"Jebres","text":"Hajatan kami lancar, masakan habis dan banyak yang muji.","stars":5},{"name":"Pak Doni","area":"Pasar Kliwon","text":"Timnya sigap dan semua hidangan tertata rapi sampai acara selesai.","stars":5}]'::jsonb),
    ('Pak Joko Prasetyo', 'Pasar Kliwon', 'Sopir Harian', 'Sopir harian yang terbiasa mengantar keluarga untuk urusan dalam kota dan perjalanan luar kota. Mengutamakan keselamatan dan komunikasi jadwal.', '11 tahun', array['Sopir matic', 'Sopir manual', 'Luar kota']::text[], 'Antar jemput keluarga dan perjalanan luar kota dari Pasar Kliwon.', '[{"name":"Bu Nita","area":"Pasar Kliwon","text":"Mengemudi tenang, tepat waktu, dan komunikasinya enak." ,"stars":5}]'::jsonb),
    ('Pak Slamet Riyadi', 'Serengan', 'Tukang Kebun', 'Membantu merawat taman rumah, memangkas tanaman, dan menjaga halaman tetap bersih. Bisa mengikuti jadwal perawatan rutin.', '7 tahun', array['Perawatan taman', 'Pangkas tanaman', 'Bersihkan halaman']::text[], 'Perawatan halaman dan taman rumah di Serengan.', '[{"name":"Pak Hadi","area":"Serengan","text":"Halaman jadi bersih dan tanaman tertata." ,"stars":5}]'::jsonb),
    ('Pak Ahmad Fauzi', 'Kartasura', 'Kuli Harian', 'Tenaga harian untuk membantu pekerjaan bangunan dan angkut material. Siap bekerja bersama tukang atau regu proyek kecil.', '9 tahun', array['Angkut material', 'Bantu pasang bata', 'Persiapan renovasi']::text[], 'Bantuan renovasi rumah dan persiapan material di Kartasura.', '[{"name":"Pak Darto","area":"Kartasura","text":"Sigap membantu dan mengikuti arahan kerja." ,"stars":5}]'::jsonb),
    ('Bu Dewi Lestari', 'Banjarsari', 'Baby Sitter', 'Mendampingi anak dalam rutinitas harian, menyiapkan kebutuhan sederhana, dan menjaga komunikasi dengan keluarga.', '6 tahun', array['Jaga anak', 'Rutinitas harian', 'Pendampingan anak']::text[], 'Pendampingan anak usia dini untuk keluarga di Banjarsari.', '[{"name":"Bu Maya","area":"Banjarsari","text":"Sabar mendampingi anak dan selalu memberi kabar." ,"stars":5}]'::jsonb),
    ('Bu Yanti Susanti', 'Sukoharjo', 'IRT / Asisten Rumah Tangga', 'Membantu pekerjaan rumah harian mulai dari bersih-bersih, mencuci, menyetrika, hingga menyiapkan masakan sederhana.', '8 tahun', array['Bersih-bersih rumah', 'Cuci setrika', 'Masak harian']::text[], 'Bantuan pekerjaan rumah rutin di Sukoharjo.', '[{"name":"Bu Wulan","area":"Sukoharjo","text":"Pekerjaannya rapi dan bisa diandalkan." ,"stars":5}]'::jsonb),
    ('Pak Supriyo', 'Klaten', 'Tukang Bangunan', 'Mengerjakan pekerjaan bangunan dan perbaikan rumah dengan tahapan kerja yang jelas. Berpengalaman bekerja pada renovasi skala rumah tangga.', '12 tahun', array['Pasang bata', 'Plester', 'Perbaikan rumah']::text[], 'Perbaikan dinding dan renovasi rumah di Klaten.', '[{"name":"Pak Joko","area":"Klaten","text":"Hasilnya rapi dan area kerja dibersihkan kembali." ,"stars":5}]'::jsonb),
    ('Bu Ratna Anggraini', 'Wonogiri', 'Tenaga Rewang Hajatan', 'Membantu persiapan dapur, menyajikan hidangan, dan merapikan perlengkapan setelah acara. Bisa bergabung dengan regu kecil.', '9 tahun', array['Persiapan hidangan', 'Racik & hidang', 'Beres-beres acara']::text[], 'Bantuan acara keluarga dan hajatan di Wonogiri.', '[{"name":"Bu Tatik","area":"Wonogiri","text":"Bantuannya cekatan dan acara berjalan lancar." ,"stars":5}]'::jsonb),
    ('Pak Bambang Hermawan', 'Laweyan', 'Sopir Harian', 'Melayani antar jemput harian serta perjalanan keluarga. Terbiasa merencanakan rute dan mengabari bila ada perubahan jadwal.', '15 tahun', array['Sopir matic', 'Sopir manual', 'Antar jemput']::text[], 'Antar jemput keluarga dan perjalanan harian di Solo Raya.', '[{"name":"Bu Lina","area":"Laweyan","text":"Tepat waktu dan nyaman selama perjalanan." ,"stars":5}]'::jsonb),
    ('Bu Endang Sulastri', 'Jebres', 'Baby Sitter', 'Mendampingi anak dengan sabar dan membantu rutinitas harian keluarga. Mengutamakan kebersihan, keamanan, dan komunikasi.', '5 tahun', array['Jaga anak', 'Rutinitas harian', 'Menyiapkan kebutuhan anak']::text[], 'Pendampingan anak untuk keluarga di Jebres.', '[{"name":"Bu Fitri","area":"Jebres","text":"Anak cepat akrab dan jadwalnya selalu dikabari." ,"stars":5}]'::jsonb)
) as d(nama, kecamatan, kategori, deskripsi, pengalaman, keahlian, portofolio, reviews)
where w.nama = d.nama
  and w.kecamatan = d.kecamatan
  and w.kategori = d.kategori;

