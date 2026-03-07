/**
 * Route Index — Mount all route groups
 */

import { Express } from 'express'
import wellknownRoutes from './wellknown.routes.js'
import authRoutes from './auth.routes.js'
import tokenRoutes from './token.routes.js'
import credentialRoutes from './credential.routes.js'

/**
 * Register all OID4VCI routes on the Express app
 */
export function registerRoutes(app: Express) {
  // OID4VCI Discovery
  app.use('/.well-known', wellknownRoutes)

  // Authorization (login + register)
  app.use('/', authRoutes)

  // Token exchange
  app.use('/', tokenRoutes)

  // Credential offer + credential issuance
  app.use('/', credentialRoutes)
}
