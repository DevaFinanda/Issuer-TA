# 📋 DOKUMENTASI PROGRAM ISSUER - BPJS OID4VCI

## A. Deskripsi Umum

- **Nama**: BPJS Archive Issuer (OID4VCI Compliant)
- **Versi**: 2.0.0
- **Standar**: OpenID4VCI (Authorization Code Flow)
- **Tech Stack**:
  - Backend: Node.js/Express (TypeScript)
  - Frontend: Next.js
  - Database: PostgreSQL (Prisma ORM)
  - Crypto: Credo-TS (DID/key management)

---

## A.1 Spesifikasi Lingkungan Pengembangan & Deployment

### Tabel Spesifikasi Lingkungan

| Komponen | Teknologi | Versi | Fungsi Utama |
|----------|-----------|-------|--------------|
| **Backend Runtime** | Node.js | 18+ (LTS) | Runtime environment untuk menjalankan aplikasi backend |
| **Backend Framework** | Express.js | 4.18.2 | Web framework untuk REST API dan request handling |
| **Backend Language** | TypeScript | 5.3.3 | Type-safe development dengan static type checking |
| **ORM Database** | Prisma | 5.22.0 | Database abstraction layer untuk PostgreSQL queries |
| **Database** | PostgreSQL | 12+ | Primary database untuk user, credentials, tokens |
| **Frontend Framework** | Next.js | 16.1.7 | React-based framework dengan SSR dan static generation |
| **Frontend UI Library** | React | 19.2.0 | Component-based UI rendering |
| **Frontend Styling** | Tailwind CSS | 4.1.9 | Utility-first CSS framework untuk styling |
| **Form Management** | React Hook Form | 7.60.0 | Efficient form state management |
| **Validation Schema** | Zod | 3.25.76 | TypeScript-first schema validation |
| **Component Library** | Radix UI | 1.x | Headless UI components (accordion, dialog, select, etc) |
| **State Management** | Built-in (Hooks) | - | React hooks untuk local state management |
| **HTTP Client** | Axios | 1.13.2 | Promise-based HTTP client untuk API calls |
| **JWT Handling** | jsonwebtoken | 9.0.3 | JWT token generation dan verification |
| **Password Hashing** | bcryptjs | 3.0.3 | Secure password hashing dengan bcrypt algorithm |
| **Crypto - DID/VC** | Credo-TS | 0.6.2 | Framework untuk DID management & Verifiable Credentials |
| **Crypto - Core** | @credo-ts/core | 0.6.2 | Core cryptographic operations untuk SSI |
| **Crypto - OpenID4VC** | @credo-ts/openid4vc | 0.6.2 | OpenID4VCI protocol implementation |
| **Crypto - Storage** | @credo-ts/askar | 0.6.2 | Secure credential storage dengan Askar |
| **Crypto - Wallet** | @credo-ts/node | 0.6.2 | Node.js wallet implementation untuk agent |
| **Crypto - Askar Native** | @openwallet-foundation/askar-nodejs | 0.6.0 | Native Askar library untuk cryptographic operations |
| **QR Code Generation** | qrcode | 1.5.3 | Generate QR codes untuk credential offers |
| **PDF Parsing** | pdf-parse | 2.4.5 | Parse PDF files untuk ekstrak data |
| **Build Tool (Backend)** | TypeScript Compiler | - | Compile TypeScript ke JavaScript |
| **Dev Tool (Backend)** | TSX | 4.7.0 | TypeScript execution dalam development mode |
| **Package Manager** | pnpm | 8.0+ | Fast & disk space efficient package manager |
| **Web Server (VPS)** | Nginx | 1.18+ | Reverse proxy, SSL/TLS termination, load balancing |
| **SSL Certificate** | Let's Encrypt | - | Free SSL/TLS certificates untuk HTTPS |
| **OS (VPS)** | Ubuntu/Linux | 20.04 LTS+ | Operating system untuk production server |
| **Domain** | - | issuer.identia.my.id | Production domain untuk Issuer service |
| **Port (Backend)** | - | 3001 | Internal port untuk Node.js backend service |
| **Port (Frontend)** | - | 3000 | Internal port untuk Next.js frontend service |
| **Port (HTTP)** | - | 80 | HTTP (auto-redirect ke HTTPS) |
| **Port (HTTPS)** | - | 443 | HTTPS untuk production API & UI |
| **API Key Management** | .env (dotenv) | 16.3.1 | Environment variable management untuk secrets |

### Konfigurasi VPS Production

- **Reverse Proxy**: Nginx mendengarkan port 443 (HTTPS) dan 80 (HTTP)
- **SSL/TLS**: Let's Encrypt dengan auto-renewal
- **Backend Service**: Berjalan di localhost:3001, di-proxy oleh Nginx
- **Frontend Service**: Berjalan di localhost:3000 (dapat di-proxy atau standalone)
- **Database Connection**: PostgreSQL lokal atau remote dengan connection pooling
- **Environment**: Production dengan NODE_ENV=production

---

## B. KOMPONEN UTAMA

### 1. Backend Services

| Service | Fungsi |
|---------|--------|
| `auth.service.ts` | Generate & verifikasi authorization code, login user |
| `credential.service.ts` | Manage credential lifecycle (store, revoke, suspend) |
| `token.service.ts` | Token exchange, nonce rotation, cleanup expired tokens |
| `user.service.ts` | Register user, bind DID, manage onboarding status |
| `policy.service.ts` | Evaluate issuance policies, verify trusted credentials |
| `proof.service.ts` | Verify holder proof JWT & presented credentials |
| `registry.service.ts` | Manage trusted registry & identity data |

### 2. Controllers (Route Handlers)

| Controller | Endpoint | Aksi |
|-----------|----------|------|
| **AuthController** | `GET/POST /authorize` | Redirect ke login, authenticate + generate auth code |
| | `POST /login` | Username/password authentication |
| | `POST /register` | Register user baru (holder) |
| | `POST /bootstrap/*` | Bootstrap flow dengan OTP verification |
| **TokenController** | `POST /token` | Exchange authorization code → access token |
| **OfferController** | `POST /credential-offer` | Create credential offer + QR code |
| | `GET /credential-offer/:id` | Retrieve offer by ID (untuk wallet) |
| **CredentialController** | `POST /credential` | Issue signed JWT VC (memerlukan bearer token) |
| | `GET /wallet/credentials` | Sync holder credentials |
| | `POST /credential/ssi-native` | SSI-native flow dengan verified VC |
| **RegistryController** | `/registry/*` | Manage trusted registry & policies |

---

## C. DATABASE MODELS (Prisma Schema)

### User Model
```
User
├── id (UUID, PK)
├── username (unique, untuk admin)
├── email (unique)
├── passwordHash (bcrypt)
├── fullName
├── nik (unique, untuk holder - NIK 16 digit)
├── nama (nama lengkap holder)
├── tanggalLahir (date of birth holder)
├── userType (ADMIN/HOLDER)
├── role (ADMIN/OPERATOR)
├── onboardingStatus (VERIFIED/PENDING/REJECTED)
├── isActive (boolean)
├── lastLoginAt (timestamp)
├── loginAttempts (counter)
├── lockedUntil (security lockout)
├── createdAt, updatedAt
└── Relations: 
    ├── auditLogs[]
    ├── authorizationCodes[]
    ├── accessTokens[]
    ├── credentials[]
    ├── pairwiseDids[]
    └── policyDecisions[]
```

### AuthorizationCode Model
```
AuthorizationCode
├── code (String, PK, unique)
├── userId (FK → User)
├── clientId (wallet identifier)
├── redirectUri (OID4VCI redirect URL)
├── state (PKCE state)
├── used (boolean, default false)
├── expiresAt (10 menit dari creation)
├── createdAt
└── Relation: User
```

### AccessToken Model
```
AccessToken
├── token (String, PK, unique)
├── userId (FK → User)
├── revoked (boolean, default false)
├── expiresAt
├── createdAt
└── Relation: User
```

### Credential Model
```
Credential
├── id (UUID, PK)
├── credentialJwt (text, signed JWT VC)
├── credentialOfferUri (OID4VCI offer URI)
├── format (default: "jwt_vc_json")
├── holderDid (pairwise DID pemegang)
├── credentialStatus (ACTIVE/REVOKED/SUSPENDED)
├── expiresAt (credential expiration)
├── createdAt, updatedAt
├── userId (FK → User)
└── Relations: User, CredentialStatus
```

### CredentialOffer Model
```
CredentialOffer
├── id (UUID, PK)
├── offerData (JSON - OID4VCI metadata)
├── expiresAt (offer expiration)
├── used (boolean, default false)
└── Pre-auth codes untuk pre-authorized flow
```

### IssuerConfig Model
```
IssuerConfig
├── key (String, PK - config name)
└── value (String - config data)
```

### TrustedRegistryIdentity Model
```
TrustedRegistryIdentity
├── nik (String, PK - NIK 16 digit)
├── nama (nama lengkap)
├── tanggalLahir (date of birth)
├── isActive (boolean)
└── Source of verified identities untuk auto-provisioning
```

### PairwiseDid Model
```
PairwiseDid
├── Relationship: holder DID ↔ pairwise DID
└── Support untuk shared holder DIDs
```

---

## D. FLOW UTAMA (OID4VCI Authorization Code)

### 1️⃣ REGISTRATION FLOW

```
User (Frontend) → POST /register
  ├─ Validate: username, password, email, nik
  ├─ Check trusted registry (jika ada)
  ├─ Hash password (bcrypt, 12 rounds)
  ├─ Create User in DB
  └─ Response: user created successfully
      └─ Audit log: USER_REGISTERED
```

**Validasi**:
- Email format valid
- Password strength
- NIK format (16 digit)
- Username unique
- Email unique
- NIK unique (untuk holder)

**Database Operations**:
1. Check if user exists
2. Hash password
3. Create user record
4. Create audit log

---

### 2️⃣ LOGIN → AUTHORIZATION FLOW

```
Wallet / Frontend 
  ↓
GET /authorize?client_id=...&redirect_uri=...&state=...&code_challenge=...
  └─ AuthController.getAuthorize()
    ├─ Validate request parameters
    └─ Redirect ke frontend login page
      └─ Response: HTML login form

Frontend → User input username/password 
  ↓
POST /authorize
  ├─ Body: {username, password, holder_did/wallet_did/client_id}
  ├─ AuthController.postAuthorize()
  ├─ Validate credentials (case-insensitive, check password hash)
  ├─ Resolve holder DID dari:
  │  ├─ holder_did (explicit)
  │  ├─ wallet_did (wallet-provided)
  │  ├─ client_id (if starts with "did:")
  │  └─ SHARED_HOLDER_DIDS (fallback untuk shared wallets)
  │
  ├─ Generate random authorization code (12 bytes)
  ├─ Store in DB:
  │  └─ AuthorizationCode:
  │     ├─ code
  │     ├─ userId
  │     ├─ clientId
  │     ├─ redirectUri
  │     ├─ state
  │     ├─ expiresAt = now() + 10 menit
  │
  ├─ Create audit log: AUTH_AUTHORIZED
  └─ Response: 
     ├─ redirect_uri?code=<code>&state=<state>
     └─ JSON: {code, redirect_uri, state}
```

**Validasi**:
- Username/email exist
- Password match (bcrypt compare)
- User is active (isActive = true)
- NIK jika holder
- DID format valid

---

### 3️⃣ TOKEN EXCHANGE FLOW

```
Wallet 
  ↓
POST /token
  ├─ Body: {
  │   grant_type: "authorization_code",
  │   code: <auth_code>,
  │   client_id: <wallet_id>,
  │   code_verifier: <PKCE_verifier> (optional)
  │ }
  │
  ├─ TokenController.exchangeToken()
  ├─ Lookup AuthorizationCode in DB
  ├─ Validate:
  │  ├─ Code exists
  │  ├─ Code not expired (expiresAt > now)
  │  ├─ Code not used (used = false)
  │  ├─ ClientId match
  │  └─ PKCE verification (jika enabled)
  │
  ├─ Mark code as used (used = true)
  ├─ Get user info
  ├─ Generate access token:
  │  └─ JWT payload: {userId, clientId, scope, iat, exp}
  │
  ├─ Store in DB (AccessToken):
  │  ├─ token
  │  ├─ userId
  │  ├─ revoked = false
  │  ├─ expiresAt = now() + token_lifetime
  │
  ├─ Generate nonce untuk next credential request
  └─ Response:
     ├─ access_token: <jwt_token>
     ├─ token_type: "Bearer"
     ├─ expires_in: <seconds>
     ├─ c_nonce: <nonce>
     └─ c_nonce_expires_in: <seconds>
```

**Error Cases**:
- Invalid/expired code → 400 Bad Request
- Code already used → 400 Invalid Grant
- PKCE mismatch → 400 Invalid Request

---

### 4️⃣ CREDENTIAL OFFER FLOW

```
Admin / System 
  ↓
POST /credential-offer
  ├─ OfferController.createOffer()
  ├─ Generate credential offer:
  │  └─ CredentialOffer {
  │     ├─ credential_issuer: <base_url>
  │     ├─ credential_configuration_ids: ["kartu_bpjs_kesehatan"]
  │     └─ grants: {
  │        ├─ authorization_code: {
  │        │  ├─ issuer_state: <offer_id>
  │        │  └─ authorization_server: <base_url>
  │        └─ pre-authorized_code (optional): {
  │           ├─ pre-authorized_code: <code>
  │           └─ user_pin_required: false
  │
  ├─ Store in DB (CredentialOffer):
  │  ├─ id: <offer_id>
  │  ├─ offerData: <json_metadata>
  │  ├─ expiresAt: now() + 10 minutes
  │  └─ used: false
  │
  ├─ Generate QR Code:
  │  └─ URL: openid-vc://?credential_offer_uri=<issuer_url>/credential-offer?offerId=<id>
  │
  └─ Response:
     ├─ credential_offer_uri
     ├─ qr_code (data URL atau image)
     └─ offer metadata

Wallet (scans QR or opens link)
  ↓
GET /credential-offer?offerId=<id>
  ├─ OfferController.getOffer() atau getSimpleOffer()
  ├─ Lookup CredentialOffer in DB
  ├─ Validate:
  │  ├─ Offer exists
  │  ├─ Not expired (expiresAt > now)
  │  └─ Not used (used = false)
  │
  ├─ Mark as used (used = true)
  │
  └─ Response:
     └─ OID4VCI credential offer JSON
        ├─ credential_issuer
        ├─ credential_configuration_ids
        └─ grants
```

---

### 5️⃣ CREDENTIAL ISSUANCE FLOW

```
Wallet 
  ↓
POST /credential
  ├─ Headers: Authorization: Bearer <access_token>
  ├─ Body: {
  │   format: "jwt_vc_json",
  │   credential_definition: {
  │     type: ["VerifiableCredential", "IdentityCredential"]
  │   },
  │   proof: {
  │     proof_type: "jwt",
  │     jwt: <holder_proof_jwt>
  │   }
  │ }
  │
  ├─ CredentialController.issueCredential()
  │
  ├─ 1. Validate Access Token
  │  ├─ Extract token from Bearer header
  │  ├─ Decode JWT
  │  ├─ Get userId from token
  │  └─ Verify token not revoked & not expired
  │
  ├─ 2. Verify Holder Proof JWT
  │  ├─ Parse proof.jwt
  │  ├─ Verify signature (holder's public key)
  │  ├─ Validate claims:
  │  │  ├─ aud = issuer
  │  │  ├─ iat recent
  │  │  └─ nonce matches current c_nonce
  │  └─ ProofVerificationError jika invalid
  │
  ├─ 3. Validate Credential Request
  │  ├─ Format must be "jwt_vc_json"
  │  ├─ Credential definition valid
  │  └─ Proof present & valid
  │
  ├─ 4. Policy Evaluation
  │  ├─ evaluateIssuancePolicy()
  │  ├─ Check if user eligible untuk credential:
  │  │  ├─ Status, permissions, compliance
  │  │  └─ Trust policy untuk presented credentials
  │  └─ PolicyViolationError jika tidak eligible
  │
  ├─ 5. Check Credential Reusability (optional)
  │  ├─ findReusableActiveCredentialForUser()
  │  ├─ If found & still valid → reuse
  │  └─ Else → create new credential
  │
  ├─ 6. Create Signed JWT VC
  │  ├─ Get issuer DID from Credo Agent
  │  ├─ Build VC payload:
  │  │  ├─ @context: ["https://www.w3.org/2018/credentials/v1"]
  │  │  ├─ type: ["VerifiableCredential", "IdentityCredential"]
  │  │  ├─ issuer: <issuer_did>
  │  │  ├─ issuanceDate: <now_iso>
  │  │  ├─ expirationDate: <future_date>
  │  │  └─ credentialSubject: {
  │  │     ├─ id: <holder_pairwise_did>
  │  │     ├─ nik: <no_bpjs_dari_nik>
  │  │     ├─ nama: <holder_name>
  │  │     └─ claims...
  │  │
  │  ├─ Sign JWT dengan issuer's private key (Credo):
  │  │  └─ JWT header:
  │  │     ├─ alg: "ES256"
  │  │     ├─ typ: "JWT"
  │  │     └─ kid: <signing_kid>
  │  │
  │  └─ Signed JWT VC string
  │
  ├─ 7. Store Credential in Database
  │  └─ Credential record:
  │     ├─ id: <uuid>
  │     ├─ userId
  │     ├─ credentialJwt: <signed_jwt>
  │     ├─ holderDid: <pairwise_did>
  │     ├─ credentialStatus: "ACTIVE"
  │     ├─ format: "jwt_vc_json"
  │     ├─ expiresAt
  │     └─ createdAt
  │
  ├─ 8. Rotate Token Nonce
  │  └─ Generate new c_nonce untuk next request
  │
  ├─ 9. Audit Logging
  │  └─ CREDENTIAL_ISSUED event
  │
  └─ Response:
     ├─ format: "jwt_vc_json"
     ├─ credential: "<signed_jwt_vc>"
     ├─ c_nonce: <new_nonce>
     └─ c_nonce_expires_in: <seconds>
```

**Error Cases**:
- Invalid access token → 401 Unauthorized
- Proof verification failed → 400 Bad Request
- Policy violation → 403 Forbidden
- Issuer error → 500 Internal Server Error

---

### 6️⃣ CREDENTIAL STATUS & REVOCATION FLOW

```
Wallet 
  ↓
GET /credential/status/:id
  ├─ CredentialController.getCredentialStatus()
  ├─ Lookup Credential in DB
  ├─ Return current status:
  │  ├─ ACTIVE
  │  ├─ REVOKED
  │  └─ SUSPENDED
  │
  └─ Response:
     └─ {
        ├─ credential_id: <id>
        ├─ status: <status>
        └─ status_list: <list_index> (for batch status)
        }

Admin / System
  ↓
POST /credential/revoke/:id
  ├─ Admin auth required (API key or admin token)
  ├─ Lookup Credential
  ├─ Update Credential.credentialStatus = "REVOKED"
  ├─ Create audit log: CREDENTIAL_REVOKED
  └─ Response: success

POST /credential/suspend/:id
  ├─ Admin auth required
  ├─ Update Credential.credentialStatus = "SUSPENDED"
  ├─ Create audit log: CREDENTIAL_SUSPENDED
  └─ Response: success

POST /credential/extend/:id
  ├─ Admin auth required
  ├─ Update Credential.expiresAt = <new_date>
  ├─ Create audit log: CREDENTIAL_EXTENDED
  └─ Response: success
```

---

## E. SECURITY FEATURES

| Fitur | Implementasi |
|-------|--------------|
| **Input Validation** | `sanitizeInput` middleware (XSS prevention) |
| **Rate Limiting** | `rateLimiter` middleware |
| **CORS** | Express CORS configuration |
| **Security Headers** | `securityHeaders` middleware (CSP, X-Frame-Options, HSTS, dll) |
| **Authentication** | Bearer token (JWT via access token) |
| **Password Hashing** | bcryptjs (12 rounds) |
| **Audit Logging** | `auditLogger` middleware (track semua aksi) |
| **DID Management** | Credo-TS agent (cryptographic keys) |
| **Proof Verification** | Verify holder proof JWT sebelum issuance |
| **Policy Evaluation** | Trust policy validation untuk credential issuance |
| **Token Expiry** | Automatic cleanup expired tokens, codes, credentials |
| **Account Lockout** | loginAttempts counter + lockedUntil timestamp |
| **PKCE** | Proof Key for Public Clients (optional) |

---

## F. MIDDLEWARE STACK

```
Express Server
├─ Environment Config (dotenv)
├─ Trust Proxy (Nginx: trust first hop)
├─ Security Headers
│  ├─ CSP (Content Security Policy)
│  ├─ X-Frame-Options: DENY
│  ├─ X-Content-Type-Options: nosniff
│  └─ HSTS
│
├─ Rate Limiter
├─ CORS
├─ Body Parser (JSON, max size)
├─ Input Sanitization
├─ Audit Logger
│
├─ Routes:
│  ├─ /.well-known/* (OID4VCI discovery)
│  │  └─ GET /.well-known/openid-credential-issuer
│  │  └─ GET /.well-known/openid-configuration
│  │
│  ├─ /authorize, /login, /register (auth)
│  ├─ /token (token exchange)
│  ├─ /credential-offer, /credential (OID4VCI issuance)
│  └─ /registry/* (trust management)
│
├─ Error Handler
└─ Graceful Shutdown
   ├─ Close database connection
   ├─ Shutdown Credo Agent
   └─ Stop cleanup tasks
```

---

## G. FRONTEND PAGES (Next.js)

| Page | Fungsi |
|------|--------|
| `/` | Redirect ke `/login` |
| `/login` | User authentication form (username + password) |
| `/register` | Registration form untuk holder baru |
| `/authorize` | Approval page untuk credential request dari wallet |
| `/dashboard` | Admin dashboard (manage users, credentials, statistics) |
| `/issuer` | Issuer interface (create offers, monitor issuance) |

**Frontend Features**:
- Responsive design
- Theme provider (light/dark mode)
- UI components (buttons, cards, dialogs, forms)
- API integration via `/lib/api.ts`
- Authentication state management

---

## H. KEY DECISION POINTS (Untuk Activity Diagram)

1. **User Type Check**: Admin vs Holder
   - Admin → Dashboard
   - Holder → Credential request

2. **Registry Lookup**: Apakah NIK ada di trusted registry?
   - Yes → Auto-provision user
   - No → Manual verification

3. **Code/Token Validation**: 
   - Check expiry
   - Check used status
   - Check client_id match

4. **Policy Evaluation**: Apakah user eligible untuk credential?
   - Check status
   - Check permissions
   - Check compliance

5. **Proof Verification**: Valid holder proof JWT?
   - Yes → Issue credential
   - No → Return error

6. **Credential Reuse**: Apakah bisa reuse credential lama?
   - Yes → Return existing
   - No → Create new

7. **Status Check**: Is credential active, revoked, suspended?
   - ACTIVE → Valid
   - REVOKED → Reject
   - SUSPENDED → Deny

---

## I. ASYNC TASKS & CLEANUP (Background Jobs)

```javascript
// Periodic cleanup tasks
├─ cleanupExpiredCredentials()
│  └─ Delete/archive credentials past expiryDate
│
├─ cleanupExpiredTokens()
│  └─ Delete expired AccessToken records
│
└─ cleanupExpiredAuthCodes()
   └─ Delete expired AuthorizationCode records
```

---

## J. ENVIRONMENT VARIABLES (.env)

```env
# Server
PORT=3001
NODE_ENV=development

# Database
DATABASE_URL=postgresql://user:password@host:5432/issuer_db

# Authentication
JWT_SECRET=<secret_key>
BCRYPT_ROUNDS=12

# OID4VCI
BASE_URL=https://issuer.identia.my.id
ISSUER_DID=did:web:issuer.identia.my.id
SIGNING_KID=<key_id>

# Wallet Configuration
SHARED_HOLDER_DIDS=did:web:wallet.identia.my.id

# Security
ENABLE_RATE_LIMIT=true
RATE_LIMIT_WINDOW=15m
RATE_LIMIT_MAX_REQUESTS=100

# Features
OID4VCI_ENABLE_PREAUTHORIZED_BY_DEFAULT=false
ENABLE_BOOTSTRAP_FLOW=true
ENABLE_SSI_NATIVE_FLOW=true

# Cleanup Tasks
CLEANUP_INTERVAL=3600000 # 1 hour
```

---

## K. ARCHITECTURE DIAGRAM

```
┌─────────────────────────────────────────────────────────────┐
│                        WALLET / FRONTEND                     │
├─────────────────────────────────────────────────────────────┤
│  - Next.js SPA (login, register, authorize)                 │
│  - QR Code Scanner                                          │
│  - Credential Storage                                       │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTP/HTTPS
                       ↓
┌─────────────────────────────────────────────────────────────┐
│                      EXPRESS BACKEND                         │
├─────────────────────────────────────────────────────────────┤
│  Controllers:                                               │
│  ├─ AuthController (authorize, login, register)            │
│  ├─ TokenController (token exchange)                       │
│  ├─ OfferController (credential offer)                     │
│  ├─ CredentialController (issue credential)                │
│  └─ RegistryController (trust management)                  │
│                                                             │
│  Services:                                                  │
│  ├─ auth.service (auth code & verification)                │
│  ├─ token.service (access token generation)                │
│  ├─ credential.service (credential lifecycle)              │
│  ├─ user.service (user management)                         │
│  ├─ policy.service (policy evaluation)                     │
│  ├─ proof.service (JWT proof verification)                 │
│  └─ registry.service (registry management)                 │
│                                                             │
│  Security:                                                  │
│  ├─ auth.guard (Bearer token validation)                   │
│  ├─ middleware (sanitize, rate limit, headers)             │
│  └─ validation (input validation)                          │
└──────────┬──────────────────────────────────┬───────────────┘
           │                                  │
           ↓                                  ↓
┌──────────────────────┐        ┌──────────────────────┐
│   POSTGRESQL DB      │        │   CREDO-TS AGENT    │
├──────────────────────┤        ├──────────────────────┤
│ - Users              │        │ - DID Management    │
│ - AuthorizationCodes │        │ - Key Rotation      │
│ - AccessTokens       │        │ - Cryptography      │
│ - Credentials        │        │ - Proof Generation  │
│ - CredentialOffers   │        │ - JWT Signing       │
│ - TrustedRegistry    │        └──────────────────────┘
│ - AuditLogs          │
│ - Policies           │
└──────────────────────┘
```

---

## L. REQUEST/RESPONSE EXAMPLES

### Register User
```http
POST /register HTTP/1.1
Content-Type: application/json

{
  "username": "admin01",
  "email": "admin@issuer.local",
  "password": "SecurePassword123!",
  "fullName": "Admin User"
}

HTTP/1.1 201 Created
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "username": "admin01",
  "email": "admin@issuer.local",
  "fullName": "Admin User",
  "userType": "ADMIN",
  "createdAt": "2026-05-05T10:30:00Z"
}
```

### Authorization Request
```http
GET /authorize?client_id=wallet123&redirect_uri=https://wallet.local/callback&state=abc123&code_challenge=xyz789 HTTP/1.1

HTTP/1.1 302 Found
Location: /login?client_id=wallet123&redirect_uri=...&state=...
```

### Authorization Code Generation
```http
POST /authorize HTTP/1.1
Content-Type: application/json

{
  "username": "holder_nik",
  "password": "password123",
  "holder_did": "did:web:holder.identia.my.id",
  "client_id": "wallet123"
}

HTTP/1.1 200 OK
{
  "code": "AUTH123456789",
  "redirect_uri": "https://wallet.local/callback?code=AUTH123456789&state=abc123"
}
```

### Token Exchange
```http
POST /token HTTP/1.1
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code&code=AUTH123456789&client_id=wallet123&code_verifier=verifier123

HTTP/1.1 200 OK
{
  "access_token": "eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "c_nonce": "nonce123456",
  "c_nonce_expires_in": 300
}
```

### Credential Issuance
```http
POST /credential HTTP/1.1
Authorization: Bearer eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "format": "jwt_vc_json",
  "credential_definition": {
    "type": ["VerifiableCredential", "IdentityCredential"]
  },
  "proof": {
    "proof_type": "jwt",
    "jwt": "eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}

HTTP/1.1 200 OK
{
  "format": "jwt_vc_json",
  "credential": "eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6Imlzc3Vlci1rZXkifQ...",
  "c_nonce": "nonce789012",
  "c_nonce_expires_in": 300
}
```

---

## M. ERROR HANDLING

| Error | HTTP Code | Deskripsi |
|-------|-----------|-----------|
| Invalid request | 400 | Missing/invalid parameters |
| Unauthorized | 401 | Missing/invalid auth token |
| Forbidden | 403 | No permission untuk aksi |
| Not Found | 404 | Resource tidak ditemukan |
| Conflict | 409 | Duplicate username/email/nik |
| Internal Server Error | 500 | Server error |
| Service Unavailable | 503 | DB/Agent unavailable |

---

## N. DEPLOYMENT & CONFIGURATION

**Production Setup**:
- Nginx reverse proxy (API gateway)
- PostgreSQL database (production-grade)
- Credo Agent (Docker container atau integrated)
- Environment variables untuk secrets
- HTTPS dengan valid SSL certificate
- Rate limiting & DDoS protection
- Database backups & replication
- Monitoring & alerting
- Audit log persistence

**VPS Deployment**:
```bash
npm run vps:setup    # Setup VPS environment
npm run vps:migrate  # Migrate to VPS database
npm run build        # Build production
npm run start        # Start server
```

---

## O. TESTING & DEBUGGING

**Available Scripts**:
```bash
npm run dev                    # Development dengan hot reload
npm run build                  # Production build
npm run start                  # Start server
npm run db:generate            # Generate Prisma client
npm run db:migrate             # Run database migrations
npm run db:studio              # Prisma Studio (visual DB)
npm run did:generate           # Generate DID document
npm run registry:import        # Import trusted registry
npm run registry:check         # Verify registry matching
npm run test:connection        # Test DB connection
```

---

## P. API ENDPOINTS SUMMARY

| Method | Endpoint | Middleware | Aksi |
|--------|----------|-----------|------|
| GET | `/.well-known/openid-credential-issuer` | Public | OID4VCI Discovery |
| GET | `/authorize` | Public | Redirect ke login |
| POST | `/authorize` | Public | Generate auth code |
| POST | `/login` | Public | User login |
| POST | `/register` | Public | User registration |
| POST | `/bootstrap/request` | Public | Bootstrap request |
| POST | `/bootstrap/verify-otp` | Public | Bootstrap OTP verify |
| POST | `/bootstrap/admin-approve` | API Key | Bootstrap approval |
| POST | `/token` | Public | Token exchange |
| GET | `/credential-offer` | Public | Get offer metadata |
| POST | `/credential-offer` | Public | Create offer |
| POST | `/credential-offer-url` | Public | Create offer + URL |
| GET | `/credential-offer/:id` | Public | Retrieve offer |
| POST | `/credential` | Bearer Token | Issue credential |
| POST | `/credential/ssi-native` | Bearer Token | SSI-native issuance |
| GET | `/wallet/credentials` | Bearer Token | Sync credentials |
| GET | `/credential/status/:id` | Public | Check credential status |
| POST | `/credential/revoke/:id` | Admin Auth | Revoke credential |
| POST | `/credential/suspend/:id` | Admin Auth | Suspend credential |
| POST | `/credential/extend/:id` | Admin Auth | Extend expiry |
| GET | `/registry/*` | Public | Get registry data |
| POST | `/registry/*` | Admin Auth | Manage registry |

---

## Q. CATATAN PENTING

1. **OID4VCI Compliance**: Mengikuti standar OpenID4VCI untuk issuance credentials
2. **DID Management**: Menggunakan Credo-TS untuk cryptographic key management
3. **Pairwise DIDs**: Support untuk pairwise DIDs antara issuer & holder
4. **Pre-authorized Flow**: Optional pre-authorized code grant untuk mobile-friendly flow
5. **Audit Trail**: Semua aksi dicatat untuk compliance & debugging
6. **Cleanup**: Automated cleanup untuk expired codes, tokens, credentials
7. **Registry**: Integration dengan trusted registry untuk auto-provisioning
8. **Policy Engine**: Custom policy evaluation untuk flexible credential issuance rules
9. **Security First**: Rate limiting, input validation, CORS, security headers, etc.

---

*Dokumentasi ini dibuat berdasarkan analisis kode program BPJS OID4VCI Issuer v2.0.0*
