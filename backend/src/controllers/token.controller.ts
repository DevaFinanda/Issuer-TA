/**
 * Token Controller — OID4VCI Token Exchange
 * 
 * Implements: POST /token
 */

import { Request, Response } from 'express'
import {
  verifyAuthorizationCode,
  AuthError,
} from '../services/auth.service.js'
import { generateAccessToken } from '../services/token.service.js'
import { validateDid, validateTokenRequest } from '../security/validation.js'
import { getUserIdByDid } from '../services/user.service.js'
import { prisma } from '../lib/prisma.js'

export class TokenController {
  /**
   * POST /token
   * 
   * Exchange authorization code for access token.
   * 
   * Body: { grant_type: "authorization_code", code, client_id }
   * 
   * Response: { access_token, token_type: "Bearer", expires_in: 3600 }
   */
  static async exchangeToken(req: Request, res: Response) {
    try {
      // Validate input
      const validation = validateTokenRequest(req.body)
      if (!validation.valid) {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: validation.errors.join(', '),
        })
      }

      const grantType = String(req.body.grant_type || '').trim()

      let tokenResult: {
        accessToken: string
        expiresIn: number
        cNonce: string
        cNonceExpiresIn: number
      }
      let issuedForUserId = ''

      if (grantType === 'authorization_code') {
        const { code, client_id } = req.body

        // Verify authorization code
        const authResult = await verifyAuthorizationCode({
          code,
          clientId: client_id,
        })

        // Generate DID-bound access token
        tokenResult = await generateAccessToken(authResult.userId, authResult.holderDid)
        issuedForUserId = authResult.userId
      } else {
        const preAuthorizedCode = String(req.body['pre-authorized_code'] || req.body.pre_authorized_code || '').trim()
        const holderDid = String(req.body.holder_did || req.body.wallet_did || '').trim()

        const didValidation = validateDid(holderDid)
        if (!didValidation.valid) {
          return res.status(400).json({
            error: 'invalid_request',
            error_description: didValidation.error,
          })
        }

        const preAuthRecord = await prisma.issuerConfig.findUnique({
          where: { key: `pre-auth-code:${preAuthorizedCode}` },
        })

        if (!preAuthRecord?.value) {
          return res.status(400).json({
            error: 'invalid_grant',
            error_description: 'Invalid pre-authorized code',
          })
        }

        const metadata = JSON.parse(preAuthRecord.value) as {
          used?: boolean
          expiresAt?: string
        }

        if (metadata.used) {
          return res.status(400).json({
            error: 'invalid_grant',
            error_description: 'Pre-authorized code has already been used',
          })
        }

        if (!metadata.expiresAt || new Date(metadata.expiresAt) < new Date()) {
          return res.status(400).json({
            error: 'invalid_grant',
            error_description: 'Pre-authorized code has expired',
          })
        }

        const userId = await getUserIdByDid(holderDid)
        if (!userId) {
          return res.status(400).json({
            error: 'invalid_grant',
            error_description: 'holder_did is not registered in trusted registry',
          })
        }

        tokenResult = await generateAccessToken(userId, holderDid)
        issuedForUserId = userId

        await prisma.issuerConfig.update({
          where: { key: `pre-auth-code:${preAuthorizedCode}` },
          data: {
            value: JSON.stringify({
              ...metadata,
              used: true,
              usedAt: new Date().toISOString(),
            }),
          },
        })
      }

      console.log('✅ Access token issued for user:', issuedForUserId)

      res.json({
        access_token: tokenResult.accessToken,
        token_type: 'Bearer',
        expires_in: tokenResult.expiresIn,
        c_nonce: tokenResult.cNonce,
        c_nonce_expires_in: tokenResult.cNonceExpiresIn,
      })
    } catch (error: any) {
      if (error instanceof AuthError) {
        return res.status(error.statusCode).json({
          error: 'invalid_grant',
          error_description: error.message,
        })
      }

      console.error('❌ Token exchange error:', error.message)
      res.status(500).json({
        error: 'server_error',
        error_description: 'Internal server error',
      })
    }
  }
}
