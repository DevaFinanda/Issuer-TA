import { prisma } from '../lib/prisma.js'

export interface RegistryIdentityInput {
  nik: string
  nama: string
  tanggalLahir?: string
  source?: string
  sourceRef?: string
  livenessPassed?: boolean
  isActive?: boolean
  rawData?: Record<string, unknown>
}

function normalizeNIK(nik: string): string {
  return String(nik || '').replace(/\D/g, '').trim()
}

function parseBirthDate(input?: string): Date | null {
  if (!input) return null
  const raw = input.trim()
  if (!raw) return null

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const value = new Date(raw)
    return Number.isNaN(value.getTime()) ? null : value
  }

  const localMatch = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (localMatch) {
    const [, dd, mm, yyyy] = localMatch
    const value = new Date(`${yyyy}-${mm}-${dd}`)
    return Number.isNaN(value.getTime()) ? null : value
  }

  const fallback = new Date(raw)
  return Number.isNaN(fallback.getTime()) ? null : fallback
}

export async function upsertTrustedRegistryIdentity(input: RegistryIdentityInput) {
  const nik = normalizeNIK(input.nik)
  if (!/^\d{16}$/.test(nik)) {
    throw new Error('Invalid NIK for registry identity')
  }

  const nama = String(input.nama || '').trim()
  if (nama.length < 2) {
    throw new Error('Invalid nama for registry identity')
  }

  const tanggalLahir = parseBirthDate(input.tanggalLahir)

  // NOTE: Keep runtime behavior while tolerating occasional stale Prisma TS cache in editor.
  return (prisma as any).trustedRegistryIdentity.upsert({
    where: { nik },
    update: {
      nama,
      tanggalLahir,
      source: input.source || 'PT21_IMPORT',
      sourceRef: input.sourceRef || null,
      livenessPassed: input.livenessPassed ?? null,
      isActive: input.isActive ?? true,
      rawData: (input.rawData as any) || undefined,
    },
    create: {
      nik,
      nama,
      tanggalLahir,
      source: input.source || 'PT21_IMPORT',
      sourceRef: input.sourceRef || null,
      livenessPassed: input.livenessPassed ?? null,
      isActive: input.isActive ?? true,
      rawData: (input.rawData as any) || undefined,
    },
  })
}

export async function importTrustedRegistryIdentities(records: RegistryIdentityInput[]) {
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error('records must be a non-empty array')
  }

  let imported = 0
  let failed = 0
  const errors: Array<{ index: number; nik?: string; message: string }> = []

  for (let i = 0; i < records.length; i++) {
    const item = records[i]
    try {
      await upsertTrustedRegistryIdentity(item)
      imported += 1
    } catch (error: any) {
      failed += 1
      errors.push({
        index: i,
        nik: item?.nik,
        message: error?.message || 'Unknown import error',
      })
    }
  }

  return {
    total: records.length,
    imported,
    failed,
    errors,
  }
}

export async function findTrustedRegistryIdentityByNIK(nik: string) {
  const normalized = normalizeNIK(nik)
  if (!normalized) return null

  return (prisma as any).trustedRegistryIdentity.findUnique({
    where: { nik: normalized },
  })
}

export async function upsertTrustedIssuer(input: {
  did: string
  name: string
  isActive?: boolean
  checkRevocation?: boolean
  minMatchScore?: number
  requiredClaims?: string[]
}) {
  const did = String(input.did || '').trim()
  const name = String(input.name || '').trim()

  if (!did.startsWith('did:')) {
    throw new Error('Trusted issuer DID must be a valid DID')
  }
  if (name.length < 2) {
    throw new Error('Trusted issuer name is required')
  }

  const requiredClaims = Array.isArray(input.requiredClaims)
    ? input.requiredClaims
      .map((claim) => String(claim || '').trim())
      .filter((claim) => claim.length > 0)
    : []

  const minMatchScore =
    typeof input.minMatchScore === 'number' && Number.isFinite(input.minMatchScore)
      ? Math.max(0, Math.min(1, input.minMatchScore))
      : 0.7

  return (prisma as any).trustedIssuer.upsert({
    where: { did },
    update: {
      name,
      isActive: input.isActive ?? true,
      checkRevocation: input.checkRevocation ?? false,
      minMatchScore,
      requiredClaims,
    },
    create: {
      did,
      name,
      isActive: input.isActive ?? true,
      checkRevocation: input.checkRevocation ?? false,
      minMatchScore,
      requiredClaims,
    },
  })
}

export async function getTrustedIssuerByDid(did: string) {
  return (prisma as any).trustedIssuer.findUnique({
    where: { did },
  })
}

export async function listTrustedIssuers() {
  return (prisma as any).trustedIssuer.findMany({
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
  })
}
