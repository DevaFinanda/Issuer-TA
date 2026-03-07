/**
 * Credential Routes — Credential Offer & Credential Issuance
 */

import { Router, type IRouter } from 'express'
import { OfferController } from '../controllers/offer.controller.js'
import { CredentialController } from '../controllers/credential.controller.js'
import { requireBearerToken } from '../security/auth.guard.js'

const router: IRouter = Router()

// POST /credential-offer — Create new credential offer + QR code
router.post('/credential-offer', OfferController.createOffer)

// GET /credential-offer/:id — Retrieve credential offer by ID (for wallet)
router.get('/credential-offer/:id', OfferController.getOffer)

// POST /credential — Issue credential (requires Bearer token)
router.post('/credential', requireBearerToken, CredentialController.issueCredential)

export default router
