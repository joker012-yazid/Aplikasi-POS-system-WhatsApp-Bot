# Privacy Policy

Kami menghormati privasi pelanggan dan hanya menggunakan data peribadi untuk tujuan operasi seperti pengurusan tiket, POS, dan automasi WhatsApp. Akses kepada data dihadkan mengikut peranan (admin/tech/cashier) dan semua log sistem menyorokkan maklumat pengenalan peribadi (PII) seperti nombor telefon, alamat emel, dan token.

## Pengumpulan Data
- Maklumat pelanggan: nama, nombor telefon, peranti, dan sejarah transaksi.
- Rekod kempen: status OPT-IN/OPT-OUT, mesej outbound, dan tindak balas.
- Metadata sistem: konfigurasi kedai, tetapan kempen, dan log audit.

## Penyimpanan & Keselamatan
- Data disimpan dalam pangkalan data Postgres dengan sandaran automatik harian.
- Semua akses API memerlukan token dengan had kadar dan hanya boleh dilakukan melalui sambungan yang disahkan.
- Log disanitasi untuk mengelakkan kebocoran PII.

## Hak Pelanggan
- Pelanggan boleh menghantar arahan `STOP` melalui WhatsApp untuk OPT-OUT serta-merta.
- Permintaan pemadaman data boleh dibuat melalui pentadbir sistem dan akan direkodkan di audit log.
