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
import { cleanupExpiredCredentials, getStatistics } from './services/credential.service.js'
import { cleanupExpiredTokens } from './services/token.service.js'
import { cleanupExpiredAuthCodes } from './services/auth.service.js'
import { requireApiKey } from './security/auth.guard.js'

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const PORT = Number(process.env.PORT) || 3001

// Trust the first hop proxy (Nginx)
app.set('trust proxy', 1)

// ============================================
// Global Middleware
// ============================================

app.use(securityHeaders)
app.use(rateLimiter)

// CORS
const FALLBACK_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://202.155.132.71:3000',
  'http://202.155.132.71',
]
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : FALLBACK_ORIGINS

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true)
    } else {
      callback(new Error('Not allowed by CORS'))
    }
  },
  credentials: true,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-CSRF-Token', 'X-Request-Time'],
}))

app.use(express.json({ limit: '10kb' }))
app.use(express.urlencoded({ extended: true, limit: '10kb' }))
app.use(sanitizeInput)
app.use(auditLogger)

// Static files (DID Document, etc.)
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
    endpoints: {
      issuerMetadata: '/.well-known/openid-credential-issuer',
      authorize: '/authorize',
      token: '/token',
      credential: '/credential',
      credentialOffer: '/credential-offer',
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

// ============================================
// OID4VCI Routes
// ============================================

registerRoutes(app)

// ============================================
// Start Server
// ============================================

async function startServer() {
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
    const domain = process.env.ISSUER_DOMAIN?.split(':')[0] || 'localhost'
    console.log('\n✅ IdentityCredential Issuer (OID4VCI) Started!\n')
    console.log(`🚀 Server: http://0.0.0.0:${PORT}`)
    console.log(`🌐 Local: http://localhost:${PORT}`)
    console.log(`🌍 External: http://${domain}:${PORT}`)
    console.log(`📋 Issuer Metadata: http://${domain}:${PORT}/.well-known/openid-credential-issuer`)
    console.log(`🔑 Authorize: http://${domain}:${PORT}/authorize`)
    console.log(`🎫 Token: http://${domain}:${PORT}/token`)
    console.log(`📜 Credential: http://${domain}:${PORT}/credential`)
    console.log(`💚 Health: http://${domain}:${PORT}/health`)
    console.log(`🔐 Protocol: OID4VCI Authorization Code Flow`)
    console.log(`📦 Credential Format: jwt_vc_json`)
    console.log(`🔥 CORS: ${allowedOrigins.join(', ')}\n`)
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
