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
import { validateTokenRequest } from '../security/validation.js'

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

      const { code, client_id } = req.body

      // Verify authorization code
      const authResult = await verifyAuthorizationCode({
        code,
        clientId: client_id,
      })

      // Generate access token
      const tokenResult = await generateAccessToken(authResult.userId)

      console.log('✅ Access token issued for user:', authResult.userId)

      res.json({
        access_token: tokenResult.accessToken,
        token_type: 'Bearer',
        expires_in: tokenResult.expiresIn,
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
