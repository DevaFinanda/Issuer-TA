# OID4VP Verifier — Rencana Implementasi Credo-TS

Panduan menambahkan **OID4VP (OpenID for Verifiable Presentations)** ke program Verifier
menggunakan Credo-TS, agar bisa menerima dan memverifikasi credential dari Holder wallet.

---

## Apakah Verifier Perlu Credo-TS?

**Ya, sangat direkomendasikan.**

Credo-TS punya modul `@credo-ts/openid4vc` yang menangani sisi **Verifier/Relying Party**
dari protokol OID4VP — pasangan dari OID4VCI di issuer.

Tanpa Credo-TS, kamu harus implementasi verifikasi SD-JWT, DID resolution, dan OID4VP
secara manual — kompleks dan rawan error.

---

## Alur Kerja Verifier (OID4VP)

```
Verifier (web app)
     │
     ▼
[1] Buat Presentation Request (VP Request)
     │  → generate nonce, response_uri, presentation_definition
     ▼
[2] Encode ke QR: openid4vp://?request_uri=https://verifier.com/request/abc
     │
     ▼
[3] Holder scan QR dengan wallet Flutter
     │  → wallet fetch request_uri
     │  → wallet pilih SD-JWT VC yang cocok
     │  → wallet buat VP Token (SD-JWT dengan Key Binding)
     ▼
[4] Holder POST VP Token ke response_uri verifier
     │
     ▼
[5] Verifier validasi VP Token:
     │  → verify signature SD-JWT (issuer's did:key)
     │  → verify key binding (holder's proof)
     │  → verify nonce, audience, expiry
     │  → resolve disclosed claims
     ▼
[6] Tampilkan hasil verifikasi ke frontend
```

---

## A. Core Dependencies yang Perlu Ditambah

```bash
pnpm add @credo-ts/core @credo-ts/node @credo-ts/askar @credo-ts/openid4vc
pnpm add @openwallet-foundation/askar-nodejs
```

---

## B. File yang Perlu Dibuat / Diubah

| No | File | Status | Fungsi |
|----|------|--------|--------|
| 1 | `src/credo-verifier.ts` | 🆕 Baru | Init Credo Agent sisi verifier |
| 2 | `src/controllers/verify.controller.ts` | 🆕 Baru | Handle semua endpoint verifikasi |
| 3 | `src/services/verification.service.ts` | 🆕 Baru | Simpan sesi verifikasi ke DB |
| 4 | `src/server.ts` | ✏️ Edit | Mount Credo verifier + tambah routes |
| 5 | `prisma/schema.prisma` | ✏️ Edit | Tambah model `VerificationSession` |
| 6 | `.env` | ✏️ Edit | Tambah `VERIFIER_BASE_URL`, `VERIFIER_CLIENT_ID` |

---

## C. Endpoint yang Harus Ada di Verifier

| Method | Path | Fungsi |
|--------|------|--------|
| `POST` | `/api/verify/start` | Buat VP Request baru → return QR URL |
| `GET` | `/api/verify/request/:sessionId` | Holder fetch request object (JWT signed) |
| `POST` | `/api/verify/response/:sessionId` | Holder submit VP Token |
| `GET` | `/api/verify/result/:sessionId` | Frontend polling hasil verifikasi |
| `GET` | `/api/verify/sessions` | List semua sesi verifikasi (admin) |

---

## D. `src/credo-verifier.ts` — Isi yang Diinisialisasi

```
- Agent dengan:
    → AskarModule (secure key store)
    → OpenId4VcModule (verifier mode)

- Verifier Record:
    → verifierId (stabil, tidak berubah tiap restart)
    → clientId (URL verifier)

- Presentation Definition:
    → input_descriptor untuk BPJSHealthCredential
    → fields yang diminta: holderName, noBPJS, nik, dll
    → format: vc+sd-jwt
    → limit_disclosure: required (holder harus pakai SD-JWT)

- Trusted Issuer DID:
    → did:key dari issuer
    → ambil dari: GET http://202.155.132.71:3001/.well-known/did.json
```

---

## E. Presentation Definition (Konfigurasi "Minta Claim Apa")

```json
{
  "id": "bpjs-credential-request",
  "input_descriptors": [
    {
      "id": "bpjs-health-credential",
      "format": {
        "vc+sd-jwt": {
          "sd-jwt_alg_values": ["EdDSA"]
        }
      },
      "constraints": {
        "limit_disclosure": "required",
        "fields": [
          {
            "path": ["$.vct"],
            "filter": { "const": "BPJSHealthCredential" }
          },
          { "path": ["$.holderName"] },
          { "path": ["$.noBPJS"] },
          { "path": ["$.nik"] },
          { "path": ["$.tanggalLahir"] }
        ]
      }
    }
  ]
}
```

> Sesuaikan `fields` dengan klaim yang ingin diminta. Tidak semua claim harus diminta
> (holder bisa selective disclose sebagian saja).

---

## F. Database — Model Baru di `schema.prisma`

```prisma
enum VerificationStatus {
  PENDING
  SUCCESS
  FAILED
  EXPIRED
}

model VerificationSession {
  id              String              @id @default(cuid())
  status          VerificationStatus  @default(PENDING)
  requestedAt     DateTime            @default(now())
  completedAt     DateTime?
  holderDID       String?
  disclosedClaims Json?               // data dari holder setelah verified
  rawVpToken      String?             // VP Token asli (untuk audit)
  error           String?
  expiresAt       DateTime            // session expired setelah X menit

  @@map("verification_sessions")
}
```

Setelah edit schema, jalankan:

```bash
npx prisma migrate dev --name add_verification_session
```

---

## G. Alur Teknis per Endpoint

### `POST /api/verify/start`
```
1. credo.verifier.createAuthorizationRequest({
     requestSigner: { ... },
     presentationExchange: { presentationDefinition }
   })
2. Simpan session ke DB (status: PENDING, expiresAt: now + 10 menit)
3. Return: {
     qrUrl: "openid4vp://?request_uri=https://...",
     sessionId: "abc123"
   }
```

### `GET /api/verify/request/:sessionId`
```
→ Holder wallet fetch ini setelah scan QR
→ Credo handle otomatis (mount ke Express)
→ Return: signed JWT Authorization Request
```

### `POST /api/verify/response/:sessionId`
```
1. Terima VP Token dari holder wallet
2. credo.verifier.verifyAuthorizationResponse(vpToken)
   → validasi: signature issuer (did:key), key binding holder
   → validasi: nonce match, audience, expiry
   → extract disclosed claims
3. Update DB: status=SUCCESS, disclosedClaims={holderName, noBPJS, ...}
4. Return: { success: true }
```

### `GET /api/verify/result/:sessionId`
```
→ Frontend polling endpoint ini setiap 2 detik
→ Return: {
     status: "PENDING" | "SUCCESS" | "FAILED",
     claims: { holderName, noBPJS, nik, tanggalLahir } | null
   }
```

---

## H. `.env` — Variabel yang Perlu Ditambah

```dotenv
# Verifier Configuration
VERIFIER_BASE_URL=http://202.155.132.71:3002
VERIFIER_CLIENT_ID=http://202.155.132.71:3002

# Trusted Issuer DID (ambil dari GET http://202.155.132.71:3001/.well-known/did.json)
TRUSTED_ISSUER_DID=did:key:z6Mk...

# Session timeout (menit)
VERIFICATION_SESSION_TIMEOUT_MINUTES=10
```

---

## I. Frontend Verifier — Halaman yang Perlu Ditambah

| Halaman | Path | Fungsi |
|---------|------|--------|
| Mulai Verifikasi | `/verify` | Tombol "Mulai Verifikasi" → generate QR |
| Tampil QR | `/verify/scan` | QR code untuk di-scan holder + polling status |
| Hasil | `/verify/result/:id` | Tampilkan data disclosed dari holder |
| Riwayat | `/verify/history` | List semua sesi verifikasi (admin) |

### Flow UI:
```
[Tombol "Verifikasi Credential"]
         │
         ▼
POST /api/verify/start
         │
         ▼
Tampilkan QR (openid4vp://...)
+ Polling GET /api/verify/result/:sessionId setiap 2 detik
         │
         ▼
Status PENDING → loading spinner
Status SUCCESS → tampilkan tabel claims holder
Status FAILED  → tampilkan error
```

---

## J. Tambahan di Flutter Wallet (Sisi Holder untuk OID4VP)

File referensi: `OID4VCI-FLUTTER-WALLET.md`

Yang perlu ditambah di wallet Flutter:

| No | Yang Ditambah | Keterangan |
|----|---------------|------------|
| 1 | Handle deep link `openid4vp://` | Di `AndroidManifest.xml` + `Info.plist` |
| 2 | `Oid4VpService` | Fetch authorization request dari verifier |
| 3 | VC Selector | Pilih VC dari storage yang cocok dengan presentation_definition |
| 4 | VP Token Builder | Buat VP Token dengan key binding + selective disclosure |
| 5 | Konfirmasi UI | Halaman "Share data ini ke verifier: holderName, noBPJS, nik?" |
| 6 | POST response | Kirim VP Token ke `response_uri` verifier |

---

## K. Prioritas Pengerjaan

```
[1] prisma/schema.prisma       → tambah VerificationSession model
[2] src/credo-verifier.ts      → init Credo Agent verifier
[3] src/services/verification.service.ts  → CRUD session DB
[4] src/controllers/verify.controller.ts  → 5 endpoint
[5] src/server.ts              → mount routes + init verifier agent
[6] Frontend: /verify + QR + polling
[7] Flutter: OID4VP handler + VP Token builder
```

---

## L. Referensi

| Sumber | Link |
|--------|------|
| OID4VP Spec | https://openid.net/specs/openid-4-verifiable-presentations-1_0.html |
| Credo-TS OpenID4VC | https://github.com/openwallet-foundation/credo-ts/tree/main/packages/openid4vc |
| Credo Demo (Verifier) | https://github.com/openwallet-foundation/credo-ts/tree/main/demo |
| Presentation Exchange | https://identity.foundation/presentation-exchange/ |

---

## Checklist Implementasi

- [ ] Install dependencies `@credo-ts/openid4vc` di verifier
- [ ] Tambah `VerificationSession` di `schema.prisma` + migrate
- [ ] Buat `src/credo-verifier.ts` dengan init agent + verifier record
- [ ] Buat `src/services/verification.service.ts`
- [ ] Buat `src/controllers/verify.controller.ts` (5 endpoint)
- [ ] Update `src/server.ts` — mount verifier agent + routes
- [ ] Tambah env vars: `VERIFIER_BASE_URL`, `TRUSTED_ISSUER_DID`
- [ ] Frontend: halaman `/verify` dengan QR display + polling
- [ ] Flutter: handle `openid4vp://` + `Oid4VpService`
- [ ] Test end-to-end: issuer → wallet → verifier
