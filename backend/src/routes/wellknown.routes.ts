/**
 * Well-Known Routes — OID4VCI Issuer Discovery
 */

import { Router, type IRouter } from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'
import { MetadataController } from '../controllers/metadata.controller.js'
import { ISSUER_DID, SIGNING_KID } from '../lib/issuer-url.js'

const router: IRouter = Router()
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// GET /.well-known/did.json
router.get('/did.json', (_req, res) => {
	const didPath = path.join(__dirname, '../../public/.well-known/did.json')
	res.type('application/did+json')

	try {
		const raw = fs.readFileSync(didPath, 'utf8')
		const parsed = JSON.parse(raw) as Record<string, unknown>
		const keyId = SIGNING_KID

		const verificationMethod =
			(Array.isArray(parsed.verificationMethod) && parsed.verificationMethod[0] && typeof parsed.verificationMethod[0] === 'object')
				? (parsed.verificationMethod[0] as Record<string, unknown>)
				: undefined
		const publicKeyMultibase = typeof verificationMethod?.publicKeyMultibase === 'string'
			? verificationMethod.publicKeyMultibase
			: undefined

		if (!publicKeyMultibase) {
			throw new Error('DID document is missing publicKeyMultibase')
		}

		const didDocument = {
			'@context': [
				'https://www.w3.org/ns/did/v1',
				'https://w3id.org/security/suites/jws-2020/v1',
			],
			id: ISSUER_DID,
			verificationMethod: [
				{
					id: keyId,
					type: 'Ed25519VerificationKey2020',
					controller: ISSUER_DID,
					publicKeyMultibase,
				},
			],
			assertionMethod: [keyId],
		}

		return res.json(didDocument)
	} catch {
		return res.sendFile(didPath)
	}
})

// GET /.well-known/openid-credential-issuer
router.get('/openid-credential-issuer', MetadataController.getIssuerMetadata)

// GET /.well-known/oauth-authorization-server
router.get('/oauth-authorization-server', MetadataController.getAuthorizationServerMetadata)

// GET /.well-known/openid-configuration
router.get('/openid-configuration', MetadataController.getOpenIdConfiguration)

export default router
