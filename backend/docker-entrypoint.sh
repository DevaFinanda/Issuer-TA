#!/bin/sh
set -e

echo "🚀 Starting Backend Service..."

# Wait for database to be ready
echo "⏳ Waiting for database..."
until node -e "require('net').createConnection({host:'postgres',port:5432}).on('connect',()=>process.exit(0)).on('error',()=>process.exit(1))"; do
  echo "Database is unavailable - sleeping"
  sleep 2
done

echo "✅ Database is ready!"

# Run migrations
echo "🔄 Running database migrations..."
pnpm prisma migrate deploy

# Generate Prisma Client (if not already generated)
echo "🔄 Generating Prisma Client..."
pnpm prisma generate

# Optional: Seed database (uncomment if needed)
# echo "🌱 Seeding database..."
# pnpm db:seed

echo "✅ Backend setup complete!"
echo "🎉 Starting application..."

# Execute the main command
exec "$@"
