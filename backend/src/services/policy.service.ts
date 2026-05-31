import { OnboardingStatus, prisma } from '../lib/prisma.js'
import {
  findTrustedRegistryIdentityByNIK,
  getTrustedIssuerByDid,
} from './registry.service.js'

interface IssuanceEvidenceInput {
  liveness_pass?: boolean
}

interface PolicyUser {
  id: string
  nik: string | null
  nama: string | null
  fullName: string
  tanggalLahir: Date | null
  onboardingStatus?: string | null
}

interface PolicyCheckResult {
  key: string
  passed: boolean
  detail?: string
}

export interface IssuancePolicyResult {
  allowed: boolean
  reasonCodes: string[]
  score: number
  checks: PolicyCheckResult[]
}

function normalizeText(value: string | null | undefined): string {
  return String(value || '').trim().toLowerCase()
}

function toIsoDate(value: Date | string | null | undefined): string {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}

function getPolicyThreshold(): number {
  const raw = Number(process.env.POLICY_REGISTRY_MATCH_THRESHOLD || '0.7')
  if (!Number.isFinite(raw)) return 0.7
  return Math.max(0, Math.min(1, raw))
}

function isLivenessRequired(): boolean {
  return String(process.env.POLICY_REQUIRE_LIVENESS || 'false').toLowerCase() === 'true'
}

function allowNikOnlyRegistryMatch(): boolean {
  const raw = String(process.env.POLICY_ALLOW_NIK_ONLY || 'true').trim().toLowerCase()
  return raw !== 'false'
}

function calculateRegistryMatchScore(input: {
  userNama: string
  userTanggalLahir?: string
  registryNama: string
  registryTanggalLahir?: string
}): number {
  let score = 0.5 // NIK match is a hard prerequisite to reach this function.

  if (normalizeText(input.userNama) === normalizeText(input.registryNama)) {
    score += 0.3
  }

  if (input.userTanggalLahir && input.registryTanggalLahir) {
    if (input.userTanggalLahir === input.registryTanggalLahir) {
      score += 0.2
    }
  }

  return Math.min(1, score)
}

export async function evaluateIssuancePolicy(input: {
  user: PolicyUser
  holderDid: string
  evidence?: IssuanceEvidenceInput
}): Promise<IssuancePolicyResult> {
  const checks: PolicyCheckResult[] = []
  const reasonCodes: string[] = []

  const nik = String(input.user.nik || '').trim()
  const nikValid = /^\d{16}$/.test(nik)
  checks.push({ key: 'nik_valid', passed: nikValid })
  if (!nikValid) reasonCodes.push('nik_invalid')

  const holderDidValid = String(input.holderDid || '').startsWith('did:')
  checks.push({ key: 'holder_did_valid', passed: holderDidValid })
  if (!holderDidValid) reasonCodes.push('holder_did_invalid')

  const onboardingStatus = input.user.onboardingStatus || null
  const onboardingVerified = onboardingStatus === OnboardingStatus.VERIFIED
  checks.push({
    key: 'onboarding_verified',
    passed: onboardingVerified,
    detail: String(onboardingStatus),
  })
  if (!onboardingVerified) reasonCodes.push('onboarding_not_verified')

  const livenessRequired = isLivenessRequired()
  const livenessPassed = input.evidence?.liveness_pass === true
  checks.push({ key: 'liveness_pass', passed: !livenessRequired || livenessPassed })
  if (livenessRequired && !livenessPassed) {
    reasonCodes.push('liveness_required')
  }

  const registryIdentity = nikValid ? await findTrustedRegistryIdentityByNIK(nik) : null
  const registryFound = Boolean(registryIdentity?.isActive)
  checks.push({ key: 'registry_found', passed: registryFound })
  if (!registryFound) {
    reasonCodes.push('registry_not_found')
  }

  let score = 0
  if (registryIdentity?.isActive) {
    score = calculateRegistryMatchScore({
      userNama: input.user.nama || input.user.fullName,
      userTanggalLahir: toIsoDate(input.user.tanggalLahir),
      registryNama: registryIdentity.nama,
      registryTanggalLahir: toIsoDate(registryIdentity.tanggalLahir),
    })
  }

  const threshold = getPolicyThreshold()
  const nikOnlyAllowed = allowNikOnlyRegistryMatch()
  const nikOnlyPass = nikOnlyAllowed && registryFound && nikValid
  const thresholdPassed = nikOnlyPass || score >= threshold
  checks.push({
    key: 'registry_match_threshold',
    passed: thresholdPassed,
    detail: `score=${score.toFixed(2)} threshold=${threshold.toFixed(2)} nik_only=${nikOnlyPass}`,
  })
  if (!thresholdPassed) {
    reasonCodes.push('registry_match_below_threshold')
  }

  const allowed = reasonCodes.length === 0

  await (prisma as any).policyDecision.create({
    data: {
      userId: input.user.id,
      holderDid: input.holderDid,
      allowed,
      reasonCodes,
      score,
      details: {
        checks,
        threshold,
      } as any,
    },
  })

  return {
    allowed,
    reasonCodes,
    score,
    checks,
  }
}

export async function verifyTrustedPresentedVc(input: {
  presentedPayload: Record<string, unknown>
}): Promise<{ trusted: boolean; reason?: string }> {
  const vc = (input.presentedPayload.vc || {}) as Record<string, unknown>
  const issuerDid = String(vc.issuer || input.presentedPayload.iss || '').trim()

  if (!issuerDid || !issuerDid.startsWith('did:')) {
    return { trusted: false, reason: 'missing_vc_issuer_did' }
  }

  const trustedIssuer = await getTrustedIssuerByDid(issuerDid)
  if (!trustedIssuer || !trustedIssuer.isActive) {
    return { trusted: false, reason: 'issuer_not_in_trust_list' }
  }

  const credentialSubject = (vc.credentialSubject || {}) as Record<string, unknown>
  for (const claim of trustedIssuer.requiredClaims) {
    const claimValue = credentialSubject[claim]
    if (claimValue === undefined || claimValue === null || String(claimValue).trim() === '') {
      return { trusted: false, reason: `required_claim_missing:${claim}` }
    }
  }

  if (trustedIssuer.checkRevocation) {
    const credentialStatus = (vc.credentialStatus || {}) as Record<string, unknown>
    const statusId = String(credentialStatus.id || '').trim()
    if (!statusId) {
      return { trusted: false, reason: 'revocation_check_enabled_but_status_missing' }
    }
  }

  return { trusted: true }
}
