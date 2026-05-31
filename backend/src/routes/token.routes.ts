/**
 * Token Routes — OID4VCI Token Exchange
 */

import { Router, type IRouter } from 'express'
import { TokenController } from '../controllers/token.controller.js'

const router: IRouter = Router()

// POST /token — Exchange authorization code for access token
router.post('/token', TokenController.exchangeToken)

// POST /oid4vci/token — Canonical OID4VCI token endpoint
router.post('/oid4vci/token', TokenController.exchangeToken)

export default router
