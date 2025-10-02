# Integrasi MyInvois

Modul e-invois menyokong dua mod operasi: `portal` untuk eksport manual ke portal MyInvois dan `api` untuk integrasi masa nyata. Konfigurasi dikawal melalui halaman **Settings → e-Invois** serta pembolehubah `.env` (`MYINVOIS_MODE`).

## Konfigurasi Umum

1. Buka **Admin → Settings → e-Invois**.
2. Isikan maklumat pembekal:
   - Nama syarikat, TIN, nombor pendaftaran perniagaan.
   - Alamat, e-mel, telefon.
   - Mata wang lalai (MYR, SGD, dsb.) — sistem akan mengesahkan hanya kod yang disokong MyInvois.
3. Tentukan peraturan penomboran invois dan asas cukai (contoh: SST 6%).
4. Simpan; tetapan disimpan dalam jadual `settings` dengan kunci `myInvois`.

## Mod Portal

- Pilih `portal` pada `MYINVOIS_MODE`.
- Selepas jualan atau tiket siap, modul POS akan menjana pakej berikut:
  - Fail UBL XML mematuhi guideline MyInvois terkini.
  - Fail JSON ringkas untuk semakan pantas.
  - Arkib ZIP menggabungkan kedua-dua fail serta metadata.
- Pada halaman invois, butang **Muat Naik ke Portal** akan memuat turun arkib ZIP siap muat naik.
- Proses manual:
  1. Log masuk ke portal MyInvois.
  2. Pilih pilihan import dan muat naik arkib.
  3. Semak status penerimaan dalam portal.

## Mod API

- Pilih `api` pada `MYINVOIS_MODE` dan sediakan:
  - `API Base URL`, `Client ID`, `Client Secret` (dari MyInvois developer portal).
  - Sijil atau token lain jika diperlukan (rujuk dokumentasi rasmi).
- Adapter menyediakan fungsi stub berikut (boleh dikembangkan apabila akses API disahkan):
  - `submitInvoice(payload)` — Mengembalikan ID mock dan status `QUEUED`.
  - `getDocument(documentId)` — Memulangkan dokumen mock berdasarkan ID yang disimpan.
  - `searchDocuments(query)` — Menyenaraikan hasil contoh.
- Walaupun stub belum memanggil API sebenar, struktur medan utama (TIN, currency, amount) telah dipetakan. Anda boleh menggantikan stub dengan implementasi sebenar tanpa mengubah lapisan POS.
- Semua panggilan menyimpan jejak di `audit_logs` untuk rujukan.

## Ujian

- Gunakan `pnpm test` untuk mengesahkan adapter memulangkan artefak portal dan stub API berfungsi.
- Jalankan jualan demo dan semak di halaman invois bahawa arkib ZIP dihasilkan dan boleh dimuat turun.

> **Amalan Baik:** Simpan arkib portal sekurang-kurangnya 7 tahun. Untuk mod API, jadualkan kerja untuk memuat turun acknowledgement rasmi MyInvois dan simpan dalam storan kekal.
