# =============================================================
# deploy.ps1 - Deploy Issuer ke VPS dari local Windows
# Usage:
#   .\deploy.ps1              → deploy frontend + backend
#   .\deploy.ps1 frontend     → deploy frontend saja
#   .\deploy.ps1 backend      → deploy backend saja
# =============================================================

param(
    [string]$Target = "all"
)

$SSH_KEY  = "E:\Nevacloud\SSH\deva"
$VPS_USER = "root"
$VPS_HOST = "202.155.132.71"
$VPS_FRONTEND = "/root/frontend"
$VPS_BACKEND  = "/root/backend"

function Write-Step($msg) {
    Write-Host "`n>>> $msg" -ForegroundColor Cyan
}

function SSH($cmd) {
    ssh -i $SSH_KEY "${VPS_USER}@${VPS_HOST}" $cmd
    if ($LASTEXITCODE -ne 0) { throw "SSH command failed: $cmd" }
}

function SCP-Dir($local, $remote) {
    scp -i $SSH_KEY -r $local "${VPS_USER}@${VPS_HOST}:${remote}"
    if ($LASTEXITCODE -ne 0) { throw "SCP failed: $local -> $remote" }
}

function Deploy-Frontend {
    Write-Step "Upload source frontend ke VPS..."
    # Exclude node_modules dan .next agar cepat
    $exclude = @("node_modules", ".next", ".env.local", "pnpm-lock.yaml")
    $excludeArgs = $exclude | ForEach-Object { "--exclude=$_" }
    rsync -avz -e "ssh -i '$SSH_KEY'" $excludeArgs `
        "$(Resolve-Path 'frontend')/" `
        "${VPS_USER}@${VPS_HOST}:${VPS_FRONTEND}/"

    Write-Step "Build & deploy frontend di VPS..."
    SSH "bash /root/deploy-issuer.sh frontend"
}

function Deploy-Backend {
    Write-Step "Upload source backend ke VPS..."
    $exclude = @("node_modules", "dist", ".env")
    $excludeArgs = $exclude | ForEach-Object { "--exclude=$_" }
    rsync -avz -e "ssh -i '$SSH_KEY'" $excludeArgs `
        "$(Resolve-Path 'backend')/" `
        "${VPS_USER}@${VPS_HOST}:${VPS_BACKEND}/"

    Write-Step "Build & deploy backend di VPS..."
    SSH "bash /root/deploy-issuer.sh backend"
}

Write-Host "========================================" -ForegroundColor Green
Write-Host " ISSUER DEPLOY SCRIPT" -ForegroundColor Green
Write-Host " Target: $Target" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green

try {
    switch ($Target.ToLower()) {
        "frontend" { Deploy-Frontend }
        "backend"  { Deploy-Backend }
        "all"      { Deploy-Backend; Deploy-Frontend }
        default    { Write-Host "Usage: .\deploy.ps1 [frontend|backend|all]"; exit 1 }
    }
    Write-Host "`n Deploy berhasil!" -ForegroundColor Green
} catch {
    Write-Host "`n Deploy gagal: $_" -ForegroundColor Red
    exit 1
}
