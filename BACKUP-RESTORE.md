# Database Backup & Restore Scripts

## Backup Database

### Full Backup
```powershell
# Create backup with timestamp
docker exec issuer-postgres pg_dump -U postgres issuer_db > "backup_$(Get-Date -Format 'yyyyMMdd_HHmmss').sql"

# Compressed backup
docker exec issuer-postgres pg_dump -U postgres issuer_db | gzip > "backup_$(Get-Date -Format 'yyyyMMdd_HHmmss').sql.gz"
```

### Credentials Only
```powershell
# Backup hanya tabel credentials
docker exec issuer-postgres pg_dump -U postgres -t credentials issuer_db > "credentials_backup_$(Get-Date -Format 'yyyyMMdd_HHmmss').sql"
```

## Restore Database

### From Full Backup
```powershell
# Stop backend untuk avoid conflicts
docker-compose stop backend

# Restore
Get-Content backup_20260209_120000.sql | docker exec -i issuer-postgres psql -U postgres -d issuer_db

# Start backend
docker-compose start backend
```

### From Compressed Backup
```powershell
docker-compose stop backend

# Decompress and restore
gunzip -c backup_20260209_120000.sql.gz | docker exec -i issuer-postgres psql -U postgres -d issuer_db

docker-compose start backend
```

## Scheduled Backup

### Windows Task Scheduler
1. Open Task Scheduler
2. Create Basic Task
3. Trigger: Daily at 2:00 AM
4. Action: Start a program
   - Program: `powershell.exe`
   - Arguments: `-File "E:\Tugas Akhir\Program\Issuer\scripts\backup-db.ps1"`

### Backup Script (scripts/backup-db.ps1)
```powershell
$backupDir = "E:\Tugas Akhir\Program\Issuer\backups"
$timestamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$backupFile = "$backupDir\backup_$timestamp.sql.gz"

# Create backup
docker exec issuer-postgres pg_dump -U postgres issuer_db | gzip > $backupFile

# Keep only last 7 days
Get-ChildItem $backupDir -Filter "backup_*.sql.gz" | 
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-7) } | 
    Remove-Item

Write-Host "✅ Backup created: $backupFile"
```

## Export Data Only (CSV)

### Export Credentials to CSV
```powershell
docker exec issuer-postgres psql -U postgres -d issuer_db -c "\COPY (SELECT id, \"holderName\", \"noBPJS\", nik, \"documentType\", status, \"issuedAt\" FROM credentials ORDER BY \"issuedAt\" DESC) TO STDOUT WITH CSV HEADER" > credentials_export.csv
```

## View Database Info

### Connection Info
```powershell
docker exec -it issuer-postgres psql -U postgres -d issuer_db
```

### Useful SQL Commands
```sql
-- List all tables
\dt

-- Count records
SELECT COUNT(*) FROM credentials;

-- Recent credentials
SELECT id, "holderName", "noBPJS", status, "issuedAt" 
FROM credentials 
ORDER BY "issuedAt" DESC 
LIMIT 10;

-- Database size
SELECT pg_database_size('issuer_db');

-- Exit
\q
```

## Notes

- Backups are stored as plain SQL files
- Compressed backups save disk space (~10x smaller)
- Always stop backend before restore to prevent conflicts
- Test restore on a separate instance first
- Keep multiple backup copies in different locations
