# Setup Pembangunan & Produksi

Dokumen ini menerangkan keperluan perisian, konfigurasi `.env`, penyediaan pangkalan data contoh, serta cara menjalankan stack menggunakan Docker untuk kedua-dua mod pembangunan dan produksi. Di hujung seksyen turut disertakan langkah log masuk bot WhatsApp (Baileys pairing).

## Keperluan Sistem

- Docker 24+ dan Docker Compose v2
- Node.js 18 LTS + PNPM 8 (digunakan untuk arahan pembangun tertentu)
- Git dan akses internet untuk memuat turun kebergantungan
- Akaun WhatsApp Business atau akaun standard yang dibenarkan untuk pairing dengan Baileys

## Konfigurasi Persekitaran

1. Salin templat `.env` dan kemas kini nilai sensitif:
   ```bash
   cp .env.example .env
   ```
2. Tetapkan pembolehubah utama:
   - `POSTGRES_*` untuk akses pangkalan data.
   - `REDIS_URL` ke `redis://redis:6379` (lalai docker-compose).
   - `JWT_SECRET`, `DEFAULT_ADMIN_EMAIL`, `DEFAULT_ADMIN_PASSWORD` untuk akaun pentadbir permulaan.
   - `OPENAI_API_KEY` jika ingin menguji balasan AI.
   - `MYINVOIS_MODE` (`portal` atau `api`), `MYINVOIS_SUPPLIER_*`, `MYINVOIS_API_*` mengikut integrasi sebenar.
   - `WA_API_EMAIL`, `WA_API_PASSWORD`, `WA_API_BASE_URL` bagi bot WhatsApp.

> **Nota:** Nilai produksi patut disimpan di pengurus rahsia (contoh: 1Password, Vault) dan disuntik semasa deployment.

## Pasang Kebergantungan (pilihan)

Walaupun Docker mengurus kebergantungan, pembangun boleh memasang modul untuk menjalankan skrip tempatan:
```bash
pnpm install
```

## Inisialisasi Pangkalan Data Contoh

Gunakan skrip seed untuk mengisi data demo (produk, pelanggan, tiket, dan kempen).
```bash
pnpm dev:seed
```
Skrip ini akan menyusun semula skema Prisma, memuat 10 produk, 10 pelanggan, dan tiket dalam setiap kolum kanban.

## Menjalankan Mod Pembangunan

1. Hidupkan semua servis menggunakan utiliti skrip:
   ```bash
   ./scripts/dev-up
   ```
2. Untuk melihat log berpusat:
   ```bash
   ./scripts/dev-logs
   ```
3. Hentikan semua servis apabila selesai:
   ```bash
   ./scripts/dev-down
   ```

### Servis dan URL Lalai

| Servis | URL | Penerangan |
| --- | --- | --- |
| Web (Next.js) | http://localhost/ | Papan pemuka admin (BM/EN). |
| API (Express) | http://localhost/api/ | Endpoint REST untuk tiket, POS, kempen, dsb. |
| Bot WhatsApp | http://localhost/bot/ | Menyediakan webhook status & API dalaman. |
| Scheduler | N/A | Menjalankan cron untuk follow-up & backup. |
| Worker | N/A | Memproses kerja barisan (kempen). |

## Menjalankan Mod Produksi

1. Bina imej segar (sesuai selepas mengemas kini kod):
   ```bash
   docker compose -f docker-compose.yml build --no-cache --progress=plain
   ```
2. Jalankan secara latar:
   ```bash
   docker compose up -d
   ```
3. Semak kesihatan servis:
   ```bash
   docker compose ps
   docker compose logs -f
   ```
4. Untuk kemas kini dengan tag baharu:
   - Pergi ke halaman Settings → Update Panel.
   - Pilih tag docker baharu, jalankan "Simulate Update" untuk melihat langkah pre-flight (backup → apply patch → rolling restart).
   - Apabila bersedia, jalankan proses sebenar menggunakan automasi CI/CD (tidak disertakan di repo ini).

## Pairing Bot WhatsApp (Baileys)

1. Pastikan servis `wa-bot` berjalan (`./scripts/dev-up` atau `docker compose up -d`).
2. Semak log untuk kod pairing:
   ```bash
   docker compose logs -f wa-bot
   ```
   atau semasa pembangunan: `./scripts/dev-logs` dan tapis output `wa-bot`.
3. Di telefon, buka **WhatsApp → Linked Devices → Link a Device**.
4. Pilih pilihan "Masukkan kod" atau imbas QR yang dipaparkan dalam log.
5. Setelah berjaya, sesi disimpan dalam volume `wa_bot_session`. Semak juga:
   - `WA_API_EMAIL` dan `WA_API_PASSWORD` mesti sepadan dengan akaun pengguna API berperanan `admin` atau `tech`.
   - `WA_API_BASE_URL` menunjuk ke API (cth: `http://api:3000` dalam Docker, `http://localhost/api` semasa pembangunan).
6. Jika perlu reset, padamkan volume `wa_bot_session` dan ulang pairing.

## Ujian Asas

Untuk mengesahkan persekitaran berfungsi:
```bash
pnpm test
```
Set arahan ini menjalankan ujian integrasi Vitest untuk modul tiket dan kempen menggunakan Prisma mock.

> Jika anda melihat ralat kekurangan binari (contoh `prisma` atau `next`), jalankan `pnpm install` dalam direktori servis berkenaan atau gunakan container Docker rasmi untuk memastikan binari tersedia.
