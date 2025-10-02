# Aliran Tiket 3 Tahap

Sistem tiket menyokong aliran kerja `NEW → IN_PROGRESS → READY → PICKED_UP` dengan automasi WhatsApp, SLA ringkas, dan log audit penuh. Panduan ini menerangkan langkah dari intake hingga penyerahan.

## 1. Ciptaan Tiket (NEW)

- Tiket boleh dicipta melalui:
  - **Borang intake pelanggan** (`/forms/customer`). Pelanggan mengisi maklumat peranti, isu, serta lampiran.
  - **POS / admin** melalui `POST /api/tickets/intake` dengan token pentadbir/teknisyen.
- Setelah dicipta, status lalai `NEW` dengan acara `CREATED` dalam `work_ticket_events` dan rekod audit baharu.
- Hook automatik akan:
  - Menghantar mesej WhatsApp ACK dengan ID tiket.
  - Menyimpan mesej tersebut sebagai event `ACK_SENT` dalam `work_ticket_events` dan `audit_logs`.

## 2. Penilaian & Anggaran (IN_PROGRESS)

- Juruteknik menggerakkan kad ke kolum `IN_PROGRESS` dalam UI kanban (`/admin/tickets`). Drag-and-drop memanggil `PATCH /api/tickets/:id/status`.
- Gunakan butang **Set Anggaran & ETA** untuk menghantar `PATCH /api/tickets/:id/estimate`.
  - Sistem menyimpan nilai anggaran (`quote_total`) dan tarikh siap jangkaan.
  - Hook WhatsApp menghantar mesej permintaan kelulusan yang menyertakan harga serta ETA.
- Nota tambahan / gambar boleh dimuat naik melalui `POST /api/tickets/:id/events` dengan `type=NOTE` atau `PHOTO`.
- SLA ringkas: jika hampir ETA, kad memaparkan lencana amaran.

## 3. Menandakan Siap (READY)

- Apabila kerja siap, tekan **Tanda Siap** yang memanggil `POST /api/tickets/:id/ready`.
- Sistem akan:
  - Menjana invois POS, lengkap dengan QR pembayaran dan lampiran gambar siap (jika disertakan).
  - Menghantar mesej WhatsApp kepada pelanggan dengan gambar siap, pautan invois, dan arahan bayaran.
  - Mencatat event `READY_SENT` dan log audit.

## 4. Pengambilan (PICKED_UP)

- Setelah pelanggan mengambil peranti, gunakan endpoint `POST /api/tickets/:id/pickup` atau butang pada POS untuk menandakan `PICKED_UP`.
- Hook WhatsApp menghantar ucapan terima kasih dan pautan ulasan.
- Event `PICKED_UP` direkod dan audit disimpan.

## 5. Follow-up Automatik

Scheduler memantau tiket tanpa respons:
- 1 hari → mesej susulan pertama.
- 20 hari → peringatan kedua.
- 30 hari → notis akhir.

Setiap follow-up menyimpan event `FOLLOW_UP` dalam `work_ticket_events` dan log audit, memastikan jejak lengkap untuk audit dalaman.

## Panduan UI Kanban

| Elemen | Fungsi |
| --- | --- |
| Drag & Drop | Ubah status (disahkan melalui API dan disimpan). |
| Butang "Chat WA" | Membuka WhatsApp Web dengan nombor pelanggan. |
| SLA Badge | Bertukar kuning/merah apabila menghampiri/terlepas ETA. |
| Quick Actions | Set anggaran/ETA, minta kelulusan, tambah nota/gambar, tanda siap. |

> **Tip:** Token admin/tech perlu dimasukkan dalam UI untuk mengaktifkan semua panggilan API. Dapatkan token melalui `POST /api/auth/login`.
