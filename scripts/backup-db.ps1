# Automated Database Backup Script
# Save this and schedule via Task Scheduler

# Configuration
$projectRoot = Split-Path -Parent $PSScriptRoot
$backupDir = Join-Path $projectRoot "backups"
$timestamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$backupFile = Join-Path $backupDir "backup_$timestamp.sql.gz"
$retentionDays = 7

# Create backup directory if not exists
if (-not (Test-Path $backupDir)) {
    New-Item -ItemType Directory -Path $backupDir | Out-Null
}

Write-Host "🔄 Starting database backup..." -ForegroundColor Cyan
Write-Host "Time: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Gray
Write-Host ""

# Check if Docker container is running
try {
    $containerStatus = docker inspect -f '{{.State.Running}}' issuer-postgres 2>$null
    if ($containerStatus -ne "true") {
        Write-Host "❌ PostgreSQL container is not running" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "❌ Cannot access Docker container" -ForegroundColor Red
    exit 1
}

# Create backup
Write-Host "📦 Creating compressed backup..." -ForegroundColor Yellow
try {
    docker exec issuer-postgres pg_dump -U postgres issuer_db | gzip > $backupFile
    
    if (Test-Path $backupFile) {
        $size = (Get-Item $backupFile).Length / 1KB
        Write-Host "✅ Backup created successfully" -ForegroundColor Green
        Write-Host "   File: $backupFile" -ForegroundColor Gray
        Write-Host "   Size: $([math]::Round($size, 2)) KB" -ForegroundColor Gray
    } else {
        Write-Host "❌ Backup file not created" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "❌ Backup failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Clean old backups
Write-Host "🧹 Cleaning old backups (keeping last $retentionDays days)..." -ForegroundColor Yellow
$deleted = 0
Get-ChildItem $backupDir -Filter "backup_*.sql.gz" | 
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$retentionDays) } | 
    ForEach-Object {
        Remove-Item $_.FullName
        Write-Host "   Deleted: $($_.Name)" -ForegroundColor Gray
        $deleted++
    }

if ($deleted -eq 0) {
    Write-Host "   No old backups to delete" -ForegroundColor Gray
} else {
    Write-Host "   Deleted $deleted old backup(s)" -ForegroundColor Gray
}

Write-Host ""
Write-Host "✅ Backup completed successfully!" -ForegroundColor Green
Write-Host ""

# Summary
Write-Host "📊 Backup Summary:" -ForegroundColor Cyan
$backups = Get-ChildItem $backupDir -Filter "backup_*.sql.gz" | Sort-Object LastWriteTime -Descending
$totalSize = ($backups | Measure-Object -Property Length -Sum).Sum / 1MB
Write-Host "   Total backups: $($backups.Count)" -ForegroundColor Gray
Write-Host "   Total size: $([math]::Round($totalSize, 2)) MB" -ForegroundColor Gray
Write-Host "   Latest: $($backups[0].Name)" -ForegroundColor Gray
Write-Host ""
