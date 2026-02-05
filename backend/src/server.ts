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

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const PORT = process.env.PORT || 3000

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
    name: 'BPJS Archive Issuer (Stable)',
    version: '1.0.0',
    description: 'DID Web Issuer using did-jwt (Production Ready)',
    framework: 'did-jwt + did-jwt-vc + SD-JWT + PostgreSQL',
    endpoints: {
      didDocument: '/.well-known/did.json',
      issue: '/api/issue',
      getCredential: '/api/credential/:id',
      statistics: '/api/stats',
      health: '/health',
    },
    status: 'running',
  })
})

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

// Initialize and start server
async function startServer() {
  // Check database connection
  const dbConnected = await checkDatabaseConnection()
  setUseDatabaseStorage(dbConnected)
  
  if (!dbConnected) {
    console.warn('⚠️  Running in fallback mode (in-memory storage)')
    console.warn('⚠️  Data will be lost on server restart!')
  }
  
  // Setup periodic cleanup (every hour)
  setInterval(async () => {
    try {
      await cleanupExpiredCredentials()
    } catch (error) {
      console.error('Cleanup error:', error)
    }
  }, 60 * 60 * 1000)
  
  // Start server
  const server = app.listen(PORT, () => {
    console.log('\n✅ BPJS Archive Issuer (Stable) Started!\n')
    console.log(`🚀 Server: http://localhost:${PORT}`)
    console.log(`📄 DID Document: http://localhost:${PORT}/.well-known/did.json`)
    console.log(`📮 Issue API: http://localhost:${PORT}/api/issue`)
    console.log(`📊 Statistics: http://localhost:${PORT}/api/stats`)
    console.log(`💚 Health: http://localhost:${PORT}/health`)
    console.log(`🗄️  Database: ${dbConnected ? 'Connected (PostgreSQL)' : 'Fallback (In-memory)'}\n`)
  })
  
  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received. Shutting down gracefully...`)
    server.close(async () => {
      await disconnectDatabase()
      console.log('Server closed.')
      process.exit(0)
    })
  }
  
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}

startServer().catch(console.error)
