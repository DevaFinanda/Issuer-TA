import { Router, type IRouter } from 'express'
import { RegistryController } from '../controllers/registry.controller.js'
import { requireApiKey } from '../security/auth.guard.js'

const router: IRouter = Router()

// Import identities from trusted source payload (JSON array)
router.post('/api/registry/import', requireApiKey, RegistryController.importIdentities)

// Read registry identity by NIK
router.get('/api/registry/identities/:nik', requireApiKey, RegistryController.getIdentityByNik)

// Trust list management for SSI-native external issuers
router.post('/api/trusted-issuers', requireApiKey, RegistryController.upsertTrustedIssuer)
router.get('/api/trusted-issuers', requireApiKey, RegistryController.listTrustedIssuers)

export default router
