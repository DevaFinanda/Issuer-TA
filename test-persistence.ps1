# Script Test Data Persistence
# Verifikasi bahwa data tersimpan permanen di database

Write-Host "🧪 Testing Data Persistence..." -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

# Get API key from .env file
$apiKey = "your-secure-api-key-change-this"
if (Test-Path ".env") {
    $envContent = Get-Content .env -Raw
    if ($envContent -match 'API_KEY=(.+)') {
        $apiKey = $matches[1].Trim()
    }
}

$backendUrl = "http://localhost:3001"

# Test 1: Check Backend Health
Write-Host "Test 1: Backend Health Check" -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "$backendUrl/health" -Method Get
    Write-Host "✅ Backend is healthy" -ForegroundColor Green
    Write-Host "   Status: $($health.status)" -ForegroundColor Gray
    Write-Host "   DID: $($health.issuerDID)" -ForegroundColor Gray
} catch {
    Write-Host "❌ Backend is not responding" -ForegroundColor Red
    Write-Host "   Make sure Docker services are running: docker-compose ps" -ForegroundColor Yellow
    exit 1
}

Write-Host ""

# Test 2: Get All Credentials
Write-Host "Test 2: Query Database for Credentials" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$backendUrl/api/credentials" -Method Get -Headers @{
        "x-api-key" = $apiKey
    }
    
    $count = $response.count
    Write-Host "✅ Successfully queried database" -ForegroundColor Green
    Write-Host "   Total credentials stored: $count" -ForegroundColor Gray
    
    if ($count -eq 0) {
        Write-Host ""
        Write-Host "⚠️  Database is empty. Create some credentials first:" -ForegroundColor Yellow
        Write-Host "   1. Open http://localhost:3000" -ForegroundColor Gray
        Write-Host "   2. Go to Issuer page" -ForegroundColor Gray
        Write-Host "   3. Create a credential" -ForegroundColor Gray
        Write-Host "   4. Run this test again" -ForegroundColor Gray
    } else {
        Write-Host ""
        Write-Host "📊 Recent Credentials:" -ForegroundColor Cyan
        $response.credentials | Select-Object -First 5 | ForEach-Object {
            Write-Host "   - $($_.holderName) (BPJS: $($_.noBPJS))" -ForegroundColor White
            Write-Host "     ID: $($_.id)" -ForegroundColor Gray
            Write-Host "     Issued: $($_.issuedAt)" -ForegroundColor Gray
        }
    }
} catch {
    Write-Host "❌ Failed to query credentials" -ForegroundColor Red
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Gray
    Write-Host "   Check API key in .env file" -ForegroundColor Yellow
}

Write-Host ""

# Test 3: Database Statistics
Write-Host "Test 3: Database Statistics" -ForegroundColor Yellow
try {
    $stats = Invoke-RestMethod -Uri "$backendUrl/api/stats" -Method Get -Headers @{
        "x-api-key" = $apiKey
    }
    
    Write-Host "✅ Database statistics retrieved" -ForegroundColor Green
    Write-Host "   Active: $($stats.statistics.active)" -ForegroundColor Gray
    Write-Host "   Revoked: $($stats.statistics.revoked)" -ForegroundColor Gray
    Write-Host "   Expired: $($stats.statistics.expired)" -ForegroundColor Gray
    Write-Host "   Total: $($stats.statistics.total)" -ForegroundColor Gray
} catch {
    Write-Host "❌ Failed to get statistics" -ForegroundColor Red
}

Write-Host ""

# Test 4: Direct Database Check
Write-Host "Test 4: Direct Database Connection" -ForegroundColor Yellow
try {
    $dbCheck = docker exec issuer-postgres psql -U postgres -d issuer_db -t -c "SELECT COUNT(*) FROM credentials;" 2>$null
    if ($LASTEXITCODE -eq 0) {
        $dbCount = $dbCheck.Trim()
        Write-Host "✅ Direct database query successful" -ForegroundColor Green
        Write-Host "   Records in database: $dbCount" -ForegroundColor Gray
    } else {
        Write-Host "⚠️  Could not connect to database container" -ForegroundColor Yellow
    }
} catch {
    Write-Host "⚠️  Could not query database directly" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "================================" -ForegroundColor Cyan
Write-Host "🎯 Persistence Instructions:" -ForegroundColor Cyan
Write-Host ""
Write-Host "To test persistence:" -ForegroundColor White
Write-Host "1. Note the credential count above" -ForegroundColor Gray
Write-Host "2. Refresh your browser (F5)" -ForegroundColor Gray
Write-Host "3. Or restart Docker: docker-compose restart" -ForegroundColor Gray
Write-Host "4. Run this test again" -ForegroundColor Gray
Write-Host "5. Count should remain the same! ✅" -ForegroundColor Gray
Write-Host ""
Write-Host "Data persists in Docker volume: issuer_postgres_data" -ForegroundColor Yellow
Write-Host "View volume: docker volume inspect issuer_postgres_data" -ForegroundColor Gray
Write-Host ""
Write-Host "📖 See DATA-PERSISTENCE.md for full documentation" -ForegroundColor Cyan
Write-Host ""
