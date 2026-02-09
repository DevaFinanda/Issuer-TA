# 🐳 Docker Setup untuk BPJS Issuer

## 🔒 DATA PERSISTENCE GUARANTEE

**SEMUA DATA TERSIMPAN PERMANEN** di database PostgreSQL dengan Docker volume persistence!

✅ Data TIDAK akan hilang saat:
- Refresh browser (F5)
- Buka tab baru
- Restart container
- Restart komputer

🔗 **Dokumentasi Lengkap**: Lihat [DATA-PERSISTENCE.md](DATA-PERSISTENCE.md)

🧪 **Test Persistence**: Jalankan `.\test-persistence.ps1`

---

## Quick Start - Docker Desktop

### Langkah 1: Persiapan
1. Pastikan Docker Desktop sudah terinstall dan berjalan
2. Copy file environment variables:
   ```powershell
   Copy-Item .env.docker .env
   ```
3. (Opsional) Edit file `.env` untuk mengubah konfigurasi security keys

### Langkah 2: Jalankan dengan Docker Desktop
1. Buka Docker Desktop
2. Cari dan buka project folder ini di Docker Desktop
3. Klik tombol **▶️ Play** pada `docker-compose.yml`
4. Tunggu beberapa menit sampai semua services (postgres, backend, frontend) berjalan dengan status "Running" 🟢

### Langkah 3: Akses Aplikasi
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:3001
- **Database**: localhost:5432

---

## Alternatif: Menggunakan Command Line

### Build dan Start
```powershell
# Build dan start semua services
docker-compose up -d

# Atau dengan rebuild
docker-compose up -d --build
```

### Stop Services
```powershell
docker-compose down
```

### Stop dan Hapus Data
```powershell
# Hati-hati: ini akan menghapus semua data di database
docker-compose down -v
```

---

## Melihat Logs

### Dari Docker Desktop
1. Klik pada container yang ingin dilihat logsnya
2. Tab "Logs" akan menampilkan output secara real-time

### Dari Command Line
```powershell
# Semua services
docker-compose logs -f

# Specific service
docker-compose logs -f backend
docker-compose logs -f frontend
docker-compose logs -f postgres
```

---

## Troubleshooting

### Port sudah digunakan
Jika ada error "port already allocated":
1. Ubah port di `docker-compose.yml`:
   ```yaml
   ports:
     - "3002:3001"  # Backend: host:container
     - "3010:3000"  # Frontend: host:container
   ```

### Database connection error
1. Tunggu beberapa detik sampai database ready
2. Restart backend container:
   ```powershell
   docker-compose restart backend
   ```

### Build error
```powershell
# Clean rebuild
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

### Reset semua (fresh start)
```powershell
# Stop semua dan hapus volumes
docker-compose down -v

# Hapus images (opsional)
docker-compose down --rmi all -v

# Build dan start ulang
docker-compose up -d --build
```

---

## Services

### 🗄️ PostgreSQL Database
- **Container**: issuer-postgres
- **Port**: 5432
- **User**: postgres
- **Password**: Deva123
- **Database**: issuer_db

### 🔧 Backend API
- **Container**: issuer-backend
- **Port**: 3001
- **Framework**: Express.js + TypeScript
- **Features**: DID Web, SD-JWT, Prisma ORM

### 🎨 Frontend
- **Container**: issuer-frontend
- **Port**: 3000
- **Framework**: Next.js 14
- **UI**: React + Tailwind CSS

---

## Health Checks

Semua services memiliki health checks yang otomatis berjalan:
- ✅ Green: Service healthy dan siap
- 🟡 Yellow: Starting (tunggu beberapa saat)
- 🔴 Red: Unhealthy (cek logs)

---

## Environment Variables

File `.env` berisi konfigurasi berikut:

```env
ISSUER_PRIVATE_KEY=    # Private key untuk signing credentials
API_KEY=               # API key untuk security
SESSION_SECRET=        # Secret untuk session management
```

Generate secure keys dengan:
```powershell
# PowerShell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Development Mode

Untuk development dengan hot-reload, gunakan cara normal (bukan Docker):

```powershell
# Backend
cd backend
pnpm install
pnpm dev

# Frontend
cd frontend
pnpm install
pnpm dev
```

Docker lebih cocok untuk:
- ✅ Production deployment
- ✅ Testing production build
- ✅ Konsistensi environment
- ✅ Easy setup untuk demo

---

## Production Deployment

Untuk production:
1. Ganti password database di `docker-compose.yml`
2. Generate dan set semua secret keys di `.env`
3. Gunakan reverse proxy (nginx) di depan services
4. Enable SSL/TLS
5. Set `NODE_ENV=production`

---

## Tips

- 💡 Stop services saat tidak digunakan untuk menghemat resources
- 💡 Gunakan `docker-compose logs -f` untuk debugging
- 💡 Database data tersimpan di Docker volume `postgres_data`
- 💡 Backup volume secara berkala untuk production

---

## Support

Jika ada masalah:
1. Cek logs: `docker-compose logs -f`
2. Cek status: `docker-compose ps`
3. Restart service: `docker-compose restart [service-name]`
4. Fresh start: `docker-compose down -v && docker-compose up -d --build`
