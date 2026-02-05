/// <reference types="node" />
import { PrismaClient } from '@prisma/client'
import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding database...')

  // Create default admin user
  const defaultPassword = 'admin123'
  const passwordHash = await bcrypt.hash(defaultPassword, 12)

  await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      email: 'admin@bpjs.go.id',
      passwordHash,
      fullName: 'Admin BPJS',
      role: 'SUPER_ADMIN',
      isActive: true,
    },
  })

  console.log('✅ Created default admin user')
  console.log('   Username: admin')
  console.log('   Password: admin123')
  console.log('   ⚠️  Change this password in production!')

  // Create default API key for development
  const devApiKeyRaw = 'dev-api-key-for-testing-only'
  const devApiKeyHash = crypto.createHash('sha256').update(devApiKeyRaw).digest('hex')

  await prisma.apiKey.upsert({
    where: { keyHash: devApiKeyHash },
    update: {},
    create: {
      name: 'Development API Key',
      keyHash: devApiKeyHash,
      permissions: ['read', 'write', 'admin'],
      isActive: true,
    },
  })

  console.log('✅ Created development API key')
  console.log('   Key: dev-api-key-for-testing-only')
  console.log('   ⚠️  DO NOT use this in production!')

  // Create default issuer config
  const configs = [
    { key: 'issuer_name', value: 'BPJS Kesehatan', description: 'Nama Issuer' },
    { key: 'issuer_did_domain', value: 'localhost:3001', description: 'Domain untuk DID Web' },
    { key: 'credential_validity_days', value: '365', description: 'Validitas credential dalam hari' },
  ]

  for (const config of configs) {
    await prisma.issuerConfig.upsert({
      where: { key: config.key },
      update: { value: config.value },
      create: config,
    })
  }

  console.log('✅ Created default issuer configurations')

  console.log('\n🎉 Seeding completed!')
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
