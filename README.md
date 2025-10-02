# WA-POS-CRM Monorepo

Rangka asas sistem **WA-POS-CRM** berasaskan Docker Compose. Projek ini menyediakan servis API, web, bot WhatsApp, scheduler, worker, serta infrastruktur Postgres, Redis dan Nginx reverse proxy.

## Struktur Direktori

```
services/
  api/           # API Express + TypeScript
  web/           # Next.js + Tailwind + shadcn/ui + i18n + PWA
  wa-bot/        # WhatsApp Bot (Baileys MD)
  scheduler/     # Cron jobs
  worker/        # Queue worker
scripts/         # Utiliti pembangunan
```

## Dokumentasi Lengkap

Panduan operasi terperinci (setup, tiket, POS, MyInvois, kempen, sandaran, FAQ) disediakan di folder [`docs/`](docs/README.md). Mulakan dengan bahagian [Setup](docs/setup.md) untuk menyiapkan persekitaran dan pairing bot WhatsApp.

## Persediaan

1. Salin `.env.example` kepada `.env` dan kemaskini nilai rahsia:
   ```bash
   cp .env.example .env
   ```
2. Pastikan `docker` dan `docker compose` tersedia dalam mesin anda.

## Mod Pembangunan

1. Jalankan semua servis:
   ```bash
   ./scripts/dev-up
   ```
2. Semak log gabungan:
   ```bash
   ./scripts/dev-logs
   ```
3. Hentikan semua servis:
   ```bash
   ./scripts/dev-down
   ```

Perkhidmatan penting:
- Web: http://localhost/ (placeholder Dashboard dengan sokongan BM/EN)
- API: http://localhost/api/
- Bot: http://localhost/bot/

### API Modul

- Modul disediakan: auth, customers, devices, tickets, repairs, stock, pos, campaigns, settings.
- Auth menggunakan JWT dengan peranan `admin`, `tech`, `cashier`. Semua laluan tulis memerlukan token sah serta peranan dibenarkan.
- Akaun pentadbir lalai akan diwujudkan jika tiada (rujuk pembolehubah `DEFAULT_ADMIN_*` dalam `.env`). Gunakan `POST /api/auth/login` untuk mendapatkan token.
- Koleksi Postman/Insomnia auto-dijana di `services/api/collections/wa-pos-crm.postman_collection.json` setiap kali `pnpm --dir services/api export:collection` atau semasa servis API bermula.
- Laluan penting tiket:
  - `POST /api/tickets/intake`
  - `PATCH /api/tickets/:id/estimate`
  - `POST /api/tickets/:id/ready`
  - `PATCH /api/tickets/:id/status`
  - `POST /api/tickets/:id/request-approval`
  - `GET /api/tickets/kanban`
- Modul AI balas pelanggan:
  - `POST /api/ai/reply` (perlukan token). Input `{ thread, question, customer_id? }` dan menggunakan OpenAI Responses API dengan data CRM/POS sebagai konteks.
  - Jika tiada data berkaitan ditemui, API akan membalas templat sopan "Tunggu sebentar, teknisyen kami akan menghubungi anda.".
  - Log prompt (di-redact) dan jawapan disimpan dalam `audit_logs` untuk rujukan.
- Endpoints awam baharu untuk intake pelanggan:
  - `GET /api/public/customer-form` (konfigurasi medan semasa)
  - `POST /api/public/customer-form` (serahan borang pelanggan → cipta tiket baharu)

### Borang Intake Pelanggan

- **Halaman pelanggan**: `http://localhost/forms/customer` — mesra mudah alih & PWA, menyokong muat naik foto, dan memaparkan ID tiket selepas serahan.
- **Builder admin**: `http://localhost/ms/admin/customer-form` (BM) atau `http://localhost/en/admin/customer-form` — aktifkan/tidak aktifkan atau wajibkan setiap medan tanpa deploy semula. Sediakan token JWT admin (rujuk `POST /api/auth/login`).
- Builder memaparkan kod QR ke borang pelanggan untuk dikongsi di kaunter servis.
- Konfigurasi disimpan dalam jadual `settings` (key `customerForm`); tetapan dibaca secara langsung oleh borang pelanggan.
- Serahan borang akan:
  1. Simpan data mentah ke `intake_forms`
  2. Padan / cipta pelanggan & peranti (jenama/model/siri)
  3. Cipta `work_tickets` status `NEW` + acara `CREATED`
 4. Kemaskini konsen WhatsApp (`consents`)

### Kanban Tiket Kerja

- **Halaman admin**: `http://localhost/ms/admin/tickets` atau `http://localhost/en/admin/tickets` menampilkan papan kanban `NEW → IN_PROGRESS → READY` dengan drag-and-drop.
- Sediakan token JWT admin/tech melalui `POST /api/auth/login` dan letakkan di ruangan "Token Admin" untuk benarkan panggilan API.
- Kad tiket memaparkan pelanggan, maklumat peranti, masalah, SLA badge (hampir/lewat ETA), anggaran, lampiran serta pintasan "Chat WA".
- Tindakan pantas:
  - **Set Anggaran & ETA** → `PATCH /api/tickets/:id/estimate`
  - **Minta Kelulusan** → `POST /api/tickets/:id/request-approval` (bot WhatsApp akan mengambil catatan ini)
  - **Nota / Gambar** → `POST /api/repairs/:id/note` (jenis NOTE/PHOTO)
  - **Tanda Siap** → `POST /api/tickets/:id/ready`
- Seretan ke kolum baharu akan memanggil API berkaitan dan segar semula papan secara automatik.
- Rujuk [docs/tickets.md](docs/tickets.md) untuk aliran penuh `NEW → IN_PROGRESS → READY → PICKED_UP`, hook WhatsApp, dan follow-up automatik.

### Login Bot WhatsApp

1. Semak log `wa-bot` untuk kod pairing atau QR (dicetak ke terminal).
2. Gunakan aplikasi WhatsApp → Peranti Terpaut → Pautkan Peranti → Masukkan kod / imbas QR.
3. Sesi akan disimpan dalam volume `wa_bot_session` supaya kekal selepas restart.
4. Konfigurasi pembolehubah `WA_API_EMAIL` dan `WA_API_PASSWORD` untuk akaun servis (peranan `admin`/`tech`) serta `WA_API_BASE_URL` jika API berada pada host lain. Bot akan login ke API, log mesej ke `audit_logs`, memproses intent `status`, `harga`, `janji temu`, `invois`, dan mencipta tiket intake apabila pautan borang dikongsi. Hantar `!takeover` dalam chat untuk hentikan balasan automatik sementara waktu.
5. Jika perlu reset atau ulang pairing, rujuk panduan [docs/setup.md#pairing-bot-whatsapp-baileys](docs/setup.md#pairing-bot-whatsapp-baileys) sebelum memadam volume `wa_bot_session`.

## Mod Produksi

1. Bina imej produksi:
   ```bash
   docker compose -f docker-compose.yml build --no-cache --progress=plain
   ```
2. Jalankan dalam mod latar:
   ```bash
   docker compose up -d
   ```
3. Pantau status:
   ```bash
   docker compose ps
   docker compose logs -f
   ```

## Sandaran & Pemulihan Pangkalan Data

Sandaran Postgres:
```bash
docker compose exec postgres pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > backup.sql
```

Pemulihan:
```bash
docker compose exec -T postgres psql -U "$POSTGRES_USER" "$POSTGRES_DB" < backup.sql
```

Pastikan `backup.sql` berada di host sebelum menjalankan arahan pemulihan.

## Kesihatan Servis

Setiap servis mempunyai healthcheck; `docker compose ps` akan memaparkan status. Pastikan semua servis berstatus `healthy` sebelum pembangunan lanjut.

## Nota Tambahan

- Folder `scripts/` menyediakan helper asas.
- Servis `scheduler` dan `worker` memerlukan Redis tersedia (`redis://redis:6379`).
- Untuk maklumat modul POS, kampen opt-in, dan FAQ penyelenggaraan, rujuk direktori [`docs/`](docs/README.md).
- Tukar `MYINVOIS_MODE` kepada `portal` atau `api` mengikut integrasi sebenar (rujuk [docs/myinvois.md](docs/myinvois.md) untuk langkah eksport dan integrasi API).
