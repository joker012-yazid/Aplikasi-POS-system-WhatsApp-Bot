````markdown
# WA-POS-CRM (Docker)

Sistem bersepadu untuk **WhatsApp Chat with AI (Baileys MD + OpenAI)**, **WhatsApp Campaign (Compliance-first)**, **POS moden**, **CRM & Tiket Kerja (3 tahap)**, serta **Web UI** yang profesional & senang diguna.

---

## 0) Ringkasan Ciri
- **WhatsApp Bot (Baileys MD)**: pairing QR/pairing code, auto-reconnect, router mesej, escalation ke manusia.
- **Tiket Kerja (3 Tahap)**: `NEW` → `IN_PROGRESS` → `READY`, anggaran + ETA, gambar progres, auto-notifikasi WhatsApp, follow-up 1/20/30 hari.
- **Borang Pelanggan + QR**: pelanggan isi borang (mobile/PWA), data terus ke DB, cipta tiket automatik.
- **POS & CRM**: produk, inventori, invois/quotation, pelanggan & servis, laporan ringkas.
- **e-Invois Malaysia (adapter MyInvois)**: mod `portal` (eksport fail) dan stub `api` (sedia diaktifkan).
- **Web UI**: Next.js + Tailwind + shadcn/ui, tema Light/Dark, Settings lengkap, Update Panel.

---

## 1) Keperluan
- **Git**
- **Docker Engine v24+** dan **Docker Compose v2**
- Linux x86_64 (Ubuntu 22.04/24.04 disyorkan)
- Buka port: `80`/`443` (web)

> Untuk OS lain (Windows/macOS/Docker Desktop), ikut panduan rasmi Docker.

---

## 2) Pasang Docker & Compose (Ubuntu/Debian)
Jalankan sebagai `root` atau user dengan `sudo`.

```bash
# 2.1 Pasang Docker Engine (Ubuntu)
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
  sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io

# 2.2 Pasang Docker Compose (plugin v2)
sudo apt-get install -y docker-compose-plugin
docker compose version
````

> **Opsyen:** Guna Docker tanpa `sudo`
>
> ```
> sudo groupadd docker 2>/dev/null || true
> sudo usermod -aG docker $USER
> # log keluar & masuk semula
> ```
>
> **Alternatif keselamatan:** Docker **Rootless mode** (rujuk docs).

---

## 3) Klon Repo dari GitHub

Gantikan `YOUR_REPO_URL` dengan URL repo anda (HTTPS/SSH).

```bash
cd /opt
sudo git clone YOUR_REPO_URL wa-pos-crm
sudo chown -R $USER:$USER wa-pos-crm
cd wa-pos-crm
```

---

## 4) Sediakan Fail `.env`

Salin templat dan isi nilai penting.

```bash
cp .env.example .env
nano .env
```

**Contoh `.env` (ringkas):**

```dotenv
# DB
POSTGRES_USER=wa_admin
POSTGRES_PASSWORD=change_me
POSTGRES_DB=wa_app
DATABASE_URL=postgresql://wa_admin:change_me@postgres:5432/wa_app

# Redis
REDIS_URL=redis://redis:6379/0

# App
NODE_ENV=production
JWT_SECRET=please_change_me
APP_BASE_URL=https://your.domain

# WhatsApp / AI
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxx
WA_DEVICE_LABEL="WA-POS-CRM (Server-1)"

# e-Invois
MYINVOIS_MODE=portal   # portal | api
```

> **Nota Compose & `.env`:** Nilai boleh datang dari CLI/env/`env_file`. Jika guna banyak fail Compose (`-f`), fail belakang override yang depan.

---

## 5) Jalankan Stack (Dev/Prod)

```bash
# 5.1 Mulakan semua servis
docker compose up -d

# 5.2 (Jika guna Prisma) jana klien & migrate
docker compose exec api pnpm prisma migrate deploy || true
docker compose exec api pnpm prisma db push || true

# 5.3 Semak status & log
docker compose ps
docker compose logs -f api
```

**Guna banyak fail Compose (opsyen prod):**

```bash
docker compose -f compose.yml -f compose.prod.yml up -d
```

---

## 6) Pair WhatsApp (Baileys MD)

**A. QR Code**

```bash
docker compose logs -f wa-bot
# Imbas QR di WhatsApp > Linked devices
```

**B. Pairing Code**

* Sediakan endpoint/skrip pairing code (ikut implementasi `wa-bot` anda).
* Masukkan nombor telefon dengan kod negara (angka sahaja).

> Perhatikan event `connection.update` & simpan sesi di volume.

---

## 7) Semak Health

```bash
# Web UI
curl -I http://localhost/

# API
curl -s http://localhost/api/health

# DB
docker compose exec postgres pg_isready -U $POSTGRES_USER

# Bot
docker compose logs --tail=50 wa-bot
```

---

## 8) Aliran Kerja (destil)

1. **Scan QR → Isi Borang** (pelanggan)
2. **Tiket `NEW`** dicipta + bot hantar ack
3. **Diagnosa + set Harga/ETA** → **`IN_PROGRESS`**
4. **Siap + gambar** → **`READY`** + bot hantar invois/QR bayaran
5. **Follow-up** automatik jika tiada respon (1/20/30 hari)

---

## 9) Backup & Restore (PostgreSQL)

**Backup (dump) ke folder `backups/`:**

```bash
mkdir -p backups
docker compose exec -T postgres pg_dump -U $POSTGRES_USER $POSTGRES_DB \
  | gzip > backups/wa_app_$(date +%F_%H%M).sql.gz
```

**Pulih semula:**

```bash
gunzip -c backups/wa_app_YYYY-MM-DD_HHMM.sql.gz | \
  docker compose exec -T postgres psql -U $POSTGRES_USER -d $POSTGRES_DB
```

> Cadang jadualkan cron/`scheduler` untuk auto-backup harian (sebelum update).

---

## 10) Kemas Kini & Rollback

**Kemas kini (image):**

```bash
docker compose pull
docker compose up -d
```

**Kemas kini (bina dari repo):**

```bash
git pull origin main
docker compose build --no-cache
docker compose up -d
```

**Rollback cepat:**

```bash
git checkout <previous_tag_or_commit>
docker compose up -d
```

---

## 11) Selepas Pasang (penting)

* **Cipta admin** (contoh skrip anda):

  ```bash
  docker compose exec api pnpm ts-node scripts/create-admin.ts
  ```
* **Isi Settings di Web UI**: maklumat kedai/cukai/penomboran, templat mesej WA (ack/estimate/ready), throttle kempen, `OPENAI_API_KEY`, konfigurasi e-Invois.
* **Uji Tiket Kerja 3 Tahap** (Kanban drag-drop & aksi pantas) dan WhatsApp hooks (ACK → minta kelulusan → siap + invois).

---

## 12) Nyahpasang (optional)

```bash
docker compose down
# Buang volume bernama jika perlu (hati-hati: buang data!)
docker volume ls | awk '/wa-pos-crm/ {print $2}' | xargs -r docker volume rm
```

---

## 13) Nota & Amalan Baik

* Gunakan **volume bernama** untuk `postgres` & `redis`.
* **JANGAN commit `.env`** ke GitHub.
* Aktifkan **HTTPS** (Nginx/Caddy + cert) sebelum dedah ke internet.
* Guna banyak fail Compose (`compose.yml` + `compose.prod.yml`) untuk override prod.

---

## 14) Rujukan

* Docker Engine (Ubuntu)
* Docker Compose (Linux plugin)
* Post-install: guna Docker tanpa `sudo`
* Rootless mode (daemon tanpa root)
* `.env` & precedence (Compose)
* Multi-compose files & override
* GitHub: clone repository
* Baileys (Connecting; QR & Pairing Code)

```

---

### Sumber rujukan yang digunakan
- Pemasangan Docker Engine untuk Ubuntu (rasmi). :contentReference[oaicite:0]{index=0}  
- Pemasangan **Docker Compose plugin** untuk Linux (rasmi). :contentReference[oaicite:1]{index=1}  
- **Post-install**: tambah user ke kumpulan `docker` (jalan tanpa `sudo`). :contentReference[oaicite:2]{index=2}  
- **Rootless mode** Docker (opsyen keselamatan). :contentReference[oaicite:3]{index=3}  
- **Compose env precedence** & tetapan env. :contentReference[oaicite:4]{index=4}  
- **Multiple Compose files** & cara **merge/override**. :contentReference[oaicite:5]{index=5}  
- **GitHub Docs**: cara **clone repository**. :contentReference[oaicite:6]{index=6}  
- **Baileys (WhiskeySockets)**: **Connecting (QR/pairing code)**. :contentReference[oaicite:7]{index=7}
