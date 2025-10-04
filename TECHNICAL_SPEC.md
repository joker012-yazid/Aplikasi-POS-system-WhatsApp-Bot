# WA-POS-CRM — Technical Specification (Docker)

Sistem bersepadu: **WhatsApp Chat with AI (Baileys + OpenAI)**, **WhatsApp Campaign (Compliance-first)**, **POS moden**, **CRM + Tiket Kerja (3 tahap)**, **e-Invois Malaysia (MyInvois)**, dan **Web UI** profesional.

---

## 1) Objective & Scope
- Menyatukan interaksi pelanggan melalui WhatsApp (chat bot + notifikasi) dengan operasi kedai (tiket kerja, POS, inventori, invois/e-invois) dalam satu antarmuka web yang elegan dan mudah.  
- Patuh **WhatsApp Business** (opt-in/opt-out, messaging limits), **PDPA Malaysia**, dan garis panduan **e-Invois LHDN**. :contentReference[oaicite:0]{index=0} :contentReference[oaicite:1]{index=1} :contentReference[oaicite:2]{index=2} :contentReference[oaicite:3]{index=3}

---

## 2) System Architecture (High-Level)
**Docker Compose** dengan servis:
- `web` (Next.js/React + Tailwind + shadcn/ui, PWA, tema Light/Dark)
- `api` (Node.js/TypeScript, Express/NestJS)
- `wa-bot` (Node + **Baileys MD** untuk WhatsApp)
- `postgres` (DB utama), `redis` (queue/cache)
- `worker` (jobs async), `scheduler` (cron: backup, follow-up), `nginx` (reverse proxy)

Compose file gunakan **Compose Specification** (services/volumes/networks + healthcheck). Tambahkan **healthcheck** per servis untuk start-order jelas. :contentReference[oaicite:4]{index=4} :contentReference[oaicite:5]{index=5} :contentReference[oaicite:6]{index=6}

---

## 3) Core Features

### 3.1 WhatsApp Chat with AI
- **Login & sesi**: Baileys MD dengan pairing **QR/pairing code**, persist sesi, `connection.update` listener, auto-reconnect. :contentReference[oaicite:7]{index=7}
- **Router mesej**: Klasifikasi intent (status tiket, harga, janji temu, invois). Jika tiada data → fallback “Tunggu sebentar…”.
- **Grounded AI**: `api/ai/reply` guna **OpenAI Responses API** (Node SDK), suhu rendah, prompt guardrails → jawab berdasar data CRM/DB; fallback jika kosong. :contentReference[oaicite:8]{index=8} :contentReference[oaicite:9]{index=9}
- **Escalation**: `!takeover` untuk staf ambil alih; audit semua interaksi.
- **Kepatuhan**: hanya hubungi contact **opt-in**, sediakan opt-out mudah. Perlu peka **messaging limits** & reputasi. :contentReference[oaicite:10]{index=10} :contentReference[oaicite:11]{index=11} :contentReference[oaicite:12]{index=12}
- **Risiko versi**: pantau **breaking changes** Baileys (7.x+). :contentReference[oaicite:13]{index=13}

### 3.2 WhatsApp Campaign (Compliance-First & Anti-Ban)
- **Recipients management**: hanya **opt-in**, dedup, validasi MSISDN; segmen (VIP, overdue, promo).
- **Throttling & warm-up**: had/minute + jitter + cap harian per segmen; jadual ikut zon waktu.
- **Template**: mesej ringkas/personal, **opt-out** automatik (“Reply STOP”).
- **Metrics**: sent/delivered/read/reply/opt-out; eksport CSV; health score list.
- **Patuh polisi & limits** setiap masa. :contentReference[oaicite:14]{index=14} :contentReference[oaicite:15]{index=15}

### 3.3 POS Moden
- **Jualan**: kaunter (touch-friendly), diskaun, borong; QR untuk pautan invois/pembayaran.
- **Inventori**: SKU/variasi/bundle, min-stock alert, batch/serial, foto item.
- **Cetakan**: resit/label; eksport PDF.
- **Laporan**: jualan harian/7H/30H, top items, margin, performa staf.

### 3.4 Tiket Kerja (3 Tahap) — “NEW → IN_PROGRESS → READY”
- **NEW**: dicipta dari **Borang Pelanggan** (scan QR → submit) atau dari chat WA → bot kirim ACK + ID tiket.
- **IN_PROGRESS**: teknisi tetapkan **anggaran harga** + **ETA**, tambah catatan dan foto progres; bot minta persetujuan.
- **READY**: teknisi tandai siap, lampir foto; bot kirim notifikasi “siap & boleh ambil” + invois/QR bayar; **follow-up 1/20/30 hari** jika belum diambil.  
  (Alur ini selaras dengan SOP intake→diagnosa→harga/ETA→siap→follow-up.) *(Rujuk dok SOP dalaman anda.)*

### 3.5 Borang Pelanggan + QR (Form Builder)
- **Builder mini** di Admin: boleh ON/OFF/Required setiap medan, tanpa deploy.
- **Akses**: QR code ke URL borang (PWA/mobile friendly).
- **Sesudah submit**: simpan `intake_form` → buat/padan `customer` & `device` → cipta `work_ticket: NEW` + event `CREATED` → balas ACK.
- **Persetujuan**: checkbox **opt-in WhatsApp** + T&C (PDPA). :contentReference[oaicite:16]{index=16} :contentReference[oaicite:17]{index=17}

### 3.6 e-Invois Malaysia (MyInvois)
- **MODE `portal`**: eksport data (UBL/JSON sesuai guideline) siap muat naik manual.
- **MODE `api`**: sediakan adapter `einvoice/myinvois.ts`: `submitInvoice()`, `getDocument()`, `searchDocuments()` (auth, mapping, status). Ikut **Guideline v4.x** & **SDK API** rasmi. :contentReference[oaicite:18]{index=18} :contentReference[oaicite:19]{index=19} :contentReference[oaicite:20]{index=20}

### 3.7 Web UI (Profesional, Elegan)
- **Dashboard**: metrik hari ini/7H/30H; Quick Actions (Buka POS, Cipta Tiket, Buat Kempen).
- **Modul**: POS, Servis/Tiket, CRM, Stok, Kempen, Invois/Quotation/e-Invois, **Settings**, **Update Panel**.
- **Aksesibiliti**: tema Light/Dark, i18n (BM/EN), PWA, keyboard-friendly.

---

## 4) User Flows (End-to-End)

### 4.1 Intake & Tiket Kerja
1. **Pelanggan** scan **QR** → isi Borang (nama, telefon, peranti, masalah, T&C, opt-in WA).  
2. **API** validasi → simpan `intake_form` → buat/padan `customer`/`device` → **create `work_ticket: NEW`** + `event: CREATED`.  
3. **Bot WA** kirim ACK + ID tiket.

### 4.2 Diagnosa → Estimate/ETA (IN_PROGRESS)
1. **Teknisi** buka **Kanban** → isi **anggaran harga** + **ETA** → `PATCH /tickets/:id/estimate`.  
2. **Bot** kirim info ke pelanggan → pelanggan **setuju/tolak** (balasan “OK/Ya/Setuju”).  
3. **Event** `ESTIMATE_SET` tersimpan; status kekal **IN_PROGRESS** hingga siap.

### 4.3 Siap & Pengambilan (READY)
1. **Teknisi** upload foto siap → `POST /tickets/:id/ready`.  
2. **Bot** kirim “Laptop siap & boleh ambil” + pautan **invois/QR**; status **READY**.  
3. **Pembayaran** di POS → resit/invois. **Scheduler** pantau follow-up 1/20/30 hari jika belum diambil.

### 4.4 WhatsApp Campaign
1. **Admin** import senarai **opt-in** (dedup, validasi).  
2. **Settings** pilih template, throttle, jadual.  
3. **Worker** hantar bertahap (log sent/delivered/read/reply/opt-out).  
4. **Opt-out** memicu update `consents.opt_out_at` → dikecualikan otomatis. :contentReference[oaicite:21]{index=21}

---

## 5) Database Schema (PostgreSQL + Prisma)

### 5.1 Entities (ringkas)
- **customers**: id (UUID), name, phone (unique), email, address, created_at, updated_at, deleted_at
- **devices**: id, customer_id FK, category, brand, model, serial_no, accessories, condition_in, created_at, updated_at, deleted_at
- **intake_forms**: id, customer_id FK?, payload JSON, created_at
- **work_tickets**: id, customer_id FK, device_id FK, intake_form_id FK, status(`NEW|IN_PROGRESS|READY|CLOSED`), price_estimate (NUMERIC), eta_ready_at (TIMESTAMP), priority (INT), assignee_id (UUID?), created_at, updated_at, deleted_at
- **work_ticket_events**: id, ticket_id FK, type(`CREATED|NOTE|PHOTO|ESTIMATE_SET|CUSTOMER_APPROVED|CUSTOMER_DECLINED|READY|PICKED_UP`), payload JSON (note, urls), actor(`bot|tech|system`), created_at
- **products**: id, sku (unique), name, description, price, cost, stock, min_stock, variants JSON?, created_at, updated_at, deleted_at
- **inventory_moves**: id, product_id FK, qty (INT), reason(`sale|return|adjustment|receive|repair`), ref_id, created_at
- **invoices**: id, customer_id FK, total, tax, status(`draft|issued|paid|void`), einvoice_mode(`portal|api`), einvoice_ref, created_at, updated_at
- **invoice_items**: id, invoice_id FK, product_id FK?, description, qty, unit_price, discount
- **quotes**: id, customer_id FK, total, valid_until, status(`draft|sent|accepted|rejected`), created_at
- **payments**: id, invoice_id FK, amount, method, txn_ref, paid_at
- **wa_threads**: id, customer_id FK, last_msg_at, wa_number, label, created_at
- **campaigns**: id, name, template, throttle_per_min, start_at, end_at, created_at
- **consents**: id, customer_id FK, channel(`whatsapp`), opt_in_source, opt_in_at, opt_out_at
- **audit_logs**: id, entity, entity_id, action, diff JSON, actor_id, created_at

**Indexes**:  
- `customers(phone)` unique, `work_tickets(status, created_at)`, full-text untuk notes/descriptions (Postgres `tsvector`).  
**Migrations**: gunakan **Prisma Migrate**; sediakan seed & rollback scripts. :contentReference[oaicite:22]{index=22} :contentReference[oaicite:23]{index=23}

> **Catatan**: gunakan **UUID v4**, `created_at/updated_at` default `now()`, `deleted_at` untuk soft-delete (filter di query layer).

---

## 6) API Surface (Ringkas)

### 6.1 Auth & Settings
- `POST /auth/login` → JWT (roles: `admin|tech|cashier`)
- `GET/PUT /settings` → profil kedai, tax, penomboran, WA templates, throttle, backup schedule, `OPENAI_API_KEY`, e-Invois config

### 6.2 Tiket
- `POST /tickets/intake` {form_id? | inline fields} → create **NEW**
- `PATCH /tickets/:id/estimate` {price_estimate, eta_ready_at}
- `POST /tickets/:id/event` {type, payload} (NOTE, PHOTO, APPROVED, DECLINED)
- `POST /tickets/:id/ready` {photos[], note}
- `GET /tickets/kanban` (NEW/IN_PROGRESS/READY grouped)

### 6.3 POS/CRM
- CRUD `customers`, `products`, `quotes`, `invoices`, `payments`
- `POST /einvoice/submit/:invoiceId` → mode `portal|api`

### 6.4 WhatsApp Bot
- `POST /wa/send` {to, template|text}
- `POST /wa/webhook` events (inbound msg, delivery, read)
- `GET /wa/pairing-code` (opsional), `GET /wa/status`

---

## 7) Compliance, Privacy & Security

### 7.1 WhatsApp Policy & Messaging Limits
- Wajib **opt-in** sebelum hantar mesej, simpan bukti opt-in & sediakan **opt-out** (“STOP”). Hormati **messaging limits** untuk menjaga reputasi. :contentReference[oaicite:24]{index=24} :contentReference[oaicite:25]{index=25}

### 7.2 PDPA Malaysia
- Paparkan T&C + Privacy Notice, jelaskan tujuan pemprosesan data, hak akses/pembetulan, dan retensi munasabah. Simpan persetujuan (timestamp, sumber). :contentReference[oaicite:26]{index=26} :contentReference[oaicite:27]{index=27}

### 7.3 e-Invois LHDN
- Ikuti **Guidelines** terkini & semak **SDK/API** MyInvois; simpan respon/ID rujukan & status validasi. :contentReference[oaicite:28]{index=28} :contentReference[oaicite:29]{index=29}

### 7.4 Aplikasi & Infrastruktur
- JWT + RBAC; rate-limit endpoints kempen/WA; mask PII pada log.  
- HTTPS (reverse proxy), rotasi API key, `CSP/Helmet`, audit trail menyeluruh.

---

## 8) Reliability, Observability, Operations
- **Healthcheck** per servis (web/api/bot/db) dalam Compose untuk start-order & pemantauan. :contentReference[oaicite:30]{index=30}
- **Logs** terstruktur (JSON) + korelasi request-id.  
- **Metrics**: job sukses/gagal, queue depth, msg delivered/read/block, latency WA, error AI.  
- **Alerts**: ETA terlepas, health bot disconnect, DB space low, failure e-Invois.

---

## 9) Backup, Restore & Update

### 9.1 Backup
- Harian: `pg_dump` snapshot + retention; simpan di volume + NAS.  
- Pertimbangkan strategi **continuous archiving/WAL** untuk RPO kecil. :contentReference[oaicite:31]{index=31} :contentReference[oaicite:32]{index=32}
- Seed export (produk/setting) ke `json/csv` berkala.

### 9.2 Restore
- Prosedur pulih guna `psql` dari dump; uji DR secara berkala. :contentReference[oaicite:33]{index=33}

### 9.3 Update & Rollback
- Panel **Update**: pre-flight backup → pull/build images → rolling restart.  
- Rollback: pilih tag image/git commit sebelumnya.

---

## 10) Deployment Checklist
- [ ] Docker Engine + Compose terpasang, ports 80/443 terbuka.  
- [ ] `.env` terisi (DB/Redis/AI/WA/e-Invois).  
- [ ] `docker compose up -d` green all; healthchecks OK.  
- [ ] Pair **Baileys** (QR/pairing code); verifikasi `connection.update`. :contentReference[oaicite:34]{index=34}  
- [ ] Prisma migrate/seed sukses. :contentReference[oaicite:35]{index=35}  
- [ ] HTTPS reverse proxy aktif.  
- [ ] Privacy Notice/PDPA + opt-in/opt-out mekanisme siap. :contentReference[oaicite:36]{index=36} :contentReference[oaicite:37]{index=37}  
- [ ] e-Invois adapter diuji (MODE `portal` terlebih dahulu). :contentReference[oaicite:38]{index=38}

---

## 11) Risk & Mitigation
- **WA session reset/ban** → ketat opt-in, throttle, pemanasan nombor, monitor delivery ratio; failover notifikasi via SMS/Email. :contentReference[oaicite:39]{index=39} :contentReference[oaicite:40]{index=40}  
- **Breaking changes Baileys** → pin versi, changelog watch, test matrix. :contentReference[oaicite:41]{index=41}  
- **Data loss** → backup berkala + DR drill; gunakan volume bernama. :contentReference[oaicite:42]{index=42}  
- **Ketergantungan AI** → fallback template non-AI apabila API gagal. :contentReference[oaicite:43]{index=43}

---

## 12) References
- Baileys MD (Connecting; QR/Pairing) — docs & repo. :contentReference[oaicite:44]{index=44} :contentReference[oaicite:45]{index=45}  
- WhatsApp Business Policy & Opt-in; Messaging Limits. :contentReference[oaicite:46]{index=46} :contentReference[oaicite:47]{index=47} :contentReference[oaicite:48]{index=48}  
- OpenAI **Responses API** + Node SDK. :contentReference[oaicite:49]{index=49} :contentReference[oaicite:50]{index=50}  
- LHDN e-Invois Guidelines & MyInvois API. :contentReference[oaicite:51]{index=51} :contentReference[oaicite:52]{index=52} :contentReference[oaicite:53]{index=53}  
- PDPA Malaysia (PDP Dept & ringkasan undang-undang). :contentReference[oaicite:54]{index=54} :contentReference[oaicite:55]{index=55}  
- Docker Compose Spec & Services; Healthchecks. :contentReference[oaicite:56]{index=56} :contentReference[oaicite:57]{index=57} :contentReference[oaicite:58]{index=58}  
- PostgreSQL Backup (`pg_dump`, strategi). :contentReference[oaicite:59]{index=59} :contentReference[oaicite:60]{index=60} :contentReference[oaicite:61]{index=61}  
- Prisma Migrate (migrations & workflow). :contentReference[oaicite:62]{index=62} :contentReference[oaicite:63]{index=63}
