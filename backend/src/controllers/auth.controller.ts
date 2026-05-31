/**
 * Authorization Controller — OID4VCI Authorization Code Flow
 * 
 * Implements:
 *   GET  /authorize  — Redirect to frontend login page (wallet calls this)
 *   POST /authorize  — Authenticate user + generate authorization code
 *   POST /register   — Register new holder user
 */

import { Request, Response } from 'express'
import crypto from 'crypto'
import {
  authenticateAndGenerateCode,
  authenticateUserLogin,
  AuthError,
} from '../services/auth.service.js'
import { generateAccessToken } from '../services/token.service.js'
import {
  bindUserDid,
  DidBindingConflictError,
  registerHolder,
  setUserOnboardingStatus,
} from '../services/user.service.js'
import { getActiveWalletCredentialsByUser } from '../services/credential.service.js'
import { prisma } from '../lib/prisma.js'
import {
  validateAuthorizeRequest,
  validateDid,
  validateLoginRequest,
  validateRegistration,
} from '../security/validation.js'

function normalizeBirthDate(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined

  const raw = value.trim()
  if (!raw) return undefined

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw
  }

  const localFormat = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (localFormat) {
    const [, dd, mm, yyyy] = localFormat
    return `${yyyy}-${mm}-${dd}`
  }

  return undefined
}

export class AuthController {
  private static shouldIncludeAuthorizeDebug(): boolean {
    return String(process.env.NODE_ENV || '').toLowerCase() !== 'production'
  }

  private static maskDid(did: string | null): string | null {
    if (!did) return null

    const trimmed = String(did).trim()
    if (trimmed.length <= 18) {
      return `${trimmed.slice(0, 6)}...`
    }

    return `${trimmed.slice(0, 12)}...${trimmed.slice(-6)}`
  }

  private static resolveHolderDidSource(body: any): 'holder_did' | 'wallet_did' | 'client_id' | 'fallback' | 'missing' {
    const byHolderDid = String(body?.holder_did || '').trim()
    if (byHolderDid) return 'holder_did'

    const byWalletDid = String(body?.wallet_did || '').trim()
    if (byWalletDid) return 'wallet_did'

    const clientId = String(body?.client_id || '').trim()
    if (clientId.toLowerCase().startsWith('did:')) {
      return 'client_id'
    }

    const fallbackDid = AuthController.resolveFallbackHolderDid()
    if (fallbackDid) return 'fallback'

    return 'missing'
  }

  private static buildAuthorizeDebug(body: any, resolvedHolderDid: string | null) {
    if (!AuthController.shouldIncludeAuthorizeDebug()) {
      return undefined
    }

    const clientId = String(body?.client_id || '').trim()
    return {
      resolved_holder_did_masked: AuthController.maskDid(resolvedHolderDid),
      resolved_holder_did_source: AuthController.resolveHolderDidSource(body),
      client_id_is_did: clientId.toLowerCase().startsWith('did:'),
    }
  }

  private static resolveFallbackHolderDid(): string | null {
    const sharedDid = String(process.env.SHARED_HOLDER_DIDS || 'did:web:wallet.identia.my.id')
      .split(',')
      .map((value) => value.trim())
      .find(Boolean)

    if (sharedDid) return sharedDid

    const explicitFallback = String(process.env.DEFAULT_HOLDER_DID || '').trim()
    return explicitFallback || null
  }

  private static resolveHolderDid(body: any): string | null {
    const byParam = String(body?.holder_did || body?.wallet_did || '').trim()
    if (byParam) return byParam

    const clientId = String(body?.client_id || '').trim()
    if (clientId.toLowerCase().startsWith('did:')) {
      return clientId
    }

    const fallbackDid = AuthController.resolveFallbackHolderDid()
    if (fallbackDid) {
      console.warn('⚠️ holder_did missing on authorize request, using fallback DID:', fallbackDid)
      return fallbackDid
    }

    return null
  }

  /**
   * GET /authorize  (and /oid4vci/authorize)
   *
   * Called by the wallet after reading the credential offer.
   * Redirects to the frontend /authorize page so the holder can log in
   * using the React UI instead of the inline HTML fallback.
   *
   * Query params are forwarded as-is: response_type, client_id, redirect_uri, state
   */
  static getAuthorize(req: Request, res: Response) {
    // Forward all query params to the frontend authorization page
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(req.query)) {
      if (value !== undefined && value !== null) {
        params.set(key, String(value))
      }
    }

    const frontendAuthorizeUrl = `/authorize${params.toString() ? `?${params.toString()}` : ''}`
    return res.redirect(302, frontendAuthorizeUrl)
  }

  /**
   * POST /login
   *
   * Body: { username, password }
   *
   * If valid, returns an access token and the next credential issuance step.
   */
  static async postLogin(req: Request, res: Response) {
    try {
      const validation = validateLoginRequest(req.body)
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: validation.errors,
        })
      }

      const { username, password } = req.body

      const auth = await authenticateUserLogin({ username, password })
      const holderDid = String(req.body?.holder_did || req.body?.wallet_did || '').trim() || undefined

      const token = await generateAccessToken(auth.userId, holderDid)
      const walletCredentials = await getActiveWalletCredentialsByUser(auth.userId, holderDid)

      return res.json({
        success: true,
        accessToken: token.accessToken,
        tokenType: 'Bearer',
        expiresIn: token.expiresIn,
        c_nonce: token.cNonce,
        c_nonce_expires_in: token.cNonceExpiresIn,
        walletCredentials,
        nextStep: {
          endpoint: '/request-credential',
          method: 'POST',
          payload: {
            holderDid: 'did:web:wallet.identia.my.id',
          },
        },
      })
    } catch (error: any) {
      if (error instanceof AuthError) {
        return res.status(error.statusCode).json({
          success: false,
          error: error.message,
        })
      }

      console.error('❌ Login error:', error.message)
      return res.status(500).json({
        success: false,
        error: 'Login failed',
      })
    }
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
    const contentType = (req.headers['content-type'] || '').toString()
    const isFormPost = contentType.includes('application/x-www-form-urlencoded')

    const renderErrorPage = (message: string, statusCode: number = 400) => {
      const escaped = String(message)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')

      return res.status(statusCode).send(`<!doctype html>
<html lang="id"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Otorisasi Gagal</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f8fafc;margin:0;padding:24px}.card{max-width:420px;margin:20px auto;background:#fff;border:1px solid #fecaca;border-radius:12px;padding:16px}.title{color:#991b1b;font-size:20px;margin:0 0 8px}.msg{color:#7f1d1d}.btn{display:inline-block;margin-top:14px;background:#2563eb;color:#fff;padding:10px 14px;border-radius:8px;text-decoration:none}</style>
</head><body><div class="card"><h1 class="title">Otorisasi Gagal</h1><p class="msg">${escaped}</p><a class="btn" href="javascript:history.back()">Kembali</a></div></body></html>`)
    }

    try {
      const initialHolderDid = AuthController.resolveHolderDid(req.body)
      const authorizeDebug = AuthController.buildAuthorizeDebug(req.body, initialHolderDid)

      // Validate input
      const validation = validateAuthorizeRequest(req.body)
      if (!validation.valid) {
        if (isFormPost) {
          return renderErrorPage(validation.errors.join(', '), 400)
        }
        return res.status(400).json({
          error: 'invalid_request',
          error_description: validation.errors.join(', '),
          ...(authorizeDebug ? { debug: authorizeDebug } : {}),
        })
      }

      const { password, client_id, redirect_uri, state } = req.body
      const identifier = (req.body.identifier || req.body.nik || '').toString().trim()
      const holderDid = initialHolderDid

      if (!holderDid) {
        if (isFormPost) {
          return renderErrorPage('holder_did wajib dikirim oleh wallet', 400)
        }

        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'holder_did is required',
          ...(authorizeDebug ? { debug: authorizeDebug } : {}),
        })
      }

      const didValidation = validateDid(holderDid)
      if (!didValidation.valid) {
        if (isFormPost) {
          return renderErrorPage(didValidation.error || 'holder_did tidak valid', 400)
        }

        return res.status(400).json({
          error: 'invalid_request',
          error_description: didValidation.error,
          ...(authorizeDebug ? { debug: authorizeDebug } : {}),
        })
      }

      // Authenticate and generate authorization code
      const result = await authenticateAndGenerateCode({
        identifier,
        password,
        clientId: client_id,
        redirectUri: redirect_uri,
        holderDid,
        state,
      })

      // Persist account ↔ DID binding for SSI identity continuity.
      await bindUserDid(result.userId, holderDid)

      console.log('✅ Authorization code issued, redirect URL:', result.redirectUrl)

      // Only do a browser redirect for real HTML form submissions.
      // JSON API calls (e.g. from the React frontend via Axios/fetch) must receive
      // a JSON body — not a 302 — because custom-scheme URIs (identia-wallet://)
      // cannot be followed by fetch/Axios and would cause a network error.
      if (isFormPost) {
        return res.redirect(result.redirectUrl)
      }

      res.json({
        success: true,
        code: result.code,
        holder_did: holderDid,
        redirect_uri: redirect_uri,
        ...(authorizeDebug ? { debug: authorizeDebug } : {}),
      })
    } catch (error: any) {
      const authorizeDebug = AuthController.buildAuthorizeDebug(req.body, AuthController.resolveHolderDid(req.body))

      if (error instanceof DidBindingConflictError) {
        if (isFormPost) {
          return renderErrorPage(error.message, 409)
        }

        return res.status(409).json({
          error: 'did_binding_conflict',
          error_description: error.message,
          ...(authorizeDebug ? { debug: authorizeDebug } : {}),
        })
      }

      if (error instanceof AuthError) {
        if (isFormPost) {
          return renderErrorPage(error.message, error.statusCode)
        }

        return res.status(error.statusCode).json({
          error: 'access_denied',
          error_description: error.message,
          ...(authorizeDebug ? { debug: authorizeDebug } : {}),
        })
      }

      console.error('❌ Authorization error:', error.message)

      if (isFormPost) {
        return renderErrorPage('Internal server error', 500)
      }

      res.status(500).json({
        error: 'server_error',
        error_description: 'Internal server error',
        ...(authorizeDebug ? { debug: authorizeDebug } : {}),
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

      const nik = (req.body?.nik || '').toString().trim()
      const namaRaw = req.body?.nama
      const emailRaw = req.body?.email
      const password = (req.body?.password || '').toString()
      const tanggalLahirRaw = req.body?.tanggal_lahir ?? req.body?.tanggalLahir

      const nama = typeof namaRaw === 'string' ? namaRaw.trim() : undefined
      const email = typeof emailRaw === 'string' ? emailRaw.trim() : undefined
      const tanggal_lahir = normalizeBirthDate(tanggalLahirRaw)

      const result = await registerHolder({
        nik,
        nama,
        tanggalLahir: tanggal_lahir,
        email,
        password,
      })

      res.status(201).json({
        success: true,
        message: result.created ? 'Registration successful' : 'Profil berhasil disinkronkan',
        created: result.created,
        userId: result.userId,
      })
    } catch (error: any) {
      if (error.message.includes('already registered')) {
        return res.status(409).json({
          success: false,
          code: 'ALREADY_REGISTERED',
          error: 'Akun dengan NIK atau email ini sudah terdaftar',
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

  /**
   * MODE 1 (Bootstrap): user submits profile to request initial onboarding.
   * OTP delivery is simulated for academic demo environments.
   */
  static async postBootstrapRequest(req: Request, res: Response) {
    try {
      const email = String(req.body?.email || '').trim().toLowerCase()
      const nik = String(req.body?.nik || '').trim()
      const nama = String(req.body?.nama || '').trim()
      const tanggalLahir = String(req.body?.tanggal_lahir || req.body?.tanggalLahir || '').trim()
      const password = String(req.body?.password || '')

      if (!email || !nik || !nama || !password) {
        return res.status(400).json({
          success: false,
          error: 'email, nik, nama, dan password wajib diisi',
        })
      }

      const requestId = crypto.randomUUID()
      const otp = String(Math.floor(100000 + Math.random() * 900000))
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()

      await prisma.issuerConfig.create({
        data: {
          key: `bootstrap-request:${requestId}`,
          value: JSON.stringify({
            requestId,
            email,
            nik,
            nama,
            tanggalLahir: tanggalLahir || null,
            password,
            otp,
            otpVerified: false,
            adminApproved: false,
            expiresAt,
            status: 'PENDING_OTP',
          }),
          description: 'Bootstrap request (OTP + admin approval)',
        },
      })

      return res.status(201).json({
        success: true,
        request_id: requestId,
        otp_delivery: 'simulated_email',
        otp_expires_at: expiresAt,
      })
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to create bootstrap request',
      })
    }
  }

  static async postBootstrapVerifyOtp(req: Request, res: Response) {
    try {
      const requestId = String(req.body?.request_id || '').trim()
      const otp = String(req.body?.otp || '').trim()

      if (!requestId || !otp) {
        return res.status(400).json({
          success: false,
          error: 'request_id dan otp wajib diisi',
        })
      }

      const record = await prisma.issuerConfig.findUnique({
        where: { key: `bootstrap-request:${requestId}` },
      })

      if (!record?.value) {
        return res.status(404).json({
          success: false,
          error: 'Bootstrap request tidak ditemukan',
        })
      }

      const payload = JSON.parse(record.value) as Record<string, unknown>
      const expiresAt = String(payload.expiresAt || '')
      if (new Date(expiresAt) < new Date()) {
        return res.status(410).json({
          success: false,
          error: 'OTP sudah kedaluwarsa',
        })
      }

      if (String(payload.otp || '') !== otp) {
        return res.status(401).json({
          success: false,
          error: 'OTP tidak valid',
        })
      }

      payload.otpVerified = true
      payload.status = 'PENDING_ADMIN_APPROVAL'

      await prisma.issuerConfig.update({
        where: { key: `bootstrap-request:${requestId}` },
        data: { value: JSON.stringify(payload) },
      })

      return res.json({
        success: true,
        status: payload.status,
      })
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to verify OTP',
      })
    }
  }

  static async postBootstrapAdminApprove(req: Request, res: Response) {
    try {
      const requestId = String(req.body?.request_id || '').trim()

      if (!requestId) {
        return res.status(400).json({
          success: false,
          error: 'request_id wajib diisi',
        })
      }

      const record = await prisma.issuerConfig.findUnique({
        where: { key: `bootstrap-request:${requestId}` },
      })

      if (!record?.value) {
        return res.status(404).json({
          success: false,
          error: 'Bootstrap request tidak ditemukan',
        })
      }

      const payload = JSON.parse(record.value) as {
        nik: string
        nama: string
        email: string
        password: string
        tanggalLahir?: string | null
        otpVerified?: boolean
      }

      if (!payload.otpVerified) {
        return res.status(400).json({
          success: false,
          error: 'OTP belum diverifikasi',
        })
      }

      const registration = await registerHolder({
        nik: payload.nik,
        nama: payload.nama,
        email: payload.email,
        password: payload.password,
        tanggalLahir: payload.tanggalLahir || undefined,
      })

      await setUserOnboardingStatus(registration.userId, 'VERIFIED')

      await prisma.issuerConfig.update({
        where: { key: `bootstrap-request:${requestId}` },
        data: {
          value: JSON.stringify({
            ...payload,
            otpVerified: true,
            adminApproved: true,
            status: 'APPROVED',
            approvedAt: new Date().toISOString(),
            userId: registration.userId,
          }),
          description: 'Bootstrap request approved',
        },
      })

      return res.json({
        success: true,
        status: 'APPROVED',
        userId: registration.userId,
      })
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to approve bootstrap request',
      })
    }
  }
}
