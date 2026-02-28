import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import { IssuerController } from './controllers/issuer.controller.js'
import {
  sanitizeInput,
  validateCredentialInput,
  rateLimiter,
  securityHeaders,
  auditLogger,
  validateCredentialId,
  requireApiKey
} from './middleware/security.middleware.js'
import { checkDatabaseConnection, disconnectDatabase } from './lib/prisma.js'
import { setUseDatabaseStorage } from './utils/credential-store.js'
import { cleanupExpiredCredentials, getStatistics } from './services/credential.service.js'
import { initializeCredoAgent, shutdownAgent } from './credo-agent.js'

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const PORT = Number(process.env.PORT) || 3000

// Security Middleware (harus di paling atas)
app.use(securityHeaders)
app.use(rateLimiter)

// CORS configuration dengan whitelist
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://localhost:3000').split(',')
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
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-CSRF-Token', 'X-Request-Time']
}))

// Body parser dengan size limit
app.use(express.json({ limit: '10kb' }))
app.use(express.urlencoded({ extended: true, limit: '10kb' }))

// Input sanitization untuk semua request
app.use(sanitizeInput)

// Audit logging
app.use(auditLogger)

// Static files for DID Document
app.use(express.static(path.join(__dirname, '../public')))

// Routes
app.get('/', (req, res) => {
  res.json({
    name: 'BPJS Archive Issuer (Credo-TS)',
    version: '2.0.0',
    description: 'OpenID4VCI Compliant Verifiable Credential Issuer',
    framework: 'Credo-TS + OpenID4VCI + SD-JWT VC + PostgreSQL',
    protocol: 'OpenID for Verifiable Credential Issuance (OID4VCI)',
    endpoints: {
      didDocument: '/.well-known/did.json',
      issuerMetadata: '/oid4vci/.well-known/openid-credential-issuer',
      issue: '/api/issue',
      getCredential: '/api/credential/:id',
      statistics: '/api/stats',
      health: '/health',
    },
    credentialFormat: 'vc+sd-jwt',
    qrCodeContent: 'OpenID4VCI Credential Offer URI (not raw JWT)',
    status: 'running',
  })
})

// ============================================
// OpenID4VCI Protocol Endpoints
// Managed by Credo-TS OpenId4VcIssuerModule — endpoints are registered
// directly on the Express app during agent.initialize().
// No manual router needed — Credo handles:
//   - GET  /oid4vci/<issuerId>/.well-known/openid-credential-issuer
//   - POST /oid4vci/<issuerId>/token
//   - POST /oid4vci/<issuerId>/credential
//   - ... and other OID4VCI protocol endpoints
// ============================================

// Public endpoints
app.get('/.well-known/did.json', IssuerController.getDIDDocument)
app.get('/health', IssuerController.healthCheck)

// Statistics endpoint
app.get('/api/stats', requireApiKey, async (req, res) => {
  try {
    const stats = await getStatistics()
    res.json({ success: true, statistics: stats })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
})

// Protected endpoints dengan validasi
app.post('/api/issue', requireApiKey, validateCredentialInput, IssuerController.issueCredential)
app.get('/api/credential/:id', validateCredentialId, IssuerController.getCredentialById)
app.get('/api/credentials', requireApiKey, IssuerController.getAllCredentials)

// Initialize and start server
async function startServer() {
  // Check database connection - REQUIRED for persistence
  const dbConnected = await checkDatabaseConnection()
  
  if (!dbConnected) {
    console.error('❌ Database connection REQUIRED for data persistence!')
    console.error('❌ Cannot start server without database connection.')
    console.error('❌ Please check DATABASE_URL and ensure PostgreSQL is running.')
    process.exit(1) // Exit if no database - NO FALLBACK MODE
  }
  
  setUseDatabaseStorage(true)
  console.log('✅ Database storage ENABLED - All data will persist permanently')

  // ============================================
  // Initialize Credo Agent (OpenID4VCI)
  // ============================================
  try {
    await initializeCredoAgent(app)
    console.log('✅ Credo-TS Agent initialized - OpenID4VCI protocol active')
  } catch (agentError: any) {
    console.error('⚠️ Credo Agent initialization failed:', agentError.message)
    console.error('⚠️ The server will start but credential issuance may not work.')
    console.error('⚠️ Ensure @credo-ts packages and @hyperledger/aries-askar-nodejs are installed.')
  }
  
  // Setup periodic cleanup (every hour)
  setInterval(async () => {
    try {
      await cleanupExpiredCredentials()
    } catch (error) {
      console.error('Cleanup error:', error)
    }
  }, 60 * 60 * 1000)
  
  // Start server - bind to 0.0.0.0 agar dapat diakses dari luar
  const server = app.listen(PORT, '0.0.0.0', () => {
    const vpsIP = process.env.ISSUER_DOMAIN?.split(':')[0] || '202.155.132.71'
    console.log('\n✅ BPJS Archive Issuer (Credo-TS + OpenID4VCI) Started!\n')
    console.log(`🚀 Server: http://0.0.0.0:${PORT}`)
    console.log(`🌐 Local: http://localhost:${PORT}`)
    console.log(`🌍 External: http://${vpsIP}:${PORT}`)
    console.log(`📄 DID Document: http://${vpsIP}:${PORT}/.well-known/did.json`)
    console.log(`📋 Issuer Metadata: http://${vpsIP}:${PORT}/oid4vci/.well-known/openid-credential-issuer`)
    console.log(`📮 Issue API: http://${vpsIP}:${PORT}/api/issue`)
    console.log(`📊 Statistics: http://${vpsIP}:${PORT}/api/stats`)
    console.log(`💚 Health: http://${vpsIP}:${PORT}/health`)
    console.log(`🗄️  Database: ${dbConnected ? 'Connected (PostgreSQL)' : 'Fallback (In-memory)'}`)
    console.log(`🔐 Protocol: OpenID4VCI (Pre-Authorized Code Flow)`)
    console.log(`📦 Credential Format: vc+sd-jwt (SD-JWT Verifiable Credential)`)
    console.log(`🔥 CORS Allowed Origins: ${allowedOrigins.join(', ')}\n`)
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
