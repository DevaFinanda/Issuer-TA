/**
 * Credential Routes — Credential Offer & Credential Issuance
 */

import { Router, type IRouter } from 'express'
import { OfferController } from '../controllers/offer.controller.js'
import { CredentialController } from '../controllers/credential.controller.js'
import { requireBearerToken } from '../security/auth.guard.js'

const router: IRouter = Router()

// GET /credential-offer — Minimal offer response for wallet
router.get('/credential-offer', OfferController.getSimpleOffer)

// GET /oid4vci/credential-offer — Canonical OID4VCI credential offer endpoint
router.get('/oid4vci/credential-offer', OfferController.getSimpleOffer)

// POST /credential-offer — Create new credential offer + QR code
router.post('/credential-offer', OfferController.createOffer)

// POST /oid4vci/credential-offer — Canonical OID4VCI credential offer endpoint
router.post('/oid4vci/credential-offer', OfferController.createOffer)

// POST /credential-offer-url — Create offer + final wallet URL (/credential-offer?offerId=...)
router.post('/credential-offer-url', OfferController.createOfferUrl)

// GET /credential-offer/:id — Retrieve credential offer by ID (for wallet)
router.get('/credential-offer/:id', OfferController.getOffer)

// GET /oid4vci/credential-offer/:id — Canonical OID4VCI credential offer retrieval
router.get('/oid4vci/credential-offer/:id', OfferController.getOffer)

// POST /credential — Issue credential (requires Bearer token)
router.post('/credential', requireBearerToken, CredentialController.issueCredential)

// POST /oid4vci/credential — Canonical OID4VCI credential endpoint
router.post('/oid4vci/credential', requireBearerToken, CredentialController.issueCredential)

// POST /credential/ssi-native — SSI-native flow with presented VC verification
router.post('/credential/ssi-native', requireBearerToken, CredentialController.issueCredentialSsiNative)

// POST /request-credential — Alias for holder wallet flow
router.post('/request-credential', requireBearerToken, CredentialController.issueCredential)

// GET /wallet/credentials — Sync holder credentials after re-login/app restart
router.get('/wallet/credentials', requireBearerToken, CredentialController.getWalletCredentials)

// GET /credential/status/:id — OID4VCI-compatible credential status endpoint
router.get('/credential/status/:id', CredentialController.getCredentialStatus)

// GET /oid4vci/credential/status/:id — Canonical OID4VCI credential status endpoint
router.get('/oid4vci/credential/status/:id', CredentialController.getCredentialStatus)

export default router
