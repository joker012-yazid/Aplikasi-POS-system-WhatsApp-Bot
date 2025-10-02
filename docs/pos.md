# Modul POS & Invois

Modul POS menyediakan kaunter sentuh, pengurusan stok, variasi produk, harga borong, serta pengeluaran resit dengan QR pembayaran. Ikuti langkah ini untuk memastikan jualan dan invois berjalan lancar.

## 1. Menyediakan Produk

1. Masuk ke halaman **Admin → Produk**.
2. Tambah produk baharu dengan medan berikut:
   - Nama, SKU, kategori.
   - Variasi (cth: warna, kapasiti) dengan stok masing-masing.
   - Bundle: pilih komponen dan kuantiti.
   - Stok minimum untuk menerima amaran apabila inventori rendah.
3. Sistem menyimpan data dalam `products`, `product_variants`, dan `bundle_items` melalui API `POST /api/pos/products`.
4. Dashboard stok (`/admin/pos/stock`) menunjukkan baki terkini dan status amaran.

## 2. Menjalankan Jualan Kaunter

1. Navigasi ke **Admin → POS**.
2. Gunakan carian pantas atau imbas kod bar (jika tersedia) untuk menambah item ke troli.
3. Tetapkan kuantiti, diskaun baris, atau pilih harga borong jika pelanggan layak.
4. Pilih pelanggan (sedia ada atau cipta pantas).
5. Semak ringkasan:
   - Subtotal, diskaun, cukai (daripada tetapan `settings.store.taxes`).
   - Kaedah pembayaran (tunai, FPX, e-wallet dsb.)
6. Tekan **Hantar** → API `POST /api/pos/sales` akan:
   - Mengurangkan stok secara automatik berdasarkan variasi/bundle.
   - Merekod transaksi dalam `pos_sales` dan `pos_sale_items`.
   - Menjana invois dengan nombor mengikut tetapan penomboran.
   - Menyediakan payload untuk modul MyInvois (bergantung pada mod).

## 3. Resit & QR Invois

- Selepas jualan, resit boleh dicetak melalui butang **Cetak Resit**.
- Sistem turut mengeluarkan label produk jika diperlukan.
- QR invois dijana menggunakan URL `https://.../invoices/:id/qr` yang membawa pelanggan ke paparan invois web.
- Portal admin menyimpan sejarah resit untuk rujukan semula.

## 4. Integrasi Tiket

- Jika jualan berkaitan tiket sedia ada, pilih tiket semasa checkout.
- Status tiket akan dikemas kini (contoh: `READY`) dan invois dipautkan ke tiket untuk akses cepat.

## 5. Offline & PWA

- Halaman POS menyokong PWA; pasang pada tablet/telefon untuk akses pantas.
- Apabila offline:
  - Transaksi disimpan dalam IndexedDB tempatan.
  - UI memaparkan banner amaran.
  - Setelah online semula, queue akan disegerakkan ke API dan stok dikemas kini.

> **Nota Operasi:** Gunakan laporan `Admin → Dashboard` untuk memantau jualan harian/7H/30H serta tiket baharu & siap.
