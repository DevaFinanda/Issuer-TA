/**
 * Metadata Controller — OID4VCI Issuer Discovery
 * 
 * Implements: GET /.well-known/openid-credential-issuer
 */

import { Request, Response } from 'express'
import type { IssuerMetadata } from '../models/types.js'

export class MetadataController {
  /**
   * GET /.well-known/openid-credential-issuer
   * 
   * Returns OID4VCI issuer metadata for wallet discovery.
   * Follows OpenID4VCI Section 10.2 — Credential Issuer Metadata
   */
  static getIssuerMetadata(req: Request, res: Response) {
    const issuerBaseUrl = process.env.ISSUER_BASE_URL || `http://localhost:${process.env.PORT || 3001}`
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000'

    const metadata: IssuerMetadata = {
      credential_issuer: issuerBaseUrl,
      authorization_endpoint: `${issuerBaseUrl}/authorize`,
      token_endpoint: `${issuerBaseUrl}/token`,
      credential_endpoint: `${issuerBaseUrl}/credential`,
      credentials_supported: [
        {
          format: 'jwt_vc_json',
          types: ['VerifiableCredential', 'IdentityCredential'],
        },
      ],
    }

    res.json(metadata)
  }
}
