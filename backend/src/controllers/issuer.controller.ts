import { Request, Response } from 'express'
import { createSigner, getIssuerDID, getPrivateKey, resolver } from '../agent.js'
import * as didJWT from 'did-jwt'
import { createVerifiableCredentialJwt } from 'did-jwt-vc'
import QRCode from 'qrcode'
import { createSelectiveDisclosureJWT, parseSDJWT } from '../utils/sd-jwt.utils.js'
import { storeCredential, getCredentialAsync } from '../utils/credential-store.js'
import { storeCredentialDB } from '../services/credential.service.js'
import * as crypto from 'crypto'

interface IssueCredentialRequest {
  documentId: string
  documentHash: string
  documentType: string
  holderDID: string
  holderName: string
  noBPJS: string
  nik: string
  tanggalLahir: string
  alamat: string
  metadata?: Record<string, any>
}

export class IssuerController {
  /**
   * Issue Verifiable Credential (W3C + JWT)
   */
  static async issueCredential(req: Request, res: Response) {
    try {
      console.log('🔍 Issue credential request:', req.body)

      const {
        documentId,
        documentHash,
        documentType,
        holderDID,
        holderName,
        noBPJS,
        nik,
        tanggalLahir,
        alamat,
        metadata,
      } = req.body as IssueCredentialRequest

      // Validation
      if (!documentId || !documentHash || !holderDID || !holderName || !noBPJS || !nik) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields',
        })
      }

      const issuerDID = getIssuerDID()
      const privateKey = getPrivateKey()
      const signer = createSigner(privateKey)

      // Create W3C VC 2.0 Compliant Verifiable Credential payload
      const now = new Date()
      const expiryDate = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000) // 1 year
      
      const vcPayload = {
        sub: holderDID,
        vc: {
          '@context': [
            'https://www.w3.org/ns/credentials/v2',
            'https://www.w3.org/2018/credentials/v1',
            'https://www.w3.org/2018/credentials/examples/v1',
          ],
          type: ['VerifiableCredential', 'BPJSDocumentCredential'],
          id: `urn:uuid:${crypto.randomBytes(16).toString('hex')}`,
          issuer: {
            id: issuerDID,
            name: process.env.ISSUER_NAME || 'BPJS Kesehatan',
          },
          issuanceDate: now.toISOString(),
          validFrom: now.toISOString(),
          validUntil: expiryDate.toISOString(),
          credentialSubject: {
            id: holderDID,
            type: 'BPJSMember',
            holderName,
            noBPJS,
            nik,
            tanggalLahir,
            alamat,
            document: {
              documentId,
              documentHash,
              documentType,
            },
            metadata: metadata || {},
          },
        },
      }

      // Create SD-JWT with selective disclosure for privacy
      console.log('🔐 Creating SD-JWT with selective disclosure...')
      const { sdJwt, disclosures, prettyClaims } = await createSelectiveDisclosureJWT(
        vcPayload,
        privateKey,
        issuerDID
      )

      const parsed = parseSDJWT(sdJwt)
      
      console.log('✅ SD-JWT created with', disclosures.length, 'selective disclosures')
      console.log('🔒 Selectively disclosable fields:', Object.keys(prettyClaims))

      // Use expiryDate from above
      const issuedAt = now.toISOString()
      const expiresAt = expiryDate.toISOString()

      // Store credential in database - NO FALLBACK, database required
      const credentialId = await storeCredentialDB({
        sdJwt,
        holderDID,
        holderName,
        documentId,
        documentHash,
        documentType,
        noBPJS,
        nik,
        tanggalLahir,
        alamat,
        metadata,
        issuerDID,
        issuerName: process.env.ISSUER_NAME || 'BPJS Kesehatan',
        validUntil: expiryDate,
      })
      
      console.log('💾 Credential PERMANENTLY stored in database with ID:', credentialId)
      console.log('✅ Data will persist across server restarts and page refreshes')

      // Generate QR Code berisi SD-JWT credential lengkap
      // Format: jwt~disclosure1~disclosure2~...~
      // Holder wallet akan scan dan parse SD-JWT ini untuk disimpan
      const qrCode = await QRCode.toDataURL(sdJwt, {
        errorCorrectionLevel: 'L', // Low correction = more data capacity
        width: 512,
        margin: 1,
        scale: 4,
        type: 'image/png'
      })

      console.log('✅ SD-JWT Credential issued successfully')
      console.log('📦 QR Code contains SD-JWT with EdDSA signature')
      console.log('📏 SD-JWT size:', sdJwt.length, 'characters')
      console.log('🔐 Selective disclosure fields:', Object.keys(prettyClaims))
      console.log('🔗 Credential URL: /api/credential/' + credentialId)

      res.json({
        success: true,
        message: 'W3C Verifiable Credential issued successfully',
        qrCode,
        credentialId,
        credential: sdJwt,
        credentialData: {
          '@context': 'https://www.w3.org/2018/credentials/v1',
          type: ['VerifiableCredential', 'BPJSHealthCredential'],
          format: 'vc+sd-jwt',
          algorithm: 'EdDSA (Ed25519)',
          issuer: {
            id: getIssuerDID(),
            name: process.env.ISSUER_NAME || 'BPJS Kesehatan'
          },
          hashAlgorithm: 'SHA-256',
          selectiveDisclosure: {
            enabled: true,
            fields: Object.keys(prettyClaims),
            disclosureCount: parsed.disclosures.length,
            mechanism: 'hash-based'
          },
          proof: {
            type: 'Ed25519Signature2020',
            created: new Date().toISOString(),
            verificationMethod: getIssuerDID() + '#key-1',
            proofPurpose: 'assertionMethod'
          },
          selectiveClaims: prettyClaims,
        },
      })
    } catch (error: any) {
      console.error('❌ Error:', error)
      res.status(500).json({
        success: false,
        error: 'Failed to issue credential',
        message: error.message,
      })
    }
  }

  /**
   * Get credential by ID (for holder to fetch)
   */
  static async getCredentialById(req: Request, res: Response) {
    try {
      const { id } = req.params
      console.log('📥 Fetching credential:', id)

      // Fetch from database only (no fallback)
      const stored = await getCredentialAsync(id)

      if (!stored) {
        return res.status(404).json({
          success: false,
          error: 'Credential not found or expired',
        })
      }

      console.log('✅ Credential retrieved from database')

      res.json({
        success: true,
        credential: stored.sdJwt,
        credentialData: stored.credentialData,
        issuedAt: stored.issuedAt,
        expiresAt: stored.expiresAt,
      })
    } catch (error: any) {
      console.error('❌ Error:', error)
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve credential',
        message: error.message,
      })
    }
  }

  /**
   * Get all credentials (for dashboard)
   */
  static async getAllCredentials(req: Request, res: Response) {
    try {
      console.log('📥 Fetching all credentials from database')
      
      // Import service function
      const { getAllCredentialsFromDB } = await import('../services/credential.service.js')
      const credentials = await getAllCredentialsFromDB()

      console.log(`✅ Retrieved ${credentials.length} credentials from database`)

      res.json({
        success: true,
        count: credentials.length,
        credentials: credentials,
      })
    } catch (error: any) {
      console.error('❌ Error:', error)
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve credentials',
        message: error.message,
      })
    }
  }

  /**
   * Get DID Document
   */
  static async getDIDDocument(req: Request, res: Response) {
    try {
      const did = getIssuerDID()
      const didDoc = await resolver.resolve(did)

      if (didDoc.didDocument) {
        res.json(didDoc.didDocument)
      } else {
        res.status(404).json({ error: 'DID Document not found' })
      }
    } catch (error: any) {
      console.error('❌ Error:', error)
      res.status(500).json({
        error: 'Failed to resolve DID',
        message: error.message,
      })
    }
  }

  /**
   * Health check
   */
  static async healthCheck(req: Request, res: Response) {
    try {
      const privateKey = process.env.PRIVATE_KEY_HEX
      const isConfigured = !!privateKey

      res.json({
        status: isConfigured ? 'healthy' : 'not configured',
        timestamp: new Date().toISOString(),
        issuerDID: getIssuerDID(),
        configured: isConfigured,
      })
    } catch (error: any) {
      res.status(500).json({
        status: 'unhealthy',
        error: error.message,
      })
    }
  }
}
