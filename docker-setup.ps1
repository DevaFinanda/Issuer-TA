# Docker Setup Script untuk BPJS Issuer
# Jalankan dengan: .\docker-setup.ps1

Write-Host "🐳 BPJS Issuer - Docker Setup" -ForegroundColor Cyan
Write-Host "=============================" -ForegroundColor Cyan
Write-Host ""

# Check if Docker is running
Write-Host "🔍 Checking Docker..." -ForegroundColor Yellow
try {
    docker version | Out-Null
    Write-Host "✅ Docker is running" -ForegroundColor Green
} catch {
    Write-Host "❌ Docker is not running. Please start Docker Desktop first." -ForegroundColor Red
    exit 1
}

Write-Host ""

# Check if .env exists
if (Test-Path ".env") {
    Write-Host "⚠️  File .env sudah ada." -ForegroundColor Yellow
    $response = Read-Host "Apakah ingin overwrite dengan .env.docker? (y/N)"
    if ($response -eq "y" -or $response -eq "Y") {
        Copy-Item .env.docker .env -Force
        Write-Host "✅ File .env berhasil di-update" -ForegroundColor Green
    } else {
        Write-Host "➡️  Menggunakan .env yang ada" -ForegroundColor Cyan
    }
} else {
    Copy-Item .env.docker .env
    Write-Host "✅ File .env berhasil dibuat dari .env.docker" -ForegroundColor Green
}

Write-Host ""
Write-Host "🔐 Generating secure keys..." -ForegroundColor Yellow

# Generate keys
$privateKey = -join ((1..64) | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) })
$apiKey = -join ((1..64) | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) })
$sessionSecret = -join ((1..128) | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) })

# Update .env file
$envContent = Get-Content .env -Raw
$envContent = $envContent -replace 'ISSUER_PRIVATE_KEY=.*', "ISSUER_PRIVATE_KEY=$privateKey"
$envContent = $envContent -replace 'API_KEY=.*', "API_KEY=$apiKey"
$envContent = $envContent -replace 'SESSION_SECRET=.*', "SESSION_SECRET=$sessionSecret"
$envContent | Set-Content .env -NoNewline

Write-Host "✅ Secure keys generated and saved to .env" -ForegroundColor Green
Write-Host ""

# Ask if user wants to start services
$start = Read-Host "🚀 Start Docker services sekarang? (Y/n)"
if ($start -eq "" -or $start -eq "y" -or $start -eq "Y") {
    Write-Host ""
    Write-Host "🏗️  Building and starting services..." -ForegroundColor Yellow
    docker-compose up -d --build
    
    Write-Host ""
    Write-Host "⏳ Menunggu services ready..." -ForegroundColor Yellow
    Start-Sleep -Seconds 10
    
    Write-Host ""
    Write-Host "✅ Setup Complete!" -ForegroundColor Green
    Write-Host ""
    Write-Host "🌐 Services:" -ForegroundColor Cyan
    Write-Host "   Frontend:  http://localhost:3000" -ForegroundColor White
    Write-Host "   Backend:   http://localhost:3001" -ForegroundColor White
    Write-Host "   Database:  localhost:5432" -ForegroundColor White
    Write-Host ""
    Write-Host "📊 Melihat logs:" -ForegroundColor Cyan
    Write-Host "   docker-compose logs -f" -ForegroundColor White
    Write-Host ""
    Write-Host "🛑 Stop services:" -ForegroundColor Cyan
    Write-Host "   docker-compose down" -ForegroundColor White
    Write-Host ""
    Write-Host "📖 Lihat DOCKER-README.md untuk dokumentasi lengkap" -ForegroundColor Yellow
} else {
    Write-Host ""
    Write-Host "ℹ️  Setup selesai. Jalankan 'docker-compose up -d' untuk start services" -ForegroundColor Cyan
}

Write-Host ""
