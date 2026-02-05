#!/bin/bash
# Quick Setup untuk VPS - Linux/Mac
# Usage: ./quick-setup.sh VPS_IP DB_PASSWORD

set -e

VPS_IP=$1
DB_PASSWORD=$2

if [ -z "$VPS_IP" ] || [ -z "$DB_PASSWORD" ]; then
    echo "Usage: ./quick-setup.sh VPS_IP DB_PASSWORD"
    exit 1
fi

echo "=== Setup PostgreSQL di VPS ==="
echo ""

# 1. Upload scripts
echo "[1/5] Upload scripts..."
scp scripts/vps-setup.sh root@$VPS_IP:~/
scp scripts/security-hardening.sh root@$VPS_IP:~/
echo "✓ Uploaded"
echo ""

# 2. Get laptop IP
LAPTOP_IP=$(curl -s https://api.ipify.org)
echo "Laptop IP: $LAPTOP_IP"
echo ""

# 3. Run setup
echo "[2/5] Install PostgreSQL..."
ssh root@$VPS_IP "chmod +x ~/vps-setup.sh && echo -e '$LAPTOP_IP\n$DB_PASSWORD\ny' | ~/vps-setup.sh"
echo "✓ Installed"
echo ""

# 4. Update .env
echo "[3/5] Update .env..."
cat > .env << EOF
DATABASE_URL="postgresql://issuer_user:${DB_PASSWORD}@${VPS_IP}:5432/issuer_db?schema=public&sslmode=require"
PORT=3000
NODE_ENV=production
EOF
echo "✓ Updated"
echo ""

# 5. Test connection
echo "[4/5] Test connection..."
pnpm test:connection
echo ""

# 6. Push schema
echo "[5/5] Push schema..."
pnpm prisma generate
pnpm prisma db push --accept-data-loss
echo "✓ Done"
echo ""

echo "=== SETUP SELESAI ==="
echo ""
echo "pgAdmin Setup:"
echo "  Host    : $VPS_IP"
echo "  Port    : 5432"
echo "  Database: issuer_db"
echo "  User    : issuer_user"
echo "  Password: $DB_PASSWORD"
echo ""
