# 🎯 BPJS Issuer - Complete Docker Solution

Project ini sekarang **FULLY DOCKERIZED** dan **DATA PERSISTENT**!

## 🚀 Quick Start

### Automatic Setup (Recommended)
```powershell
.\docker-setup.ps1
```

Script akan:
- ✅ Generate secure keys
- ✅ Setup environment (.env)
- ✅ Build dan start semua services
- ✅ Ready dalam 1-2 menit!

### Manual Setup
```powershell
# 1. Setup environment
Copy-Item .env.docker .env

# 2. Start services
docker-compose up -d

# 3. Access
# Frontend: http://localhost:3000
# Backend:  http://localhost:3001
```

## 🔒 Data Persistence

**GUARANTEED**: Semua data tersimpan permanen di PostgreSQL!

✅ Data tetap ada saat:
- Refresh browser
- Buka tab baru
- Restart services
- Restart komputer

📖 **Full docs**: [DATA-PERSISTENCE.md](DATA-PERSISTENCE.md)
🧪 **Test**: `.\test-persistence.ps1`

## 📂 Quick Links

- [🐳 Docker Setup Guide](DOCKER-README.md) - Complete Docker documentation
- [🔒 Data Persistence](DATA-PERSISTENCE.md) - How data is saved permanently
- [⚡ Quick Start](QUICK-START.md) - Fastest way to get started

## 🏗️ Architecture

```
┌─────────────────┐
│   Frontend      │ ← Next.js (Port 3000)
│   (Next.js)     │
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│   Backend       │ ← Express API (Port 3001)
│   (Express)     │
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│   PostgreSQL    │ ← Database (Port 5432)
│   + Volume      │    📦 Persistent Storage
└─────────────────┘
```

## 📊 What's Included

- ✅ PostgreSQL 16 with persistent storage
- ✅ Express.js backend with Prisma ORM
- ✅ Next.js 14 frontend
- ✅ Auto migrations on startup
- ✅ Health checks for all services
- ✅ Security (API keys, rate limiting)
- ✅ Development & production ready

## 🛠️ Management

```powershell
# View logs
docker-compose logs -f

# Stop services
docker-compose down

# Restart service
docker-compose restart backend

# View status
docker-compose ps

# Test persistence
.\test-persistence.ps1
```

## 📝 Files Created

### Docker Files
- `docker-compose.yml` - Service orchestration
- `backend/Dockerfile` - Backend container
- `frontend/Dockerfile` - Frontend container
- `backend/docker-entrypoint.sh` - Startup script
- `.dockerignore` files - Optimize builds

### Configuration
- `.env.docker` - Environment template
- `.env` - Your local config (created by setup script)

### Documentation
- `DOCKER-README.md` - Complete Docker guide
- `DATA-PERSISTENCE.md` - Persistence documentation
- `QUICK-START.md` - Fastest setup method

### Scripts
- `docker-setup.ps1` - Automated setup script
- `test-persistence.ps1` - Test data persistence

## 🎓 Usage in Docker Desktop

1. **Open Docker Desktop**
2. **Find your project** in the Containers section
3. **Click ▶️ Play button** on the compose
4. **Wait** for all services to be healthy (green)
5. **Open** http://localhost:3000

All data will be saved permanently in the database! 💾

## 💡 Tips

- First build takes 3-5 minutes (downloads dependencies)
- Subsequent starts are much faster (~30 seconds)
- Database data persists in Docker volume `issuer_postgres_data`
- Never use `docker-compose down -v` unless you want to delete all data
- Check health status in Docker Desktop or `docker-compose ps`

## 🐛 Troubleshooting

Common issues and solutions in [DOCKER-README.md](DOCKER-README.md#troubleshooting)

## 📈 Next Steps

After successful setup:
1. Access frontend: http://localhost:3000
2. Navigate to Issuer page
3. Create a credential
4. Test persistence: `.\test-persistence.ps1`
5. Verify data persists after refresh/restart

---

**Ready to deploy?** Just click Play in Docker Desktop! 🎉
