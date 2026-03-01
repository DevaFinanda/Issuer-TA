#!/bin/bash
# ================================================
# FIX STANDALONE FRONTEND - Run on VPS
# ================================================
# Jalankan script ini jika frontend standalone mengembalikan 404
# Biasanya karena static files belum di-copy ke standalone directory
#
# Usage: bash fix-standalone.sh
# ================================================
set -e

export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$HOME/.local/share/pnpm:$HOME/.npm-global/bin:/usr/local/bin:$PATH"

cd ~/frontend

echo '================================================'
echo '  FIX: Next.js Standalone Frontend'
echo '================================================'

# ===== Step 1: Verify standalone build exists =====
if [ ! -d .next/standalone ]; then
  echo '❌ .next/standalone tidak ditemukan!'
  echo '   Jalankan: NODE_OPTIONS="--max-old-space-size=1024" npx next build'
  exit 1
fi

if [ ! -f .next/standalone/server.js ]; then
  echo '❌ .next/standalone/server.js tidak ditemukan!'
  exit 1
fi

echo '✅ .next/standalone/server.js ditemukan'

# ===== Step 2: Copy static assets =====
echo ''
echo '[1/4] Copy .next/static ke standalone...'
if [ -d .next/static ]; then
  mkdir -p .next/standalone/.next
  cp -r .next/static .next/standalone/.next/static
  echo '  ✅ .next/static -> .next/standalone/.next/static'
else
  echo '  ⚠️ .next/static tidak ada!'
fi

echo '[2/4] Copy public/ ke standalone...'
if [ -d public ]; then
  cp -r public .next/standalone/public
  echo '  ✅ public/ -> .next/standalone/public'
else
  echo '  ⚠️ public/ tidak ada (mungkin tidak dibutuhkan)'
fi

echo '[3/4] Copy .env.local ke standalone...'
if [ -f .env.local ]; then
  cp .env.local .next/standalone/.env.local
  echo '  ✅ .env.local -> .next/standalone/.env.local'
  echo '  Contents:'
  cat .env.local | grep -v KEY | head -5
else
  echo '  ⚠️ .env.local tidak ada!'
  echo '  Buat dulu: cp .env.vps .env.local'
  if [ -f .env.vps ]; then
    cp .env.vps .env.local
    cp .env.local .next/standalone/.env.local
    echo '  ✅ Auto-copied dari .env.vps'
  fi
fi

# ===== Step 3: Restart PM2 =====
echo ''
echo '[4/4] Restart PM2 frontend...'
pm2 stop issuer-frontend 2>/dev/null || true
pm2 delete issuer-frontend 2>/dev/null || true

# Start with correct env vars
PORT=3000 HOSTNAME=0.0.0.0 pm2 start .next/standalone/server.js \
  --name issuer-frontend \
  --cwd ~/frontend

pm2 save
echo ''
echo '✅ Frontend standalone started!'
echo ''

# ===== Step 4: Verify =====
sleep 3
echo '--- PM2 Status ---'
pm2 show issuer-frontend 2>&1 | grep -E 'status|restarts|uptime|pid'
echo ''

echo '--- Health Check ---'
curl -s -o /dev/null -w "HTTP Status: %{http_code}\n" http://localhost:3000/ 2>/dev/null || echo 'curl failed'
echo ''

echo '--- PM2 Logs (last 10 lines) ---'
pm2 logs issuer-frontend --lines 10 --nostream 2>&1
echo ''
echo '================================================'
echo '  DONE! Cek: http://202.155.132.71:3000'
echo '================================================'
