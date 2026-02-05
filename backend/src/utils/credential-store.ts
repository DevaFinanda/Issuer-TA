/**
 * Credential Store - Hybrid Mode
 * Supports both in-memory (for development/fallback) and database storage
 * 
 * Database storage is preferred in production for persistence
 */

import { 
  storeCredentialDB, 
  getCredentialDB,
  cleanupExpiredCredentials as dbCleanup,
  type CredentialWithId
} from '../services/credential.service.js'

interface StoredCredential {
  id: string
  sdJwt: string
  credentialData: any
  issuedAt: string
  expiresAt: string
}

// In-memory fallback storage
const credentialStore = new Map<string, StoredCredential>()

// Check if database is available
let useDatabaseStorage = true

export function setUseDatabaseStorage(use: boolean) {
  useDatabaseStorage = use
  console.log(`📦 Storage mode: ${use ? 'Database' : 'In-memory'}`)
}

/**
 * Store credential with unique ID
 * Uses database if available, falls back to in-memory
 */
export function storeCredential(credential: StoredCredential): string {
  // Always store in memory as backup
  credentialStore.set(credential.id, credential)
  
  // Try to store in database (async, non-blocking)
  if (useDatabaseStorage) {
    // Note: Database storage is handled separately in controller
    // This keeps backward compatibility
  }
  
  return credential.id
}

/**
 * Retrieve credential by ID
 * Checks database first, then falls back to in-memory
 */
export async function getCredentialAsync(id: string): Promise<StoredCredential | undefined> {
  // Try database first
  if (useDatabaseStorage) {
    try {
      const dbCredential = await getCredentialDB(id)
      if (dbCredential) {
        return dbCredential as StoredCredential
      }
    } catch (error) {
      console.warn('⚠️ Database read failed, using in-memory fallback')
    }
  }
  
  // Fallback to in-memory
  return credentialStore.get(id)
}

/**
 * Synchronous get (for backward compatibility)
 * Only checks in-memory storage
 */
export function getCredential(id: string): StoredCredential | undefined {
  return credentialStore.get(id)
}

/**
 * Delete expired credentials (cleanup)
 */
export function cleanupExpiredCredentials(): void {
  const now = new Date()
  
  // Clean in-memory store
  for (const [id, cred] of credentialStore.entries()) {
    if (new Date(cred.expiresAt) < now) {
      credentialStore.delete(id)
    }
  }
  
  // Clean database (async)
  if (useDatabaseStorage) {
    dbCleanup().catch(err => {
      console.warn('⚠️ Database cleanup failed:', err.message)
    })
  }
}

// Cleanup every hour
setInterval(cleanupExpiredCredentials, 60 * 60 * 1000)

