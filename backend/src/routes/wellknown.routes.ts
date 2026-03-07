/**
 * Well-Known Routes — OID4VCI Issuer Discovery
 */

import { Router, type IRouter } from 'express'
import { MetadataController } from '../controllers/metadata.controller.js'

const router: IRouter = Router()

// GET /.well-known/openid-credential-issuer
router.get('/openid-credential-issuer', MetadataController.getIssuerMetadata)

export default router
