# Kempen WhatsApp Patuh Opt-In

Modul kempen membolehkan penghantaran mesej berkumpulan kepada pelanggan yang telah memberi kebenaran (opt-in) dengan kawalan kadar dan jadual mengikut zon masa. Ikuti garis panduan ini untuk kekal patuh.

## 1. Import Penerima

1. Pergi ke **Admin → Kempen → Import**.
2. Muat naik fail CSV dengan sekurang-kurangnya medan `name`, `phone`, dan segmen pilihan.
3. Sistem akan:
   - Menormalisasi nombor telefon (kod negara, pembuangan simbol).
   - Menapis hanya kontak dengan rekod `consents.status = OPT_IN`.
   - Mengelakkan duplikasi berdasarkan nombor telefon + segmen.
   - Melaporkan baris yang ditolak bersama sebab.

## 2. Tetapan Throttle & Jadual

- Dalam halaman Settings → Campaigns, tetapkan:
  - **Daily Cap per Segment** – maksimum mesej sehari.
  - **Throttle Rate** – jumlah mesej per minit.
  - **Jitter Window** – variasi rawak untuk mengelakkan corak robotik.
  - **Time Zone Schedule** – slot masa yang dibenarkan mengikut segmen.
- Pencetus penghantaran (`campaign-dispatcher`) akan mematuhi tetapan ini dan menyusun queue mesej.

## 3. Templat Mesej & Pemboleh Ubah

- Cipta templat menggunakan placeholder `{{name}}`, `{{product}}`, `{{invoiceUrl}}` dsb.
- Semasa penghantaran, sistem menggantikan placeholder dengan data pelanggan atau kempen.
- Sertakan arahan opt-out pada akhir mesej: `Reply STOP untuk berhenti`.

## 4. Penguatkuasaan Opt-Out

- Sebarang balasan `STOP` akan:
  - Dicatat sebagai event `OPTOUT` dalam `campaign_events`.
  - Menyimpan masa penindasan dalam `consents`.
  - Menghentikan semua mesej susulan kepada nombor tersebut dalam tempoh <60 saat.
- Anda boleh semak status consent pelanggan melalui `GET /api/consents/:phone`.

## 5. Metrik & Eksport

- Paparan kempen menunjukkan meter `sent`, `delivered`, `read`, `reply`, `optout`.
- Klik **Eksport CSV** untuk memuat turun log terperinci bagi tujuan audit.
- Gunakan API `GET /api/campaigns/:id/events?format=csv` untuk automasi.

## 6. Keselamatan & Akses

- Laluan kempen dilindungi oleh role-based access (`admin` & `marketing`).
- API sensitif (import, hantar, eksport) mempunyai rate limit lalai 60 permintaan/ minit per token.
- Log akan di-mask untuk PII (contoh nombor telefon → `+6012****789`).

> **Tip Operasi:** Uji kempen menggunakan segmen kecil (contoh 5 kontak) sebelum skala besar untuk memastikan templat dan pautan tepat.
