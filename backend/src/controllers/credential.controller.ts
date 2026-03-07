/**
 * Credential Controller — OID4VCI Credential Issuance
 * 
 * Implements: POST /credential
 * 
 * The wallet calls this endpoint with a Bearer access token
 * to request the actual Verifiable Credential.
 */

import { Request, Response } from 'express'
import { findUserById } from '../services/user.service.js'
import { storeCredentialDB } from '../services/credential.service.js'
import { createSignedVC, getIssuerDID } from '../credential/vc-generator.js'
import { validateCredentialRequest } from '../security/validation.js'

export class CredentialController {
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

      // Get user data from database
      const user = await findUserById(userId)
      if (!user) {
        return res.status(404).json({
          error: 'invalid_request',
          error_description: 'User not found',
        })
      }

      if (!user.nik || !user.nama) {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'User profile incomplete (NIK and nama required)',
        })
      }

      // Create and sign the JWT VC
      const credentialSubject = {
        nik: user.nik,
        nama: user.nama,
        tanggal_lahir: user.tanggalLahir
          ? user.tanggalLahir.toISOString().split('T')[0]
          : '',
      }

      const signedJwt = await createSignedVC(credentialSubject)

      // Store credential in database
      const issuerDID = getIssuerDID()
      const expiryDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year

      const credentialId = await storeCredentialDB({
        credentialJwt: signedJwt,
        format: 'jwt_vc_json',
        holderName: user.nama,
        nik: user.nik,
        nama: user.nama,
        tanggalLahir: credentialSubject.tanggal_lahir,
        issuerDID,
        issuerName: process.env.ISSUER_NAME || 'Identity Credential Issuer',
        validUntil: expiryDate,
        userId: user.id,
      })

      console.log('✅ Credential issued to:', user.nama)
      console.log('📋 Credential ID:', credentialId)

      // Return credential to wallet (OID4VCI response format)
      res.json({
        format: 'jwt_vc_json',
        credential: signedJwt,
      })
    } catch (error: any) {
      console.error('❌ Credential issuance error:', error.message)
      res.status(500).json({
        error: 'server_error',
        error_description: 'Failed to issue credential',
      })
    }
  }
}
