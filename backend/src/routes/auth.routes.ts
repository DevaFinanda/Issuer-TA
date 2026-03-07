/**
 * Authorization Routes — Login & Registration
 */

import { Router, type IRouter } from 'express'
import { AuthController } from '../controllers/auth.controller.js'

const router: IRouter = Router()

// GET /authorize — Redirect wallet to frontend login page
router.get('/authorize', AuthController.getAuthorize)

// POST /authorize — Authenticate user + generate auth code
router.post('/authorize', AuthController.postAuthorize)

// POST /register — Register new holder user
router.post('/register', AuthController.postRegister)

export default router
