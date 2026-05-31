import fs from 'fs'
import path from 'path'
import { disconnectDatabase } from '../lib/prisma.js'
import { findTrustedRegistryIdentityByNIK } from '../services/registry.service.js'
import { findUserByNIK } from '../services/user.service.js'

interface CheckItem {
  nik: string
}

function normalizeNIK(value: string): string {
  return String(value || '').replace(/\D/g, '').trim()
}

function parseInputArg(rawArg: string): CheckItem[] {
  const resolvedPath = path.resolve(process.cwd(), rawArg)

  if (fs.existsSync(resolvedPath)) {
    const content = fs.readFileSync(resolvedPath, 'utf-8')
    return content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => {
        // Accept plain NIK per line, or CSV line where NIK is first column.
        const firstToken = line.split(',')[0]?.trim() || ''
        return { nik: normalizeNIK(firstToken) }
      })
      .filter((item) => item.nik.length > 0)
  }

  return rawArg
    .split(',')
    .map((token) => normalizeNIK(token))
    .filter((nik) => nik.length > 0)
    .map((nik) => ({ nik }))
}

function toDateOnly(value?: Date | null): string {
  if (!value) return '-'
  if (!(value instanceof Date)) return '-'
  if (Number.isNaN(value.getTime())) return '-'
  return value.toISOString().slice(0, 10)
}

function normalizeName(value: string | null | undefined): string {
  return String(value || '').trim().toLowerCase()
}

function compareUserRegistryProfile(input: {
  userNama?: string | null
  userTanggalLahir?: Date | null
  registryNama: string
  registryTanggalLahir?: Date | null
}): 'PASS' | 'FAIL' | 'N/A' {
  if (!input.userNama && !input.userTanggalLahir) {
    return 'N/A'
  }

  const nameOk = normalizeName(input.userNama) === normalizeName(input.registryNama)
  const userDob = toDateOnly(input.userTanggalLahir)
  const registryDob = toDateOnly(input.registryTanggalLahir)
  const dobComparable = userDob !== '-' && registryDob !== '-'
  const dobOk = dobComparable ? userDob === registryDob : true

  return nameOk && dobOk ? 'PASS' : 'FAIL'
}

async function main() {
  const arg = process.argv[2]
  if (!arg) {
    throw new Error('Usage: pnpm registry:check -- <nik1,nik2,... | path-to-txt-or-csv>')
  }

  const samples = parseInputArg(arg)
  if (samples.length === 0) {
    throw new Error('No valid NIK sample found in input')
  }

  let pass = 0
  let fail = 0

  console.log('NIK_MATCH_RESULT')
  console.log('nik,status,active,registry_nama,registry_tanggal_lahir,user_found,profile_match')

  for (const sample of samples) {
    const nik = normalizeNIK(sample.nik)

    if (!/^\d{16}$/.test(nik)) {
      fail += 1
      console.log(`${nik || '-'},FAIL,-,-,-,N/A,N/A`)
      continue
    }

    const registryIdentity = await findTrustedRegistryIdentityByNIK(nik)
    const user = await findUserByNIK(nik)

    const active = registryIdentity?.isActive === true
    const status = registryIdentity && active ? 'PASS' : 'FAIL'

    if (status === 'PASS') {
      pass += 1
    } else {
      fail += 1
    }

    const profileMatch = registryIdentity
      ? compareUserRegistryProfile({
          userNama: user?.nama || user?.fullName,
          userTanggalLahir: user?.tanggalLahir || null,
          registryNama: registryIdentity.nama,
          registryTanggalLahir: registryIdentity.tanggalLahir || null,
        })
      : 'N/A'

    const userFound = user ? 'YES' : 'NO'

    console.log(
      [
        nik,
        status,
        active ? 'YES' : 'NO',
        registryIdentity?.nama || '-',
        toDateOnly(registryIdentity?.tanggalLahir || null),
        userFound,
        profileMatch,
      ].join(','),
    )
  }

  console.log('\nSUMMARY')
  console.log(`total=${samples.length}`)
  console.log(`pass=${pass}`)
  console.log(`fail=${fail}`)

  if (fail > 0) {
    process.exitCode = 2
  }
}

main()
  .catch((error: Error) => {
    console.error('❌ Registry matching check failed:', error.message)
    process.exitCode = 1
  })
  .finally(async () => {
    await disconnectDatabase()
  })
