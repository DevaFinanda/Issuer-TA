/// <reference types="node" />
import { PrismaClient } from '@prisma/client'
import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding database...')

  // ============================================
  // 1. Create default admin user
  // ============================================
  const adminPassword = 'admin123'
  const adminHash = await bcrypt.hash(adminPassword, 12)

  await prisma.user.upsert({
    where: { email: 'admin@issuer.example.com' },
    update: {},
    create: {
      username: 'admin',
      email: 'admin@issuer.example.com',
      passwordHash: adminHash,
      fullName: 'Admin Issuer',
      userType: 'ADMIN',
      role: 'SUPER_ADMIN',
      isActive: true,
    },
  })

  console.log('✅ Created default admin user')
  console.log('   Username: admin')
  console.log('   Password: admin123')
  console.log('   ⚠️  Change this password in production!')

  // ============================================
  // 2. Create sample holder user (for testing)
  // ============================================
  const holderPassword = 'holder123'
  const holderHash = await bcrypt.hash(holderPassword, 12)

  await prisma.user.upsert({
    where: { email: 'budi@example.com' },
    update: {},
    create: {
      email: 'budi@example.com',
      passwordHash: holderHash,
      fullName: 'Budi Santoso',
      nik: '3201234567890001',
      nama: 'Budi Santoso',
      tanggalLahir: new Date('1999-01-01'),
      userType: 'HOLDER',
      role: 'OPERATOR', // Holders use OPERATOR role
      isActive: true,
    },
  })

  console.log('✅ Created sample holder user')
  console.log('   NIK: 3201234567890001')
  console.log('   Nama: Budi Santoso')
  console.log('   Password: holder123')

  // Create second holder for testing
  const holder2Hash = await bcrypt.hash('holder456', 12)

  await prisma.user.upsert({
    where: { email: 'siti@example.com' },
    update: {},
    create: {
      email: 'siti@example.com',
      passwordHash: holder2Hash,
      fullName: 'Siti Aminah',
      nik: '3201234567890002',
      nama: 'Siti Aminah',
      tanggalLahir: new Date('1995-05-15'),
      userType: 'HOLDER',
      role: 'OPERATOR',
      isActive: true,
    },
  })

  console.log('✅ Created second holder user')
  console.log('   NIK: 3201234567890002')
  console.log('   Nama: Siti Aminah')
  console.log('   Password: holder456')

  // ============================================
  // 3. Create default API key for development
  // ============================================
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

  // ============================================
  // 4. Create default issuer config
  // ============================================
  const configs = [
    { key: 'issuer_name', value: 'Identity Credential Issuer', description: 'Nama Issuer' },
    { key: 'issuer_did_domain', value: 'localhost:3001', description: 'Domain untuk DID' },
    { key: 'credential_validity_days', value: '365', description: 'Validitas credential dalam hari' },
    { key: 'credential_format', value: 'jwt_vc_json', description: 'Format credential yang didukung' },
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
