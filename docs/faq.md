# Soalan Lazim (FAQ)

## Bagaimana jika sesi Baileys tamat?
- Sesi disimpan dalam volume `wa_bot_session`. Jika WhatsApp memaksa log keluar, padamkan folder tersebut dan ulang proses pairing (rujuk [setup](setup.md#pairing-bot-whatsapp-baileys)).
- Pastikan pelayan mempunyai jam tepat; perbezaan masa yang ketara boleh menyebabkan token tamat.

## Bolehkah saya putarkan kredensial API dengan selamat?
- Tetapkan semula `WA_API_PASSWORD` atau token JWT dalam Settings → API Keys.
- Restart servis `wa-bot` supaya token baharu digunakan.
- Untuk OpenAI dan MyInvois API, kemas kini di halaman Settings dan tekan **Save**; perubahan disimpan serta-merta dan digunakan pada panggilan seterusnya.

## Apakah had kadar sistem?
- API umum: 60 permintaan/minit per token (boleh diubah di `services/api/src/middleware/rate-limit.ts`).
- Kempen: `throttleRate` (contoh 20 mesej/minit) dengan jitter ±10%.
- WhatsApp mempunyai had tidak rasmi; elakkan lebih 1 mesej/sesi per saat bagi mengurangkan risiko ban.

## Kesilapan biasa dan cara menyelesai
| Kod / Pesanan | Sebab | Tindakan |
| --- | --- | --- |
| `401 Unauthorized` | Token JWT hilang atau tamat. | Log masuk semula melalui `POST /api/auth/login` dan kemas kini token di UI. |
| `422 Invalid phone` semasa import kempen | Format nombor tidak sah. | Pastikan termasuk kod negara (cth `+60123456789`). |
| `Webhook signature mismatch` di bot | Nilai `WA_API_BASE_URL` salah atau jam pelayan tidak segerak. | Semak URL dan masa sistem. |
| `PrismaClientInitializationError` | DB tidak tersedia atau env `DATABASE_URL` salah. | Pastikan Postgres berjalan dan jalankan migrasi. |
| QR pairing tidak muncul | Bot belum memulakan sesi baharu. | Padam volume `wa_bot_session` dan restart container. |

## Bagaimana memastikan kempen tidak menghantar selepas opt-out?
- Semua balasan STOP direkod dalam `consents`. Anda boleh menguji dengan menghantar mesej STOP dari nombor ujian; dalam <60 saat, nombor tersebut tidak akan menerima mesej baharu dan tersenarai dalam laporan opt-out.

## Di mana melihat changelog dan kemas kini?
- Halaman Settings → Update Panel memaparkan versi terkini, changelog, dan membenarkan simulasi pertukaran tag docker.

## Bagaimana mengesan status backup?
- Lihat modul Settings → Backup untuk log terkini.
- Fail backup disimpan dalam volume `postgres_backups`; gunakan `docker compose exec postgres ls /backups` untuk semak.

## Siapa yang patut mempunyai akses admin?
- Minimumkan kepada staf kepercayaan tinggi. Gunakan role `tech` untuk juruteknik dan `cashier` untuk kaunter POS. Kempen memerlukan role `marketing`.
