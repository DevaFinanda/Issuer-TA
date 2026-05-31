/**
 * Authorization Routes — Login & Registration
 */

import { Router, type IRouter } from 'express'
import { AuthController } from '../controllers/auth.controller.js'
import { requireApiKey } from '../security/auth.guard.js'

const router: IRouter = Router()

// GET /authorize — Redirect wallet to frontend login page
router.get('/authorize', AuthController.getAuthorize)

// GET /oid4vci/authorize — Dedicated OID4VCI authorize endpoint
router.get('/oid4vci/authorize', AuthController.getAuthorize)

// POST /authorize — Authenticate user + generate auth code
router.post('/authorize', AuthController.postAuthorize)

// POST /oid4vci/authorize — Dedicated OID4VCI authorize endpoint
router.post('/oid4vci/authorize', AuthController.postAuthorize)

// POST /login — Username/password login for credential issuance
router.post('/login', AuthController.postLogin)

// POST /register — Register new holder user
router.post('/register', AuthController.postRegister)

// MODE 1 bootstrap flow
router.post('/bootstrap/request', AuthController.postBootstrapRequest)
router.post('/bootstrap/verify-otp', AuthController.postBootstrapVerifyOtp)
router.post('/bootstrap/admin-approve', requireApiKey, AuthController.postBootstrapAdminApprove)

export default router
