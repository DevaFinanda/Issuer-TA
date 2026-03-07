/**
 * Authorization Controller — OID4VCI Authorization Code Flow
 * 
 * Implements:
 *   GET  /authorize  — Redirect to frontend login page (wallet calls this)
 *   POST /authorize  — Authenticate user + generate authorization code
 *   POST /register   — Register new holder user
 */

import { Request, Response } from 'express'
import {
  authenticateAndGenerateCode,
  AuthError,
} from '../services/auth.service.js'
import { registerHolder } from '../services/user.service.js'
import {
  validateAuthorizeRequest,
  validateRegistration,
} from '../security/validation.js'

export class AuthController {
  /**
   * GET /authorize
   * 
   * Called by the wallet after reading the credential offer.
   * Redirects to the frontend /authorize page for NIK + password login.
   * 
   * Query params: response_type, client_id, redirect_uri, state
   */
  static getAuthorize(req: Request, res: Response) {
    const { response_type, client_id, redirect_uri, state } = req.query

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000'

    // Build redirect to frontend authorize page with same query params
    const params = new URLSearchParams()
    if (response_type) params.set('response_type', response_type as string)
    if (client_id) params.set('client_id', client_id as string)
    if (redirect_uri) params.set('redirect_uri', redirect_uri as string)
    if (state) params.set('state', state as string)

    const redirectUrl = `${frontendUrl}/authorize?${params.toString()}`

    console.log('🔄 Redirecting to frontend authorize page:', redirectUrl)
    res.redirect(redirectUrl)
  }

  /**
   * POST /authorize
   * 
   * Called by the frontend after the user submits NIK + password.
   * Authenticates the user and returns an authorization code via redirect URL.
   * 
   * Body: { nik, password, client_id, redirect_uri, state }
   */
  static async postAuthorize(req: Request, res: Response) {
    try {
      // Validate input
      const validation = validateAuthorizeRequest(req.body)
      if (!validation.valid) {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: validation.errors.join(', '),
        })
      }

      const { nik, password, client_id, redirect_uri, state } = req.body

      // Authenticate and generate authorization code
      const result = await authenticateAndGenerateCode({
        nik,
        password,
        clientId: client_id,
        redirectUri: redirect_uri,
        state,
      })

      console.log('✅ Authorization code issued, redirect URL:', result.redirectUrl)

      res.json({
        success: true,
        redirect_url: result.redirectUrl,
      })
    } catch (error: any) {
      if (error instanceof AuthError) {
        return res.status(error.statusCode).json({
          error: 'access_denied',
          error_description: error.message,
        })
      }

      console.error('❌ Authorization error:', error.message)
      res.status(500).json({
        error: 'server_error',
        error_description: 'Internal server error',
      })
    }
  }

  /**
   * POST /register
   * 
   * Register a new holder user.
   * 
   * Body: { nik, nama, tanggal_lahir, email, password }
   */
  static async postRegister(req: Request, res: Response) {
    try {
      // Validate input
      const validation = validateRegistration(req.body)
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: validation.errors,
        })
      }

      const { nik, nama, tanggal_lahir, email, password } = req.body

      const result = await registerHolder({
        nik,
        nama,
        tanggalLahir: tanggal_lahir,
        email,
        password,
      })

      res.status(201).json({
        success: true,
        message: 'Registration successful',
        userId: result.userId,
      })
    } catch (error: any) {
      if (error.message.includes('already registered')) {
        return res.status(409).json({
          success: false,
          error: error.message,
        })
      }

      console.error('❌ Registration error:', error.message)
      res.status(500).json({
        success: false,
        error: 'Registration failed',
        message: error.message,
      })
    }
  }
}
