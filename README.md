# IDentia Issuer

**IDentia Issuer** adalah komponen penerbit (*Credential Issuer*) dalam ekosistem identitas terdesentralisasi. Issuer bertugas membuat **Credential Offer**, menerbitkan **Verifiable Credential (VC)** dalam format **JWT**, dan menandatanganinya secara kriptografis menggunakan **Ed25519** agar dapat diverifikasi oleh pihak lain (Verifier) melalui identitas terdesentralisasi **DID:JWK**.

Proyek ini terdiri dari dua bagian utama:

- **Backend** — layanan API (TypeScript/Node.js) yang mengelola alur OID4VCI dan penandatanganan VC.
- **Frontend** — antarmuka web (dashboard) untuk operator dalam mengelola dan menerbitkan kredensial.

---

## Fitur Utama

- **Penerbitan kredensial (OID4VCI)** — membuat *Credential Offer* dan menerbitkan **JWT Verifiable Credential** ke dompet pengguna.
- **Metadata Issuer** — menyediakan endpoint `/.well-known/openid-credential-issuer`.
- **Penandatanganan kredensial** — menandatangani VC menggunakan **Ed25519 (EdDSA)**.
- **Identitas terdesentralisasi** — penerbitan berbasis **DID:JWK**.
- **Dashboard operator** — antarmuka web untuk mengelola dan memantau penerbitan kredensial.
- **Autentikasi operator** — login untuk mengakses dashboard Issuer.
- **Manajemen proses dengan PM2** — konfigurasi deployment produksi (`pm2_info.json`).

---

## Standar & Spesifikasi yang Didukung

| Standar | Keterangan |
|---|---|
| **OID4VCI** | OpenID for Verifiable Credential Issuance |
| **W3C Verifiable Credentials 1.0** | Model data kredensial yang dapat diverifikasi |
| **DID:JWK** | Metode Decentralized Identifier berbasis JSON Web Key |
| **Ed25519 (EdDSA)** | Algoritma tanda tangan digital untuk menandatangani VC |
| **JWT (JWS)** | Format kontainer VC yang ditandatangani |

---

## Arsitektur & Teknologi

- **Bahasa:** TypeScript, dengan JavaScript & CSS pendukung
- **Runtime:** Node.js
- **Process manager:** PM2
- **Struktur:**
  - `backend/` — API dan logika penerbitan OID4VCI
  - `frontend1/` — antarmuka web dashboard Issuer

### Alur Penerbitan 

```
  Issuer (backend)  ──(OID4VCI: Credential Offer)──▶  Dompet IDentia
        │
  1. Buat Credential Offer
  2. Susun payload VC (klaim)
  3. Tandatangani VC dengan Ed25519 (DID:JWK)
  4. Terbitkan JWT VC ke dompet
```

---

## Prasyarat

- [Node.js](https://nodejs.org) 18.x atau lebih baru
- npm (atau pnpm/yarn)
- [PM2](https://pm2.keymetrics.io) untuk deployment produksi (opsional saat pengembangan)

---

## Instalasi & Menjalankan

1. **Klon repositori**

   ```bash
   git clone https://github.com/DevaFinanda/Issuer-TA.git
   cd Issuer-TA
   ```

2. **Pasang dependensi**

   ```bash
   npm install
   ```

3. **Jalankan untuk pengembangan**

   ```bash
   # Backend
   cd backend
   npm run dev

   # Frontend (terminal terpisah)
   cd frontend1
   npm run dev
   ```

4. **Jalankan di produksi dengan PM2**

   ```bash
   pm2 start pm2_info.json
   pm2 save
   pm2 status
   ```

---

## Konfigurasi

Sesuaikan variabel lingkungan sesuai kebutuhan. Detail lengkap tersedia pada berkas **`ENVIRONMENT_SPECIFICATION.md`**, dan diagram arsitektur pada **`DIAGRAM_INFORMATION.md`** (jika tersedia di repositori).

Contoh konfigurasi endpoint Issuer:

```env
ISSUER_BASE_URL=https://issuer.identia.my.id
CREDENTIAL_ISSUER_METADATA_PATH=/.well-known/openid-credential-issuer
PORT=3000
```

> **Catatan keamanan:** gunakan HTTPS pada lingkungan produksi dan simpan kredensial serta kunci privat penandatangan melalui variabel lingkungan atau penyimpanan rahasia, bukan langsung di dalam kode.

---

## Kredensial Login (Dashboard)

Gunakan kredensial berikut untuk masuk ke dashboard Issuer:

| Field | Nilai |
|---|---|
| **Username** | `admin` |
| **Password** | `admin123` |

>  **Penting:** kredensial di atas adalah akun default untuk pengembangan/demo. **Segera ganti password** dan jangan gunakan kredensial ini di lingkungan produksi.

---

## Struktur Proyek

```
Issuer-TA/
├── backend/                     # API & logika penerbitan OID4VCI (TypeScript)
├── frontend1/                   # Dashboard web Issuer
├── node_modules/                # Dependensi
├── DIAGRAM_INFORMATION.md       # Dokumentasi diagram arsitektur
├── ENVIRONMENT_SPECIFICATION.md # Spesifikasi variabel lingkungan
├── package.json                 # Definisi skrip & dependensi
├── package-lock.json
├── pm2_info.json                # Konfigurasi proses PM2
└── README.md
```

---

## Deployment

Domain produksi: **https://issuer.identia.<sub domain>**

---
