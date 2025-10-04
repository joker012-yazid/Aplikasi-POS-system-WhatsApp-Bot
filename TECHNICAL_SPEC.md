# WA-POS-CRM — Technical Specification (Docker • Baileys • OpenAI • POS/CRM • e-Invoice)

> Purpose: A single web app that unifies WhatsApp AI chat, compliant campaigns, POS, CRM, Work Tickets (3 stages), Customer Intake Form (QR), and Malaysia e-Invoicing (MyInvois).

---

## 1) Architecture (High Level)

**Stack (containers):**
- `web` — Next.js (React) + Tailwind + shadcn/ui, PWA (light/dark, i18n)
- `api` — Node.js (TypeScript, Express/NestJS), REST/JSON
- `wa-bot` — Node + **Baileys MD** (QR/pairing code, persistent session, `connection.update`) 〔Baileys docs: QR & pairing; breaking changes notice〕. [Source] 
- `postgres` — primary OLTP store (ACID)
- `redis` — queues, rate-limiters, short-lived cache
- `scheduler` — cron-like jobs (follow-ups, backups)
- `worker` — async tasks (campaign send, media processing)
- `nginx` — reverse proxy (TLS, gzip, static)

**Inter-service routing:**
- `/` → web
- `/api/*` → api
- `/bot/*` → wa-bot (optional internal webhook/testing)

**External services (optional):**
- OpenAI **Responses API** (grounded replies, low-temperature factual responses). [Source]
- LHDN **MyInvois** Portal/API adapter (Malaysia e-Invoice). [Source]

---

## 2) Core Features (By Module)

### 2.1 WhatsApp Chat with AI
- Baileys MD login (QR/pairing), persistent session, auto-reconnect; observe `connection.update`. [Source]
- Message router: intents (`status`, `price`, `appointment`, `invoice`) using keywords + rules + (optional) AI classification.
- **Grounded AI** (OpenAI Responses API): answer strictly from CRM/POS data; fallback: *“Please wait, our technician will reply shortly.”* [Source]
- Human takeover: `!takeover` command or UI button.
- Audit logging: message-id, sender, intent, action, timestamps.
- **Compliance**: only message opted-in customers; clear **opt-out** handling (“STOP”). [Source]

### 2.2 WhatsApp Campaign (Compliance-First, Anti-Ban)
- Recipient management: import/update contacts with **explicit opt-in** evidence; deduplicate; number validation. [Source]
- **Messaging limits awareness**: respect WABA messaging limits & upcoming policy changes; gradual warm-up; throttle/jitter; time-zone scheduling. [Sources]
- Templates with personalization; add auto **opt-out** footer.
- A/B test (intro/CTA), per-segment daily caps; health score (delivered/read/blocked).
- Metrics & export: sent/delivered/read/reply/opt-out (CSV).

### 2.3 POS (Modern)
- Products/SKUs, variants, bundles; min-stock alerts; barcode/QR scan.
- Counter sales (touch-friendly), discounts, wholesale tiers.
- Receipts/labels; payment QR link; refunds/returns.
- Reports: daily/weekly sales, margin, top items.
- Role & audit: cashier/tech/admin with logs.

### 2.4 CRM + Work Tickets (3 Stages)
- **Customer Intake Form (QR)**: admin-editable form builder; mobile/PWA; on submit → create/join Customer + Device + **Work Ticket (NEW)**.
- **Ticket stages**:
  1) **NEW** — created after intake submission; bot ACK with ticket ID.
  2) **IN_PROGRESS** — technician sets **price estimate** + **ETA**, adds notes/photos; bot asks customer for approval.
  3) **READY** — technician marks **ready**, uploads completion photos; bot sends “ready for pickup” + invoice/QR.
- Escalations, SLA badges (close to ETA), Kanban board (drag-drop status).
- **Automated follow-ups** if no response/pickup after **1/20/30 days**.

### 2.5 e-Invoice (Malaysia, MyInvois)
- Adapter with two modes:
  - **Portal**: export UBL/JSON per latest guideline for manual upload.
  - **API**: stub functions `submitInvoice`, `getDocument`, `searchDocuments` using MyInvois SDK/API when credentials ready.
- Keep mapping for TIN, currency, tax rules, item lines per guideline version. [Sources]

### 2.6 Web UI (Admin-first, Elegant)
- Clean dashboard (KPIs: Today/7D/30D — sales, new tickets, ready).
- Modules: **POS**, **Service/Tickets**, **CRM**, **Stock**, **WhatsApp Campaigns**, **Invoices/Quotes/e-Invoice**, **Settings**, **Updates**.
- Settings (editable in UI): shop profile, tax, invoice numbering, WA templates (ack/estimate/ready), campaign throttle, backup schedule, API keys (OpenAI), DB DSNs, MyInvois config.
- Update Panel: pre-flight (DB backup) → switch docker image tag → rolling restart.

---

## 3) End-to-End User Flows

### 3.1 Intake → Diagnosis → Ready → Pickup (Ticket 3-Stage)
1. **Scan QR** → Customer opens **Intake Form** → submits personal, device, problem, consent (opt-in).  
2. API saves `intake_form`, creates/links `customer` + `device`, creates `work_ticket(NEW)` + event `CREATED`; bot replies ACK with Ticket ID.  
3. Technician diagnoses, sets **estimate/ETA** → `IN_PROGRESS`; bot sends estimate to customer and awaits approval.  
4. Technician completes repair, uploads photos → `READY`; bot sends completion photos + **invoice link/QR**.  
5. If no response/pickup: **scheduler** sends follow-ups at 1/20/30 days.  
6. On pickup & payment, invoice is posted; ticket `CLOSED`.

### 3.2 WhatsApp Campaign
1. Admin uploads an **opt-in** audience segment.  
2. Worker sends messages via **throttled** queue (jitter, caps) respecting WABA limits & time zones; auto **opt-out** processing.  
3. Dashboard displays campaign metrics; CSV export.

### 3.3 POS Sale
1. Cashier adds items (barcode/QR), applies discounts, posts payment.  
2. System updates inventory, prints receipt/label, and (if needed) issues **e-Invoice** via adapter.

---

## 4) Data Model (Relational Schema, PostgreSQL)

> Conventions: `id` = UUID, `created_at/updated_at` = TIMESTAMPTZ (UTC), `deleted_at` nullable (soft delete), FKs with `ON UPDATE CASCADE ON DELETE RESTRICT`.

### 4.1 CRM & WhatsApp
- **customers**  
  `id, name, phone (unique), email, address, notes, created_at, updated_at, deleted_at`
- **devices**  
  `id, customer_id→customers.id, category, brand, model, serial_no, accessories, condition_in, created_at, updated_at, deleted_at`
- **consents**  
  `id, customer_id, channel ENUM('whatsapp'), opt_in_source, opt_in_at, opt_out_at, created_at`
- **wa_threads**  
  `id, customer_id, last_message_at, last_intent, state_json, created_at, updated_at`
- **campaigns**  
  `id, name, segment_query_json, template_id, status ENUM('DRAFT','SCHEDULED','SENDING','PAUSED','DONE'), created_at, updated_at`
- **campaign_logs**  
  `id, campaign_id, customer_id, phone, status ENUM('QUEUED','SENT','DELIVERED','READ','REPLIED','OPT_OUT','FAILED'), provider_msg_id, error, created_at`

### 4.2 Work Tickets (Service)
- **intake_forms**  
  `id, customer_snapshot_json, device_snapshot_json, problem_description, photos_json, tc_accepted BOOL, wa_opt_in BOOL, raw_json, created_at`
- **work_tickets**  
  `id, customer_id, device_id, intake_form_id, status ENUM('NEW','IN_PROGRESS','READY','CLOSED'), price_estimate NUMERIC(12,2), eta_ready_at TIMESTAMPTZ, priority ENUM('LOW','NORMAL','HIGH'), assignee_id (user), created_at, updated_at, closed_at`
- **work_ticket_events**  
  `id, ticket_id, type ENUM('CREATED','NOTE','PHOTO','ESTIMATE_SET','CUSTOMER_APPROVED','CUSTOMER_DECLINED','READY','PICKED_UP'), payload_json, actor ENUM('bot','tech','system','customer'), created_at`

### 4.3 POS / Inventory / Billing
- **products**  
  `id, sku UNIQUE, name, description, price NUMERIC(12,2), cost NUMERIC(12,2), currency, stock_qty, min_stock_qty, barcode, images_json, created_at, updated_at, deleted_at`
- **inventory_moves**  
  `id, product_id, qty INT, reason ENUM('SALE','RETURN','ADJUST','INIT','REPAIR_PART'), ref_table, ref_id, created_at`
- **invoices**  
  `id, customer_id, ticket_id NULLABLE, number UNIQUE, status ENUM('DRAFT','ISSUED','PAID','VOID'), subtotal, tax, total, currency, due_at, posted_at, created_at, updated_at`
- **invoice_items**  
  `id, invoice_id, product_id NULLABLE, description, qty INT, unit_price NUMERIC(12,2), line_total NUMERIC(12,2)`
- **quotes**  
  `id, customer_id, ticket_id NULLABLE, number UNIQUE, status ENUM('DRAFT','SENT','ACCEPTED','REJECTED','EXPIRED'), totals…, created_at, updated_at`
- **payments**  
  `id, invoice_id, method ENUM('CASH','CARD','FPX','DuitNow','Bank'), amount NUMERIC(12,2), paid_at, txn_ref, created_at`

### 4.4 Admin / Security / Audit
- **users**  
  `id, name, email UNIQUE, phone, role ENUM('admin','tech','cashier'), password_hash, last_login_at, created_at, updated_at`
- **settings**  
  `id, key UNIQUE, value_json, updated_at`
- **audit_logs**  
  `id, entity, entity_id, action, diff_json, actor_id NULLABLE, actor_type ENUM('user','system','bot'), created_at`

**Indexes (examples):**
- `customers(phone)`, `work_tickets(status, created_at)`, `campaign_logs(campaign_id, status)`, full-text GIN on `work_ticket_events.payload_json->>'note'`.

---

## 5) API (Must-Have Endpoints)

### 5.1 Authentication & Settings
- `POST /auth/login` → JWT; RBAC by role
- `GET/PUT /settings` (admin only)

### 5.2 CRM & Tickets
- `POST /intake` (from web form) → create/merge customer+device → create ticket `NEW`
- `GET /tickets/kanban` → grouped by status
- `PATCH /tickets/:id/estimate` → `{ price_estimate, eta_ready_at }` → event `ESTIMATE_SET`
- `POST /tickets/:id/ready` → `{ photos[], note }` → event `READY`
- `POST /tickets/:id/approve|decline` (customer action)
- `POST /tickets/:id/pickup` → event `PICKED_UP` + close ticket

### 5.3 POS
- `CRUD /products`
- `POST /invoices` (+ items) → `POST /payments`
- `GET /reports/sales?period=today|7d|30d`

### 5.4 Campaigns
- `POST /campaigns` (create), `POST /campaigns/:id/schedule|pause|resume|stop`
- Upload/import recipients (server filters only **opt-in** contacts)
- Metrics endpoints (`/campaigns/:id/metrics`)

### 5.5 AI Replies
- `POST /ai/reply` → { thread, question, customer_id? } → grounded answer or fallback (low-temperature). [Source]

---

## 6) Compliance & Policy (Critical)

- **WhatsApp Opt-In**: must clearly state business name and that customer agrees to receive messages; store timestamp and source of consent. [Official Opt-In Policy — Source]
- **WhatsApp Business Terms**: ensure lawful processing and required permissions; respect data rights. [Source]
- **Messaging Limits**: adhere to WABA messaging limits and note **upcoming changes (from Oct 7, 2025)** which may alter limit calculation; build throttling/jitter + warm-up. [Sources]
- **Content & Templates**: keep messages concise, useful, non-spammy; always provide **opt-out** (“Reply STOP”). 
- **Malaysia e-Invoice**: follow **Guidelines/Specific Guideline** versions and MyInvois APIs/Portal behaviour (e.g., last-31-days search window). Keep adapter up-to-date with versioned mappings. [Sources]

---

## 7) Non-Functional Requirements

### 7.1 Reliability & Observability
- Health checks for all containers; readiness probes.
- Centralized logging (`api`, `wa-bot`, `worker`) with correlation IDs & minimal PII.
- Metrics: queue depth, message send rates, ticket SLA breaches, campaign success ratios.

### 7.2 Security
- JWT with RBAC; strong password policy; account lockout.
- Secrets in env/secret manager; never store OpenAI keys or Baileys creds in git.
- TLS termination at `nginx`; HSTS; secure cookies; CSRF for web forms.
- PII minimization in logs; consent + opt-out honored within 60s.

### 7.3 Data & Backup
- PostgreSQL: daily `pg_dump` + retention policy; tested restore procedure.
- Versioned migrations (Prisma or equivalent) with zero-downtime plan.
- Volumes: named volumes for `postgres` and persistent Baileys auth state.

### 7.4 Performance
- Redis-based rate-limiters (token bucket) for campaigns & WA bot sends.
- Caching: hot paths (customer by phone, ticket by id) with short TTL.

### 7.5 Upgrades & Rollback
- Update Panel: backup → image tag switch → rolling restart.
- Rollback to previous tag on failure; DB migrations backward-compatible when possible.

---

## 8) Operational Runbook (Essentials)

1. **Bootstrap (fresh server)**  
   - Install Docker Engine + Compose; clone repo; `cp .env.example .env`; fill secrets (OpenAI, DB); `docker compose up -d`.  
   - Prisma migrations: `prisma migrate deploy` (or `db push` for dev).

2. **Pair WhatsApp**  
   - `docker compose logs -f wa-bot`; scan **QR** (or pairing code) with WhatsApp **Linked devices**; persist session folder. [Baileys Connecting — Source]

3. **Smoke Tests**  
   - `GET /api/health`, dashboard loads, ticket creation from Intake Form works, bot ACK is received.

4. **Backups**  
   - Daily cron (host or scheduler container) to run `pg_dump` → gzip → rotate.

5. **Monitoring**  
   - Set alerts on: queue backlog, failed sends, bot disconnects, error rate > 1%, ticket ETA breaches.

---

## 9) Acceptance Criteria (System-Level)

- Full **Ticket 3-stage** flow works E2E (QR intake → NEW → IN_PROGRESS (estimate/ETA) → READY (photos) → invoice → pickup & close).
- Bot produces **grounded answers** when data exists; uses **fallback** when not. [OpenAI Responses API — Source]
- Campaigns enforce **opt-in**, implement throttling/jitter, and reflect **messaging limits**. [Sources]
- e-Invoice adapter exports Portal-compatible files and exposes API stubs aligned with the latest guideline. [Sources]
- Backups restore cleanly to a new database; Update Panel can roll forward/back with minimal downtime.

---

## 10) References

- **Baileys (WhiskeySockets)** — npm page (MD client, QR/Pairing) & GitHub (breaking changes). [turn0search0], [turn0search10], [turn0search5], [turn0search20], [turn0search15]
- **OpenAI** — Responses API reference & migration guidance; official JS/TS SDK. [turn0search1], [turn0search6], [turn0search16], [turn0search21], [turn0search11]
- **WhatsApp Policies** — Opt-In/Business Policy/Terms; Messaging Limits & upcoming changes. [turn0search7], [turn0search12], [turn0search22], [turn0search3], [turn0search8]
- **MyInvois (IRBM/LHDN)** — e-Invoice guidelines & APIs; MyInvois Portal. [turn0search14], [turn0search19], [turn0search4], [turn0search9], [turn0search23]
