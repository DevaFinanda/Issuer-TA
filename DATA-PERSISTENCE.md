# 🔒 DATA PERSISTENCE - JAMINAN DATA TIDAK HILANG

## ✅ Garantie Persistence

Sistem ini **MENJAMIN** bahwa semua data transaksi/credential yang disimpan akan **PERMANEN** dan **TIDAK AKAN HILANG** dalam kondisi apapun:

### ✓ Data TIDAK akan hilang ketika:
- ✅ Web di-refresh (F5)
- ✅ Browser ditutup dan dibuka lagi
- ✅ Membuka web di tab baru
- ✅ Membuka web di browser berbeda
- ✅ Docker container di-restart
- ✅ Server/komputer di-restart
- ✅ Docker Desktop ditutup dan dibuka lagi

### ✓ Data HANYA akan hilang jika:
- ❌ User menghapus data secara manual melalui API
- ❌ Volume Docker dihapus manual dengan command: `docker-compose down -v`
- ❌ Database di-drop manual

---

## 🔐 Bagaimana Cara Kerjanya?

### 1. **PostgreSQL dengan Volume Persistence**
```yaml
volumes:
  postgres_data:/var/lib/postgresql/data  # Data tersimpan di Docker volume
```

Data database tersimpan di **Docker Volume** yang:
- Berada di storage komputer Anda
- Tidak terhapus meskipun container di-stop
- Bertahan sampai volume dihapus manual

### 2. **Database-Only Storage (No Fallback)**
Backend dikonfigurasi untuk:
- ❌ TIDAK menggunakan in-memory storage
- ❌ TIDAK ada fallback mode
- ✅ WAJIB menggunakan database
- ✅ Server akan exit jika database tidak tersedia

Kode di [server.ts](backend/src/server.ts):
```typescript
if (!dbConnected) {
  console.error('❌ Database connection REQUIRED!')
  process.exit(1) // Exit jika tidak ada database
}
```

### 3. **Auto-Restart Policy**
```yaml
restart: unless-stopped  # Container auto-restart jika crash
```

---

## 🧪 Cara Test Persistence

### Test 1: Refresh Halaman
1. Buat credential baru di web issuer
2. Tekan F5 untuk refresh halaman
3. ✅ Data masih ada di dashboard

### Test 2: Buka Tab Baru
1. Buat credential di tab pertama
2. Buka http://localhost:3000 di tab baru
3. ✅ Data credential muncul di tab baru

### Test 3: Restart Browser
1. Buat credential
2. Tutup browser sepenuhnya
3. Buka browser lagi dan akses http://localhost:3000
4. ✅ Data credential masih tersimpan

### Test 4: Restart Container
```powershell
# Restart semua services
docker-compose restart

# Atau restart specific service
docker-compose restart backend
docker-compose restart postgres

# Akses web lagi
# ✅ Semua data masih ada
```

### Test 5: Stop dan Start Ulang
```powershell
# Stop semua services
docker-compose down

# Start lagi (tanpa flag -v)
docker-compose up -d

# Akses web
# ✅ Semua data masih ada karena volume tidak dihapus
```

### Test 6: Query API Langsung
```powershell
# Get all credentials dari database
curl http://localhost:3001/api/credentials -H "x-api-key: your-api-key"

# Atau di PowerShell:
Invoke-WebRequest -Uri "http://localhost:3001/api/credentials" -Headers @{"x-api-key"="your-api-key"}
```

Response akan menunjukkan semua credentials yang tersimpan di database.

---

## 📊 Monitoring Data Persistence

### 1. Check Database Volume
```powershell
# Lihat volumes yang ada
docker volume ls

# Inspect volume
docker volume inspect issuer_postgres_data

# Check ukuran data
docker system df -v
```

### 2. Check Database Langsung
```powershell
# Masuk ke container PostgreSQL
docker exec -it issuer-postgres psql -U postgres -d issuer_db

# Query data di database
SELECT COUNT(*) FROM credentials;
SELECT * FROM credentials ORDER BY "issuedAt" DESC LIMIT 5;

# Exit
\q
```

### 3. Monitoring Logs
```powershell
# Lihat log backend saat menyimpan data
docker-compose logs -f backend | Select-String "stored in database"

# Akan muncul log seperti:
# 💾 Credential PERMANENTLY stored in database with ID: xxx
# ✅ Data will persist across server restarts
```

---

## 💾 Backup Data

### Manual Backup
```powershell
# Create backup directory
mkdir -p ./backups

# Backup database
docker exec issuer-postgres pg_dump -U postgres issuer_db > ./backups/issuer_db_backup_$(Get-Date -Format 'yyyyMMdd_HHmmss').sql

# Atau dengan compression
docker exec issuer-postgres pg_dump -U postgres issuer_db | gzip > ./backups/issuer_db_backup_$(Get-Date -Format 'yyyyMMdd_HHmmss').sql.gz
```

### Restore Backup
```powershell
# Stop backend sementara
docker-compose stop backend

# Restore dari backup
Get-Content ./backups/issuer_db_backup_20260209_120000.sql | docker exec -i issuer-postgres psql -U postgres -d issuer_db

# Start backend lagi
docker-compose start backend
```

### Auto Backup (Scheduled)
Tambahkan di `docker-compose.yml` untuk auto-backup harian:
```yaml
# Uncomment line ini di docker-compose.yml:
# - ./backups:/backups

# Lalu setup cron job atau Task Scheduler
```

---

## 🔧 Troubleshooting

### Data hilang setelah restart?

**Kemungkinan Penyebab:**

1. **Volume dihapus dengan `-v` flag**
   ```powershell
   # ❌ JANGAN gunakan flag -v jika ingin keep data
   docker-compose down -v  # Ini akan HAPUS semua volume!
   
   # ✅ Gunakan ini untuk keep data
   docker-compose down
   ```

2. **Backend menggunakan in-memory fallback**
   - Check logs: `docker-compose logs backend`
   - Seharusnya muncul: "Database storage ENABLED"
   - Tidak boleh muncul: "fallback mode"

3. **Database tidak terkoneksi**
   ```powershell
   # Check database health
   docker-compose ps
   
   # postgres harus status "healthy"
   ```

### Cara Verify Data Tersimpan
```powershell
# 1. Check via logs
docker-compose logs backend | Select-String "PERMANENTLY stored"

# 2. Check via API
curl http://localhost:3001/api/credentials -H "x-api-key: your-api-key"

# 3. Check via database
docker exec -it issuer-postgres psql -U postgres -d issuer_db -c "SELECT COUNT(*) FROM credentials;"
```

---

## 📈 Statistik Database

Endpoint untuk monitoring:
```bash
GET http://localhost:3001/api/stats
Headers: x-api-key: your-api-key
```

Response:
```json
{
  "success": true,
  "statistics": {
    "total": 50,
    "active": 48,
    "revoked": 2,
    "expired": 0
  }
}
```

---

## ⚠️ PENTING - Cara Menghapus Data

Data **TIDAK akan otomatis terhapus**. Untuk menghapus:

### Hapus Data Tapi Keep Database
```powershell
# Via API (revoke credential)
curl -X POST http://localhost:3001/api/revoke/:credentialId \
  -H "x-api-key: your-api-key"

# Via database
docker exec -it issuer-postgres psql -U postgres -d issuer_db \
  -c "DELETE FROM credentials WHERE id='credential-id';"
```

### Hapus Semua Data (Reset Database)
```powershell
# Stop services
docker-compose down

# Hapus volume (HATI-HATI!)
docker volume rm issuer_postgres_data

# Start ulang (database kosong)
docker-compose up -d
```

---

## 🎯 Kesimpulan

✅ **DATA DIJAMIN PERSISTEN** - Tersimpan permanen di PostgreSQL  
✅ **TIDAK HILANG** saat refresh, restart, atau buka tab baru  
✅ **TERSIMPAN DI DOCKER VOLUME** - Bertahan sampai dihapus manual  
✅ **NO FALLBACK MODE** - Database wajib, tidak ada in-memory  
✅ **AUTO-RESTART** - Container otomatis restart jika crash  

Anda bisa dengan aman menutup browser atau restart service, **data akan tetap ada** saat dibuka kembali! 🎉
