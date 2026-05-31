/**
 * Credential Controller — OID4VCI Credential Issuance
 * 
 * Implements: POST /credential
 * 
 * The wallet calls this endpoint with a Bearer access token
 * to request the actual Verifiable Credential.
 */

import { Request, Response } from 'express'
import crypto from 'crypto'
import { findUserById } from '../services/user.service.js'
import {
  findReusableActiveCredentialForUser,
  getActiveWalletCredentialsByUser,
  getCredentialStatusSummary,
  storeCredentialDB,
} from '../services/credential.service.js'
import { createSignedVC, getIssuerDID } from '../credential/vc-generator.js'
import { validateCredentialRequest, validateDid } from '../security/validation.js'
import {
  ProofVerificationError,
  verifyHolderProofJwt,
  verifyPresentedCredentialJwt,
} from '../services/proof.service.js'
import { rotateTokenNonce } from '../services/token.service.js'
import {
  evaluateIssuancePolicy,
  verifyTrustedPresentedVc,
} from '../services/policy.service.js'
import { areEquivalentDid, normalizeDidForStorage } from '../lib/did.js'

const JWT_VC_JSON_FORMAT = 'jwt_vc_json'

export class CredentialController {
  private static decodeJwtPayload(token: string): Record<string, unknown> | null {
    const parts = String(token || '').split('.')
    if (parts.length !== 3) return null

    try {
      const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/')
      const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
      const payload = Buffer.from(padded, 'base64').toString('utf8')
      return JSON.parse(payload) as Record<string, unknown>
    } catch {
      return null
    }
  }

  private static credentialHasLegacyStatusField(jwt: string): boolean {
    const payload = CredentialController.decodeJwtPayload(jwt)
    const vc = (payload?.vc && typeof payload.vc === 'object') ? payload.vc as Record<string, unknown> : null
    return !!vc?.credentialStatus
  }

  private static deriveNoBPJSFromNik(nik: string): string {
    const digitsOnly = String(nik || '').replace(/\D/g, '')
    if (digitsOnly.length >= 13) {
      return digitsOnly.slice(0, 13)
    }
    return digitsOnly.padStart(13, '0')
  }

  private static getSharedHolderDids(): Set<string> {
    const configured = String(process.env.SHARED_HOLDER_DIDS || 'did:web:wallet.identia.my.id')
      .split(',')
      .map((value) => normalizeDidForStorage(value))
      .filter(Boolean)

    return new Set(configured)
  }

  private static isSharedHolderDid(did: string): boolean {
    const normalized = normalizeDidForStorage(did)
    if (!normalized) return false
    return CredentialController.getSharedHolderDids().has(normalized)
  }

  /**
   * POST /credential
   * 
   * Issue a signed JWT Verifiable Credential.
   * 
   * Requires: Authorization: Bearer <access_token>
   * 
   * Body: {
   *   format: "jwt_vc_json",
   *   credential_definition: {
   *     type: ["VerifiableCredential", "IdentityCredential"]
   *   }
   * }
   * 
   * Response: {
   *   format: "jwt_vc_json",
   *   credential: "<signed_jwt>"
   * }
   */
  static async issueCredential(req: Request, res: Response) {
    try {
      // userId is set by requireBearerToken middleware
      const userId = req.userId
      if (!userId) {
        return res.status(401).json({
          error: 'invalid_token',
          error_description: 'No user associated with this token',
        })
      }

      // Validate credential request body
      const validation = validateCredentialRequest(req.body)
      if (!validation.valid) {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: validation.errors.join(', '),
        })
      }

      const tokenHolderDid = normalizeDidForStorage(req.userDid || '')
      const cNonce = req.cNonce
      const accessToken = req.accessToken

      if (!tokenHolderDid || !cNonce || !accessToken) {
        return res.status(401).json({
          error: 'invalid_token',
          error_description: 'Access token DID/nonce context is missing',
        })
      }

      const requestDid = normalizeDidForStorage(String(req.body?.holderDid || req.body?.holder_did || ''))
      const verifiedProof = await verifyHolderProofJwt({
        proofJwt: String(req.body?.proof?.jwt || ''),
        expectedNonce: cNonce,
        expectedDids: requestDid ? [requestDid] : [tokenHolderDid],
      })

      const holderDid = requestDid || verifiedProof.holderDid

      if (requestDid && !areEquivalentDid(requestDid, verifiedProof.holderDid)) {
        return res.status(401).json({
          error: 'invalid_proof',
          error_description: 'Requested holder DID does not match proof DID',
        })
      }

      const didValidation = validateDid(holderDid)
      if (!didValidation.valid) {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: didValidation.error,
        })
      }

      const requestFormat = JWT_VC_JSON_FORMAT
      const requestedTypes = req.body?.credential_definition?.type
      const normalizedTypes = Array.isArray(requestedTypes)
        ? requestedTypes
          .map((t: unknown) => String(t))
          .map((t: string) => {
            const normalized = t.trim().toLowerCase()
            if (normalized === 'identitycredential' || normalized === 'identity_credential') {
              return 'KartuBPJSKesehatan'
            }
            return t
          })
        : []
      const credentialTypes = Array.from(new Set([
        ...normalizedTypes,
        'VerifiableCredential',
        'KartuBPJSKesehatan',
      ]))

      // Get user data from database
      const user = await findUserById(userId)
      if (!user) {
        return res.status(404).json({
          error: 'invalid_request',
          error_description: 'User not found',
        })
      }

      if (!user.nik || !(user.nama || user.fullName)) {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'Profil pengguna tidak lengkap (NIK dan nama diperlukan)',
        })
      }

      const policy = await evaluateIssuancePolicy({
        user,
        holderDid,
        evidence: req.body?.evidence,
      })

      if (!policy.allowed) {
        return res.status(403).json({
          error: 'access_denied',
          error_description: `Issuance policy rejected: ${policy.reasonCodes.join(', ')}`,
          policy,
        })
      }

      const reusableCredential = await findReusableActiveCredentialForUser(user.id, holderDid)
      if (reusableCredential && !CredentialController.credentialHasLegacyStatusField(reusableCredential.credential)) {
        const rotatedNonce = await rotateTokenNonce(accessToken)

        return res.json({
          format: JWT_VC_JSON_FORMAT,
          credential: reusableCredential.credential,
          credential_id: reusableCredential.id,
          credential_reused: true,
          c_nonce: rotatedNonce.cNonce,
          c_nonce_expires_in: rotatedNonce.cNonceExpiresIn,
        })
      }

      // Build KartuBPJSKesehatan credential subject bound to holder DID
      const holderName = user.nama || user.fullName
      const tanggalLahir = user.tanggalLahir
        ? user.tanggalLahir.toISOString().split('T')[0]
        : undefined
      const noBPJS = CredentialController.deriveNoBPJSFromNik(user.nik)

      const credentialSubject = {
        id: holderDid,
        credentialName: 'Kartu BPJS Kesehatan',
        holderName,
        nik: user.nik,
        noBPJS,
        tanggalLahir,
      }

      const credentialRecordId = crypto.randomUUID()

      const signedJwt = await createSignedVC(
        credentialSubject,
        holderDid,
        credentialTypes,
        {
          credentialId: credentialRecordId,
        }
      )

      // Store credential in database
      const issuerDID = getIssuerDID()
      const expiryDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year

      const credentialId = await storeCredentialDB({
        id: credentialRecordId,
        credentialJwt: signedJwt,
        format: requestFormat,
        holderDID: holderDid,
        holderName,
        nik: user.nik,
        nama: holderName,
        tanggalLahir,
        metadata: {
          credentialType: 'KartuBPJSKesehatan',
          credentialTypeDisplay: 'Kartu BPJS Kesehatan',
          credentialSubject,
        },
        issuerDID,
        issuerName: process.env.ISSUER_NAME || 'Issuer Kartu BPJS Kesehatan',
        validUntil: expiryDate,
        userId: user.id,
      })

      console.log('✅ Credential issued to:', user.nama)
      console.log('📋 Credential ID:', credentialId)

      const rotatedNonce = await rotateTokenNonce(accessToken)

      // Return credential to wallet (OID4VCI response format)
      res.json({
        format: JWT_VC_JSON_FORMAT,
        credential: signedJwt,
        credential_id: credentialId,
        c_nonce: rotatedNonce.cNonce,
        c_nonce_expires_in: rotatedNonce.cNonceExpiresIn,
      })
    } catch (error: any) {
      if (error instanceof ProofVerificationError) {
        return res.status(error.statusCode).json({
          error: 'invalid_proof',
          error_description: error.message,
        })
      }

      console.error('❌ Credential issuance error:', error.message)
      res.status(500).json({
        error: 'server_error',
        error_description: 'Failed to issue credential',
      })
    }
  }

  static async getWalletCredentials(req: Request, res: Response) {
    try {
      const userId = req.userId
      if (!userId) {
        return res.status(401).json({
          error: 'invalid_token',
          error_description: 'No user associated with this token',
        })
      }

      const credentials = await getActiveWalletCredentialsByUser(userId, req.userDid)

      return res.json({
        success: true,
        count: credentials.length,
        credentials,
      })
    } catch (error: any) {
      return res.status(500).json({
        error: 'server_error',
        error_description: error.message || 'Failed to load wallet credentials',
      })
    }
  }

  /**
   * MODE 2 (SSI-native): Holder presents existing VC, backend verifies VC cryptographically,
   * then checks claims against trusted registry before issuing new VC.
   */
  static async issueCredentialSsiNative(req: Request, res: Response) {
    try {
      const userId = req.userId
      const tokenHolderDid = normalizeDidForStorage(req.userDid || '')
      const cNonce = req.cNonce
      const accessToken = req.accessToken

      if (!userId || !tokenHolderDid || !cNonce || !accessToken) {
        return res.status(401).json({
          error: 'invalid_token',
          error_description: 'Access token DID/nonce context is missing',
        })
      }

      if (!req.body?.presented_vc || typeof req.body.presented_vc !== 'string') {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'presented_vc is required in SSI-native mode',
        })
      }

      const requestDid = normalizeDidForStorage(String(req.body?.holderDid || req.body?.holder_did || ''))
      const verifiedProof = await verifyHolderProofJwt({
        proofJwt: String(req.body?.proof?.jwt || ''),
        expectedNonce: cNonce,
        expectedDids: requestDid ? [requestDid] : [tokenHolderDid],
      })

      const holderDid = requestDid || verifiedProof.holderDid

      if (requestDid && !areEquivalentDid(requestDid, verifiedProof.holderDid)) {
        return res.status(401).json({
          error: 'invalid_proof',
          error_description: 'Requested holder DID does not match proof DID',
        })
      }

      const presentedPayload = await verifyPresentedCredentialJwt(req.body.presented_vc)
      const trustedPresentedVc = await verifyTrustedPresentedVc({
        presentedPayload: presentedPayload as Record<string, unknown>,
      })

      if (!trustedPresentedVc.trusted) {
        return res.status(403).json({
          error: 'access_denied',
          error_description: `Presented VC issuer is not trusted: ${trustedPresentedVc.reason}`,
        })
      }

      const vc = (presentedPayload as Record<string, any>).vc || {}
      const credentialSubject = vc.credentialSubject || {}

      const registryNik = String(credentialSubject.nomorNIK || credentialSubject.nik || '').trim()
      const registryEmail = String(credentialSubject.email || '').trim().toLowerCase()

      // Database acts as trusted registry for claim matching only.
      const matchedUser = await findUserById(userId)
      if (!matchedUser) {
        return res.status(404).json({
          error: 'invalid_request',
          error_description: 'User registry entry not found',
        })
      }

      const nikMatches = !!registryNik && registryNik === (matchedUser.nik || '')
      const emailMatches = !!registryEmail && registryEmail === matchedUser.email.toLowerCase()

      if (!nikMatches && !emailMatches) {
        return res.status(403).json({
          error: 'access_denied',
          error_description: 'Presented VC claims do not match trusted registry',
        })
      }

      const policy = await evaluateIssuancePolicy({
        user: matchedUser,
        holderDid,
        evidence: req.body?.evidence,
      })

      if (!policy.allowed) {
        return res.status(403).json({
          error: 'access_denied',
          error_description: `Issuance policy rejected: ${policy.reasonCodes.join(', ')}`,
          policy,
        })
      }

      const normalizedBody = {
        ...req.body,
        holderDid,
      }
      req.body = normalizedBody

      return CredentialController.issueCredential(req, res)
    } catch (error: any) {
      if (error instanceof ProofVerificationError) {
        return res.status(error.statusCode).json({
          error: 'invalid_proof',
          error_description: error.message,
        })
      }

      return res.status(500).json({
        error: 'server_error',
        error_description: error.message || 'Failed to process SSI-native issuance',
      })
    }
  }

  static async getCredentialStatus(req: Request, res: Response) {
    try {
      const summary = await getCredentialStatusSummary(req.params.id)
      if (!summary) {
        return res.status(404).json({
          error: 'not_found',
          error_description: 'Credential status not found',
        })
      }

      return res.json({
        credential_id: summary.credentialId,
        status: summary.status,
        status_list: {
          active: summary.status === 'ACTIVE',
          suspended: summary.suspended,
          revoked: summary.revoked,
          expired: summary.expired,
        },
        valid_until: summary.validUntil,
        updated_at: summary.updatedAt,
        reason: summary.revokedReason,
      })
    } catch (error: any) {
      return res.status(500).json({
        error: 'server_error',
        error_description: error.message,
      })
    }
  }
}
