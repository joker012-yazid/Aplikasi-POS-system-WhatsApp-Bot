# WA-POS-CRM — Product & Technical Specification

> Single web app that unifies WhatsApp AI chat, compliant campaigns, POS, CRM, Work Tickets (3 stages), Customer Intake Form (QR), and Malaysia e-Invoice (MyInvois). Target stack: **Docker Compose** (web, api, wa-bot, postgres, redis, worker, scheduler, nginx).

---

## 1) Goals & Scope

- **Primary goals**
  - Seamless **WhatsApp chat** with grounded AI answers from internal data, and human takeover when needed.
  - **Work Tickets** lifecycle: `NEW` → `IN_PROGRESS` → `READY` → `CLOSED`, created automatically from a **QR intake form**.
  - **POS & CRM** for retail/repair: products, inventory, invoices/quotes, payments, and simple analytics.
  - **Compliant WhatsApp campaigns** with opt-in, opt-out, rate limits, and metrics.
  - **Malaysia e-Invoice (MyInvois)** adapter with *Portal export* and *API stubs*.
- **Non-goals (v1)**
  - No multi-tenant across separate companies.
  - No complex accounting (only basic sales & payments).

---

## 2) Architecture (High Level)

**Containers**
- `web` — Next.js (React) + Tailwind + shadcn/ui, PWA (light/dark, i18n).
- `api` — Node.js (TypeScript, Express/NestJS), REST/JSON.
- `wa-bot` — Node + Baileys MD (QR/pairing, persistent session, `connection.update`).
- `postgres` — primary OLTP store (ACID, UUID).
- `redis` — queues, rate limiting, short-lived cache.
- `worker` — async jobs (campaign sends, media processing).
- `scheduler` — cron (follow-ups, backups, maintenance).
- `nginx` — reverse proxy, TLS, gzip.

**Routing**
- `/` → web
- `/api/*` → api
- `/bot/*` (optional internal webhook/testing) → wa-bot

**External integrations**
- OpenAI **Responses API** (grounded answers).
- LHDN **MyInvois**: Portal export + API stubs (future enable).

---

## 3) Core Features

### 3.1 WhatsApp Chat with AI
- Baileys MD login (QR/pairing), persistent session, auto-reconnect.
- Message router: intents (`status`, `price`, `appointment`, `invoice`) via rules + (optional) AI classification.
- **Grounded AI** via Responses API: answers strictly from CRM/POS; fallback: *“Please wait, our technician will reply shortly.”*
- Human takeover: `!takeover` command or UI button; audit log each action.
- Compliance: only message **opt-in** contacts; **opt-out** honored instantly.

### 3.2 WhatsApp Campaign (Compliance-First, Anti-Ban)
- Recipient management: import/update contacts with explicit **opt-in evidence**; deduplicate; number validation.
- Sending discipline: WABA **messaging limits** awareness, warm-up, throttling with jitter, per-segment caps, timezone scheduling.
- Templates with personalization ({{name}}, {{product}}) and **opt-out footer**.
- A/B test (intro/CTA), campaign health score (delivered/read/blocked).
- Metrics + CSV export: sent/delivered/read/reply/opt-out.

### 3.3 POS (Modern)
- Products/SKUs, variants, bundles; min-stock alerts; barcode/QR.
- Counter sales (touch-friendly), discounts, wholesale tiers.
- Receipts/labels; payment QR link; refunds/returns.
- Reports: daily/weekly sales, margin, top items.
- Roles & audit: cashier/tech/admin with logs.

### 3.4 CRM + Work Tickets (3 Stages)
- **Customer Intake Form (QR)**: admin-editable builder; mobile/PWA; on submit → create/join Customer + Device + **Ticket (NEW)**.
- **Stages & automation**
  1) **NEW** — created from intake; bot ACK with Ticket ID.
  2) **IN_PROGRESS** — technician sets **price estimate** + **ETA**, adds notes/photos; bot requests customer approval.
  3) **READY** — technician marks ready; uploads completion photos; bot sends “ready for pickup” + invoice/QR.
  - **CLOSED** — after pickup & payment; scheduler sends follow-ups at 1/20/30 days if no response/pickup.

### 3.5 e-Invoice (Malaysia, MyInvois)
- Adapter modes:
  - **Portal**: export UBL/JSON per latest guideline for manual upload.
  - **API**: stub `submitInvoice`, `getDocument`, `searchDocuments` (enable when credentials ready).
- Versioned mapping for TIN, currency, tax rules, item lines.

### 3.6 Web UI (Admin-First)
- Clean dashboard: KPIs (Today/7D/30D) — sales, new tickets, ready.
- Modules: **POS**, **Service/Tickets**, **CRM**, **Stock**, **WA Campaigns**, **Invoices/Quotes/e-Invoice**, **Settings**, **Updates**.
- Settings: shop profile, tax, invoice numbering, WA templates (ack/estimate/ready), campaign throttle, backup schedule, API keys (OpenAI), DB DSNs, MyInvois config.
- Update Panel: pre-flight (DB backup) → image tag switch → rolling restart.

---

## 4) User Roles & Permissions

- **Admin** — full access, Settings/Updates, campaign approval, e-Invoice config.
- **Technician (tech)** — tickets, repairs, estimates/ETA, photos, mark ready.
- **Cashier** — POS, invoices, payments, receipts/labels.
- **Viewer** (optional) — read-only dashboards/reports.

RBAC enforced at API; sensitive routes rate-limited.

---

## 5) End-to-End Flows (Key)

### 5.1 Ticket 3-Stage
1) Customer scans QR → opens **Intake Form** → submits personal/device/problem + consent (opt-in).  
2) API saves `intake_form`, creates/links `customer` + `device`, creates `work_ticket(NEW)` + event `CREATED`; bot ACK with Ticket ID.  
3) Tech diagnoses; sets **estimate/ETA** → `IN_PROGRESS`; bot sends estimate for approval.  
4) Tech completes repair; uploads photos → `READY`; bot sends completion photos + **invoice link/QR**.  
5) No response/pickup → scheduler follow-ups at 1/20/30 days.  
6) On pickup & payment → `CLOSED`.

### 5.2 WhatsApp Campaign
1) Admin uploads **opt-in** audience.  
2) Worker sends via throttled queue (jitter, caps, timezone), observing WABA limits; auto **opt-out** processing.  
3) Dashboard shows metrics; export CSV.

### 5.3 POS Sale
1) Cashier scans items (barcode/QR), applies discounts; posts payment.  
2) Inventory updates, receipt prints, **e-Invoice** issued (Portal export / API when enabled).

---

## 6) API Surface (Summary)

**Auth & Settings**
- `POST /auth/login` → JWT; roles: admin/tech/cashier.
- `GET/PUT /settings` (admin only).

**CRM & Tickets**
- `POST /intake` → create/merge customer+device → create ticket `NEW`.
- `GET /tickets/kanban` → grouped by `NEW/IN_PROGRESS/READY`.
- `PATCH /tickets/:id/estimate` → `{ price_estimate, eta_ready_at }` (event `ESTIMATE_SET`).
- `POST /tickets/:id/ready` → `{ photos[], note }` (event `READY`).
- `POST /tickets/:id/approve|decline` (customer action).
- `POST /tickets/:id/pickup` → event `PICKED_UP` + close.

**POS**
- `CRUD /products`
- `POST /invoices` (+ items) → `POST /payments`
- `GET /reports/sales?period=today|7d|30d`

**Campaigns**
- `POST /campaigns` (create) → `POST /campaigns/:id/schedule|pause|resume|stop`
- `POST /campaigns/:id/recipients/import` (opt-in only)
- `GET /campaigns/:id/metrics`

**AI Replies**
- `POST /ai/reply` → `{ thread, question, customer_id? }` → grounded answer or fallback.

---

## 7) Data Model (PostgreSQL)

> Conventions: `id` UUID; `created_at/updated_at` TIMESTAMPTZ (UTC); soft delete via `deleted_at` (nullable); FKs with `ON UPDATE CASCADE ON DELETE RESTRICT`.

### 7.1 CRM & WhatsApp
- **customers**  
  `id, name, phone UNIQUE, email, address, notes, created_at, updated_at, deleted_at`
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

### 7.2 Work Tickets
- **intake_forms**  
  `id, customer_snapshot_json, device_snapshot_json, problem_description, photos_json, tc_accepted BOOL, wa_opt_in BOOL, raw_json, created_at`
- **work_tickets**  
  `id, customer_id, device_id, intake_form_id, status ENUM('NEW','IN_PROGRESS','READY','CLOSED'), price_estimate NUMERIC(12,2), eta_ready_at TIMESTAMPTZ, priority ENUM('LOW','NORMAL','HIGH'), assignee_id (user), created_at, updated_at, closed_at`
- **work_ticket_events**  
  `id, ticket_id, type ENUM('CREATED','NOTE','PHOTO','ESTIMATE_SET','CUSTOMER_APPROVED','CUSTOMER_DECLINED','READY','PICKED_UP'), payload_json, actor ENUM('bot','tech','system','customer'), created_at`

### 7.3 POS / Inventory / Billing
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

### 7.4 Admin / Security / Audit
- **users**  
  `id, name, email UNIQUE, phone, role ENUM('admin','tech','cashier'), password_hash, last_login_at, created_at, updated_at`
- **settings**  
  `id, key UNIQUE, value_json, updated_at`
- **audit_logs**  
  `id, entity, entity_id, action, diff_json, actor_id NULLABLE, actor_type ENUM('user','system','bot'), created_at`

**Indexes (suggested)**
- `customers(phone)`, `customers(email)`
- `work_tickets(status, created_at)`
- `campaign_logs(campaign_id, status)`
- GIN full-text on `work_ticket_events.payload_json->>'note'`

---

## 8) Non-Functional Requirements

**Reliability & Observability**
- Health/readiness checks for all containers; correlation IDs in logs.
- Metrics: queue depth, WA send rates, bot disconnects, error rate, ticket ETA breaches.

**Security**
- JWT + RBAC; password policy; account lockout; CSRF for web forms.
- Secrets via env/secret manager; never commit OpenAI keys or Baileys auth state.
- TLS at `nginx`; HSTS; secure cookies; minimal PII in logs.

**Data & Backup**
- Daily `pg_dump` with retention; tested restore.
- Versioned migrations (Prisma/Knex) with zero-downtime plan.
- Named volumes for postgres and Baileys auth state.

**Performance**
- Redis token-bucket rate limiters (campaigns & WA bot).
- Cache hot paths (customer by phone, ticket by id) with short TTL.

**Upgrades & Rollback**
- Update Panel: backup → image tag switch → rolling restart.
- Rollback to previous tag; DB migrations backward-compatible when possible.

---

## 9) Operations (Runbook)

1. **Bootstrap**
   - Install Docker Engine + Compose; clone repo; `cp .env.example .env`; fill secrets (OpenAI, DB); `docker compose up -d`.
   - Apply DB migrations (`prisma migrate deploy` or `db push` in dev).

2. **Pair WhatsApp**
   - `docker compose logs -f wa-bot`; scan **QR** (or request pairing code) via WhatsApp **Linked devices**; ensure session persisted.

3. **Smoke Tests**
   - `GET /api/health`, dashboard loads, Intake Form → Ticket `NEW`, bot ACK received.

4. **Backups**
   - Nightly cron (host or `scheduler`) to run `pg_dump | gzip` into a dated file; rotate/retain.

5. **Monitoring**
   - Alerts on queue backlog, failed sends, bot disconnects, error rate > 1%, ticket ETA breaches.

---

## 10) Acceptance (System-Level)

- Full **Ticket** flow works E2E (QR intake → `NEW` → `IN_PROGRESS` (estimate/ETA) → `READY` (photos) → invoice → pickup/`CLOSED`).
- Bot produces **grounded answers** when data exists; uses **fallback** when not.
- Campaigns enforce **opt-in**, implement throttling/jitter, respect messaging limits; **opt-out** processed within 60s.
- e-Invoice adapter exports Portal-compatible files; API stubs align with current guideline.
- Backups restore cleanly; Update Panel can roll forward/back with minimal downtime.

---
