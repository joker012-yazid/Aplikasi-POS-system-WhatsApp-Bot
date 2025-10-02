# Compliance Summary

Projek ini mematuhi keperluan asas PDPA dan garis panduan komunikasi digital dalaman dengan langkah berikut:

- **Persetujuan (OPT-IN)**: Penerima kempen mesti mempunyai rekod consent aktif sebelum mesej dihantar. Sebarang OPT-OUT disebarkan serta-merta ke semua kempen aktif.
- **Audit & Peranan**: Akses API dan paparan pentadbir dikawal mengikut peranan (admin/tech/cashier) dan setiap tindakan kritikal direkodkan di `audit_logs`.
- **Rate Limiting & Keselamatan**: Endpoint sensitif (auth, kempen, POS, tetapan) menggunakan limiter dan log disanitasi untuk mematuhi prinsip data minimisation.
- **Sandaran**: Proses backup harian dan ujian pemulihan automatik memastikan kesinambungan perkhidmatan mengikut amalan DR (disaster recovery).

Sila rujuk `PRIVACY.md` untuk polisi privasi terperinci.
