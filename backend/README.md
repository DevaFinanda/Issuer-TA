# BPJS Archive Issuer - Stable Implementation

Production-ready issuer backend menggunakan **did-jwt** + **did-jwt-vc** (stable, pure JavaScript, no native dependencies).

## ✅ Keunggulan

- **Stabil** - Pure JavaScript, no native build required
- **Ringan** - No heavy dependencies like Credo/Veramo
- **Production Ready** - Used by many SSI projects
- **Windows Compatible** - No Visual Studio Build Tools needed
- **W3C Standard** - Full W3C VC compliance
- **JWT Format** - Industry standard

## 🚀 Quick Start

```bash
# 1. Install
npm install

# 2. Setup DID (generate keys + DID Document)
npm run setup

# 3. Run server
npm run dev
```

## 📡 API

### Issue Credential
```bash
POST /api/issue
{
  "documentId": "DOC001",
  "documentHash": "abc123",
  "documentType": "Surat Keputusan",
  "holderDID": "did:web:holder.example.com",
  "holderName": "Ahmad",
  "noBPJS": "1234567890",
  "nik": "3201234567890123",
  "tanggalLahir": "1990-01-01",
  "alamat": "Jakarta"
}
```

Response: QR Code + JWT Credential

## 🔐 Security

- Ed25519 keypair
- JWT signed credentials
- Private key in `.env` (encrypted in production)

## 🎯 Tech Stack

- **did-jwt** - JWT-based DIDs
- **did-jwt-vc** - Verifiable Credentials
- **did-resolver** - DID resolution
- **web-did-resolver** - DID Web support
- **Express** - HTTP server
- **TypeScript** - Type safety
- **PostgreSQL** - Production database
- **Prisma** - Database ORM

## 🗄️ Database VPS Setup

### Windows (PowerShell)
```powershell
# Setup VPS + Push Schema
.\setup-vps.ps1 -VpsIp "YOUR_VPS_IP" -DbPassword "YOUR_PASSWORD"

# Migrate data dari lokal
.\migrate-to-vps.ps1 -VpsIp "YOUR_VPS_IP" -DbPassword "YOUR_PASSWORD"
```

### Linux/Mac
```bash
chmod +x quick-setup.sh
./quick-setup.sh YOUR_VPS_IP YOUR_PASSWORD
```

### Manual
```bash
# Upload & run di VPS
scp scripts/vps-setup.sh root@VPS_IP:~/
ssh root@VPS_IP "chmod +x vps-setup.sh && ./vps-setup.sh"

# Update .env di laptop
DATABASE_URL="postgresql://issuer_user:PASS@VPS_IP:5432/issuer_db?schema=public&sslmode=require"

# Push schema
pnpm prisma db push
```

### pgAdmin
```
Host: YOUR_VPS_IP | Port: 5432 | DB: issuer_db
User: issuer_user | SSL: Require
```
