/**
 * Server Entry — OID4VCI Issuer (Authorization Code Flow)
 *
 * Initializes Express app, mounts security middleware + OID4VCI routes,
 * starts the Credo-TS agent for DID/key management, and initializes
 * the JWT VC generator.
 */

import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import { checkDatabaseConnection, disconnectDatabase } from './lib/prisma.js'
import { initializeCredoAgent, getIssuerDID, shutdownAgent } from './credo-agent.js'
import { initVCGenerator } from './credential/vc-generator.js'
import { registerRoutes } from './routes/index.js'
import {
  sanitizeInput,
  rateLimiter,
  securityHeaders,
  auditLogger,
} from './security/middleware.js'
import {
  cleanupExpiredCredentials,
  deleteCredentialById,
  deleteHolderById,
  extendCredentialExpiry,
  getAllCredentials,
  getCredentialDetailForAdmin,
  getCredentialStatusSummary,
  getHoldersSummary,
  getStatistics,
  revokeCredential,
  suspendCredential,
} from './services/credential.service.js'
import { CredentialStatus } from './lib/prisma.js'
import { cleanupExpiredTokens } from './services/token.service.js'
import { cleanupExpiredAuthCodes } from './services/auth.service.js'
import { requireApiKey } from './security/auth.guard.js'
import { assertCanonicalRuntimeConfig, BASE_URL, ISSUER_DID, ISSUER_ENDPOINTS, SIGNING_KID } from './lib/issuer-url.js'

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const PORT = Number(process.env.PORT) || 3001

// Trust the first hop proxy (Nginx)
app.set('trust proxy', 1)

// ============================================
// Global Middleware (CRITICAL ORDER)
// ============================================

// Security headers FIRST
app.use(securityHeaders)

// CORS BEFORE routes (must handle OPTIONS preflight)
const FALLBACK_ORIGINS = [
  'https://issuer.identia.my.id',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
]
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : FALLBACK_ORIGINS

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, Postman) or matching origins
    if (!origin || allowedOrigins.some(allowed => 
      allowed === origin || allowed === '*' || origin?.includes(allowed)
    )) {
      callback(null, true)
    } else {
      console.warn(`⚠️ CORS blocked: ${origin}`)
      callback(new Error('Not allowed by CORS'))
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS', 'HEAD', 'PUT', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-CSRF-Token', 'X-Request-Time'],
  optionsSuccessStatus: 200, // Required for some legacy browsers/Postman
  maxAge: 86400, // Cache preflight for 24 hours
}))

// Explicit OPTIONS handler for all routes
app.options('*', cors())

// Body parsing (order matters: AFTER CORS, BEFORE routes)
app.use(express.json({ limit: '10kb' }))
app.use(express.urlencoded({ extended: true, limit: '10kb' }))

// Input sanitization and audit logging
app.use(sanitizeInput)
app.use(auditLogger)

// Rate limiter AFTER parsing (to have full request context)
app.use(rateLimiter)

// Static files (DID Document, etc.) - AFTER core middleware
app.use(express.static(path.join(__dirname, '../public')))

// ============================================
// Root & Health Endpoints
// ============================================

app.get('/', (_req, res) => {
  res.json({
    name: 'IdentityCredential Issuer (OID4VCI)',
    version: '3.0.0',
    description: 'OpenID4VCI Compliant Verifiable Credential Issuer',
    framework: 'Credo-TS DID/Key + Express + PostgreSQL',
    protocol: 'OpenID for Verifiable Credential Issuance (OID4VCI)',
    baseUrl: BASE_URL,
    endpoints: {
      issuerMetadata: '/.well-known/openid-credential-issuer',
      oauthAuthorizationServer: '/.well-known/oauth-authorization-server',
      openidConfiguration: '/.well-known/openid-configuration',
      authorize: '/authorize',
      token: '/oid4vci/token',
      credential: '/oid4vci/credential',
      credentialOffer: '/oid4vci/credential-offer',
      register: '/register',
      health: '/health',
      statistics: '/api/stats',
    },
    credentialFormat: 'jwt_vc_json',
    flow: 'Authorization Code Flow',
    status: 'running',
  })
})

app.get('/health', async (_req, res) => {
  const dbOk = await checkDatabaseConnection()
  res.status(dbOk ? 200 : 503).json({
    status: dbOk ? 'ok' : 'degraded',
    database: dbOk ? 'connected' : 'disconnected',
    issuerDID: getIssuerDID(),
    timestamp: new Date().toISOString(),
  })
})

// Statistics (admin, requires API key)
app.get('/api/stats', requireApiKey, async (_req, res) => {
  try {
    const stats = await getStatistics()
    res.json({ success: true, statistics: stats })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
})

// Credential management list (admin)
app.get('/api/credentials', requireApiKey, async (req, res) => {
  try {
    const page = Number(req.query.page || 1)
    const limit = Number(req.query.limit || 10)
    const rawStatus = String(req.query.status || '').toUpperCase()

    let status: CredentialStatus | undefined
    if (
      rawStatus === 'OFFERED' ||
      rawStatus === 'ACTIVE' ||
      rawStatus === 'REVOKED' ||
      rawStatus === 'EXPIRED' ||
      rawStatus === 'SUSPENDED'
    ) {
      status = rawStatus as CredentialStatus
    }

    const result = await getAllCredentials(page, limit, status)
    res.json({ success: true, ...result })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
})

// Credential detail (admin)
app.get('/api/credentials/:id', requireApiKey, async (req, res) => {
  try {
    const detail = await getCredentialDetailForAdmin(req.params.id)
    if (!detail) {
      return res.status(404).json({ success: false, error: 'Credential not found' })
    }
    res.json({ success: true, credential: detail })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
})

// Revoke credential (admin)
app.post('/api/credentials/:id/revoke', requireApiKey, async (req, res) => {
  try {
    const reason = typeof req.body?.reason === 'string' ? req.body.reason : undefined
    const ok = await revokeCredential(req.params.id, reason, 'admin-api')
    if (!ok) {
      return res.status(404).json({ success: false, error: 'Credential not found or cannot be revoked' })
    }
    res.json({ success: true, message: 'Credential revoked' })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
})

// Suspend credential (admin)
app.post('/api/credentials/:id/suspend', requireApiKey, async (req, res) => {
  try {
    const reason = typeof req.body?.reason === 'string' ? req.body.reason : undefined
    const ok = await suspendCredential(req.params.id, reason, 'admin-api')
    if (!ok) {
      return res.status(404).json({ success: false, error: 'Credential not found or cannot be suspended' })
    }
    res.json({ success: true, message: 'Credential suspended' })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
})

// Extend credential expiration (admin)
app.post('/api/credentials/:id/extend-expiry', requireApiKey, async (req, res) => {
  try {
    const requestedDate = String(req.body?.validUntil || '').trim()
    if (!requestedDate) {
      return res.status(400).json({ success: false, error: 'validUntil is required' })
    }

    const parsed = new Date(requestedDate)
    if (Number.isNaN(parsed.getTime())) {
      return res.status(400).json({ success: false, error: 'validUntil is invalid' })
    }

    const ok = await extendCredentialExpiry(req.params.id, parsed, 'admin-api')
    if (!ok) {
      return res.status(404).json({ success: false, error: 'Credential not found or cannot extend expiration' })
    }
    res.json({ success: true, message: 'Credential expiration updated', validUntil: parsed.toISOString() })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
})

// Delete credential permanently (admin)
app.delete('/api/credentials/:id', requireApiKey, async (req, res) => {
  try {
    const ok = await deleteCredentialById(req.params.id, 'admin-api')
    if (!ok) {
      return res.status(404).json({ success: false, error: 'Credential not found' })
    }
    res.json({ success: true, message: 'Credential deleted' })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
})

// Holder management list (admin)
app.get('/api/holders', requireApiKey, async (_req, res) => {
  try {
    const holders = await getHoldersSummary()
    res.json({ success: true, holders })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
})

// Delete holder permanently (admin)
app.delete('/api/holders/:id', requireApiKey, async (req, res) => {
  try {
    const ok = await deleteHolderById(req.params.id, 'admin-api')
    if (!ok) {
      return res.status(404).json({ success: false, error: 'Holder not found' })
    }
    res.json({ success: true, message: 'Holder deleted' })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
})

// Public credential status endpoint for wallet sync
app.get('/credential-status/:id', async (req, res) => {
  try {
    const summary = await getCredentialStatusSummary(req.params.id)
    if (!summary) {
      return res.status(404).json({
        active: false,
        error: 'Credential status not found',
      })
    }

    const isLifecycleValid = summary.status === 'ACTIVE'

    return res.json({
      active: isLifecycleValid,
      overallVerified: isLifecycleValid,
      lifecycleValid: isLifecycleValid,
      cryptographicVerified: true,
      displayStatus: isLifecycleValid ? 'VERIFIED' : summary.status,
      ...summary,
    })
  } catch (error: any) {
    return res.status(500).json({
      active: false,
      error: error.message,
    })
  }
})

// ============================================
// OID4VCI Routes
// ============================================

registerRoutes(app)

// ============================================
// Start Server
// ============================================

async function startServer() {
  // Canonical runtime guard — fail fast if env overrides break did:web consistency
  assertCanonicalRuntimeConfig()

  // Database — required
  const dbConnected = await checkDatabaseConnection()
  if (!dbConnected) {
    console.error('❌ Database connection REQUIRED. Check DATABASE_URL and ensure PostgreSQL is running.')
    process.exit(1)
  }
  console.log('✅ Database connected (PostgreSQL)')

  // Credo-TS Agent — DID & key management
  try {
    await initializeCredoAgent()
    console.log('✅ Credo-TS Agent initialized')
  } catch (agentError: any) {
    console.error('⚠️ Credo Agent initialization failed:', agentError.message)
    console.error('⚠️ Server will start but credential issuance may not work.')
  }

  // JWT VC Generator — load signing key from env
  try {
    await initVCGenerator({
      privateKeyHex: process.env.PRIVATE_KEY_HEX || '',
      did: getIssuerDID(),
    })
    console.log('✅ JWT VC Generator initialized')
  } catch (vcError: any) {
    console.error('⚠️ VC Generator initialization failed:', vcError.message)
  }

  // Periodic cleanup (every hour)
  setInterval(async () => {
    try {
      await cleanupExpiredCredentials()
      await cleanupExpiredTokens()
      await cleanupExpiredAuthCodes()
    } catch (error) {
      console.error('Cleanup error:', error)
    }
  }, 60 * 60 * 1000)

  // Start listening
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log('\n✅ IdentityCredential Issuer (OID4VCI) Started!\n')
    console.log(`🌍 Canonical Base URL: ${BASE_URL}`)
    console.log(`🆔 Canonical Issuer DID: ${ISSUER_DID}`)
    console.log(`🔑 Canonical Signing kid: ${SIGNING_KID}`)
    console.log(`📋 Issuer Metadata: ${BASE_URL}/.well-known/openid-credential-issuer`)
    console.log(`🔑 Authorize: ${ISSUER_ENDPOINTS.authorization}`)
    console.log(`🎫 Token: ${ISSUER_ENDPOINTS.token}`)
    console.log(`📜 Credential: ${ISSUER_ENDPOINTS.credential}`)
    console.log(`💚 Health: ${BASE_URL}/health`)
    console.log(`🔐 Protocol: OID4VCI Authorization Code Flow`)
    console.log(`📦 Credential Format: jwt_vc_json`)
    console.log('🔥 Runtime profile: canonical-domain-only\n')
  })

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received. Shutting down gracefully...`)
    server.close(async () => {
      await shutdownAgent()
      await disconnectDatabase()
      console.log('Server closed.')
      process.exit(0)
    })
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}

startServer().catch(console.error)
