# Sandaran & Pemulihan

Sistem WA-POS-CRM menyertakan job backup harian serta utiliti manual untuk memastikan data kritikal (Postgres, fail lampiran) selamat. Panduan ini menerangkan amalan yang disyorkan.

## 1. Job Backup Harian

- Scheduler menjalankan `backup-service` setiap malam (lalai 02:00 waktu pelayan).
- Langkah yang diambil:
  1. Jalankan `pg_dump` terhadap pangkalan data utama.
  2. Simpan fail dalam direktori `backups/` (mount volume `postgres_backups`).
  3. Lakukan ujian pemulihan ringkas ke pangkalan data sementara untuk memastikan fail sah.
  4. Log status ke `audit_logs` dan memaparkan dalam Settings → Backup.
- Pastikan volume `postgres_backups` dipetakan ke storan kekal (contoh EBS/S3 sync).

## 2. Backup Manual

Jalankan arahan berikut dari host:
```bash
docker compose exec postgres pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > backup.sql
```
Simpan `backup.sql` di lokasi selamat (contoh: S3 dengan encryption).

## 3. Pemulihan Manual

Untuk memulihkan ke instance baru:
```bash
docker compose exec -T postgres psql -U "$POSTGRES_USER" "$POSTGRES_DB" < backup.sql
```
Selepas pemulihan:
1. Jalankan migrasi Prisma jika ada perubahan skema (`pnpm --dir services/api prisma migrate deploy`).
2. Hidupkan semula servis yang bergantung pada DB (`docker compose restart api worker scheduler`).

## 4. Ujian Pemulihan Berkala

- Sekurang-kurangnya setiap suku tahun, jalankan pemulihan ke environment staging.
- Semak modul utama (tiket, POS, kempen) dan pastikan data konsisten.
- Rekodkan hasil ujian dalam COMPLIANCE log.

## 5. Lampiran & Fail Media

- Lampiran tiket dan resit disimpan dalam direktori yang dipasang (`./data/uploads`).
- Gunakan `rsync` atau S3 sync secara berkala:
  ```bash
  rsync -av data/uploads/ backup-server:/srv/wa-pos/uploads/
  ```
- Pastikan fail lampiran disandarkan seiring dengan pangkalan data untuk mengelakkan mismatch.

> **Nota:** Gunakan mekanisme checksum (contoh `sha256sum`) untuk mengesahkan integriti fail selepas pemindahan.
