import { Request, Response } from 'express'
import QRCode from 'qrcode'
import { storeCredentialDB } from '../services/credential.service.js'
import {
  createCredentialOffer,
  getIssuerDID,
  isAgentReady,
} from '../credo-agent.js'
import { getCredentialAsync } from '../utils/credential-store.js'
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
   * Issue Verifiable Credential via OpenID4VCI Protocol
   * 
   * Creates a credential offer (not the credential itself).
   * The actual SD-JWT VC is created on-demand when the holder resolves
   * the offer and requests the credential through the OID4VCI protocol.
   * 
   * Flow:
   * 1. Admin submits form data → this endpoint
   * 2. Credo agent creates a credential offer URI
   * 3. QR code encodes the credential offer URI (short, ~100-300 chars)
   * 4. Holder scans QR → resolves offer → receives SD-JWT VC
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

      // Check if Credo agent is ready
      if (!isAgentReady()) {
        return res.status(503).json({
          success: false,
          error: 'Credential agent is not initialized. Please wait and try again.',
        })
      }

      const issuerDID = getIssuerDID()
      const now = new Date()
      const expiryDate = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000) // 1 year

      // ============================================
      // Step 1: Create Credential Offer via OID4VCI
      // ============================================
      console.log('📋 Creating OpenID4VCI credential offer...')
      
      const { credentialOfferUri, issuanceSessionId } = await createCredentialOffer({
        holderDID,
        holderName,
        noBPJS,
        nik,
        tanggalLahir,
        alamat,
        documentId,
        documentHash,
        documentType,
        additionalMetadata: metadata,
      })

      // ============================================
      // Step 2: Store credential record in database
      // ============================================
      const credentialId = await storeCredentialDB({
        credentialOfferUri,
        issuanceSessionId,
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

      console.log('💾 Credential offer stored in database with ID:', credentialId)

      // ============================================
      // Step 3: Generate QR Code with Credential Offer URI
      // ============================================
      // The QR code now contains a SHORT credential offer URI
      // instead of the entire SD-JWT (which was 2KB+)
      // This is compliant with OpenID4VCI specification
      const qrCode = await QRCode.toDataURL(credentialOfferUri, {
        errorCorrectionLevel: 'M', // Medium correction (offer URI is short)
        width: 512,
        margin: 2,
        type: 'image/png',
      })

      console.log('✅ Credential offer created successfully (OpenID4VCI)')
      console.log('📦 QR Code contains credential offer URI (not raw JWT)')
      console.log('📏 Offer URI length:', credentialOfferUri.length, 'characters')
      console.log('🔗 Credential ID:', credentialId)
      console.log('📝 Issuance Session:', issuanceSessionId)

      res.json({
        success: true,
        message: 'Credential offer created successfully (OpenID4VCI)',
        qrCode,
        credentialId,
        credentialOfferUri,
        issuanceSessionId,
        credentialData: {
          '@context': 'https://www.w3.org/2018/credentials/v1',
          type: ['VerifiableCredential', 'BPJSHealthCredential'],
          format: 'vc+sd-jwt',
          protocol: 'OpenID4VCI (Pre-Authorized Code Flow)',
          algorithm: 'EdDSA (Ed25519)',
          issuer: {
            id: issuerDID,
            name: process.env.ISSUER_NAME || 'BPJS Kesehatan',
          },
          selectiveDisclosure: {
            enabled: true,
            fields: ['holderName', 'noBPJS', 'nik', 'tanggalLahir', 'alamat'],
            mechanism: 'SD-JWT (hash-based)',
          },
          proof: {
            type: 'Ed25519Signature2020',
            created: now.toISOString(),
            verificationMethod: issuerDID + '#key-1',
            proofPurpose: 'assertionMethod',
          },
          holderInfo: {
            holderName,
            noBPJS,
            documentType,
          },
          offerInfo: {
            credentialOfferUri,
            issuanceSessionId,
            expiresAt: expiryDate.toISOString(),
            flow: 'pre-authorized_code',
            description: 'Scan QR code dengan wallet holder untuk menerima credential',
          },
        },
      })
    } catch (error: any) {
      console.error('❌ Error:', error)
      res.status(500).json({
        success: false,
        error: 'Failed to create credential offer',
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
   * Serves the did:web DID document for backward compatibility
   * The Credo agent uses did:key internally for credential signing
   */
  static async getDIDDocument(req: Request, res: Response) {
    try {
      // Serve the static DID document from public/.well-known/did.json
      // For did:key resolution, Credo handles it internally
      const did = getIssuerDID()
      
      res.json({
        '@context': [
          'https://www.w3.org/ns/did/v1',
          'https://w3id.org/security/suites/ed25519-2020/v1',
        ],
        id: did,
        verificationMethod: [
          {
            id: `${did}#key-1`,
            type: 'Ed25519VerificationKey2020',
            controller: did,
          },
        ],
        authentication: [`${did}#key-1`],
        assertionMethod: [`${did}#key-1`],
      })
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
      const agentReady = isAgentReady()

      res.json({
        status: agentReady ? 'healthy' : 'not configured',
        timestamp: new Date().toISOString(),
        issuerDID: getIssuerDID(),
        configured: agentReady,
        agent: {
          framework: 'Credo-TS (OpenWallet Foundation)',
          protocol: 'OpenID4VCI',
          credentialFormat: 'vc+sd-jwt',
          status: agentReady ? 'running' : 'initializing',
        },
      })
    } catch (error: any) {
      res.status(500).json({
        status: 'unhealthy',
        error: error.message,
      })
    }
  }
}
