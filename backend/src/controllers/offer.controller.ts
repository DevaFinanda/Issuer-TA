/**
 * Credential Offer Controller — OID4VCI Credential Offer
 * 
 * Implements:
 *   POST /credential-offer      — Create new credential offer + QR code
 *   GET  /credential-offer/:id  — Retrieve credential offer by ID (for wallet)
 */

import { Request, Response } from 'express'
import crypto from 'crypto'
import { prisma } from '../lib/prisma.js'
import { generateQRCode } from '../credential/qr-generator.js'
import type { CredentialOffer } from '../models/types.js'
import { getIssuerDID } from '../credo-agent.js'
import { BASE_URL, ISSUER_ENDPOINTS } from '../lib/issuer-url.js'

export class OfferController {
  private static isPreAuthorizedDefaultEnabled(): boolean {
    // Generic issuer offers are multi-user and do not always have a stable
    // holder DID mapping yet, so pre-authorized flow must be opt-in.
    const raw = String(process.env.OID4VCI_ENABLE_PREAUTHORIZED_BY_DEFAULT || 'false').trim().toLowerCase()
    return raw !== 'false'
  }

  private static async getOfferById(offerId: string, res: Response) {
    const offer = await prisma.credentialOffer.findUnique({
      where: { id: offerId },
    })

    if (!offer) {
      return res.status(404).json({
        error: 'Credential offer not found',
      })
    }

    if (offer.expiresAt < new Date()) {
      return res.status(410).json({
        error: 'Credential offer has expired',
      })
    }

    if (offer.used) {
      return res.status(410).json({
        error: 'Credential offer has already been used',
      })
    }

    await prisma.credentialOffer.update({
      where: { id: offerId },
      data: { used: true },
    })

    return res.json(offer.offerData)
  }

  /**
   * POST /credential-offer-url
   *
   * Helper endpoint for wallet integrations.
   * Creates a fresh offer and returns scan URL in this exact format:
   *   https://issuer.identia.my.id/credential-offer?offerId=<id>
   */
  static async createOfferUrl(req: Request, res: Response) {
    try {
      const offerId = crypto.randomUUID()
      const usePreAuthorized = OfferController.isPreAuthorizedDefaultEnabled()
      const preAuthorizedCode = usePreAuthorized ? crypto.randomBytes(24).toString('hex') : undefined

      const credentialOffer: CredentialOffer = {
        credential_issuer: BASE_URL,
        credential_configuration_ids: ['kartu_bpjs_kesehatan'],
        grants: {
          authorization_code: {
            issuer_state: offerId,
            authorization_server: BASE_URL,
          },
          ...(usePreAuthorized
            ? {
              'urn:ietf:params:oauth:grant-type:pre-authorized_code': {
                'pre-authorized_code': preAuthorizedCode!,
                user_pin_required: false,
              },
            }
            : {}),
        },
      }

      const expiresAt = new Date(Date.now() + 10 * 60 * 1000)

      await prisma.credentialOffer.create({
        data: {
          id: offerId,
          offerData: credentialOffer as any,
          expiresAt,
        },
      })

      if (preAuthorizedCode) {
        await prisma.issuerConfig.upsert({
          where: { key: `pre-auth-code:${preAuthorizedCode}` },
          update: {
            value: JSON.stringify({
              offerId,
              code: preAuthorizedCode,
              expiresAt: expiresAt.toISOString(),
              used: false,
            }),
            description: 'OID4VCI pre-authorized code metadata',
          },
          create: {
            key: `pre-auth-code:${preAuthorizedCode}`,
            value: JSON.stringify({
              offerId,
              code: preAuthorizedCode,
              expiresAt: expiresAt.toISOString(),
              used: false,
            }),
            description: 'OID4VCI pre-authorized code metadata',
          },
        })
      }

      const walletOfferUrl = `${ISSUER_ENDPOINTS.credentialOffer}?offerId=${encodeURIComponent(offerId)}`
      const qrCode = await generateQRCode(walletOfferUrl)

      return res.json({
        success: true,
        offerId,
        walletOfferUrl,
        pre_authorized_code: preAuthorizedCode,
        qrCode,
        expiresAt: expiresAt.toISOString(),
      })
    } catch (error: any) {
      console.error('❌ Error creating wallet offer URL:', error.message)
      return res.status(500).json({
        success: false,
        error: 'Failed to create wallet offer URL',
        message: error.message,
      })
    }
  }

  /**
   * GET /credential-offer
   *
   * Returns a simplified credential offer payload for wallet bootstrap.
   */
  static async getSimpleOffer(req: Request, res: Response) {
    const offerId = req.query.offerId?.toString()
    if (offerId) {
      return OfferController.getOfferById(offerId, res)
    }

    return res.json({
      credentialType: ['VerifiableCredential', 'KartuBPJSKesehatan'],
      issuerDid: getIssuerDID(),
      authorizationEndpoint: ISSUER_ENDPOINTS.authorization,
    })
  }

  /**
   * POST /credential-offer
   * 
   * Creates a new credential offer with authorization_code grant.
   * Returns the offer object, openid-credential-offer:// URI, and QR code.
   */
  static async createOffer(req: Request, res: Response) {
    try {
      // Generate unique offer ID
      const offerId = crypto.randomUUID()

      // Build credential offer object (OID4VCI spec)
      const usePreAuthorized = req.body?.use_pre_authorized_code === undefined
        ? OfferController.isPreAuthorizedDefaultEnabled()
        : Boolean(req.body?.use_pre_authorized_code)
      const preAuthorizedCode = usePreAuthorized ? crypto.randomBytes(24).toString('hex') : undefined

      const credentialOffer: CredentialOffer = {
        credential_issuer: BASE_URL,
        credential_configuration_ids: ['kartu_bpjs_kesehatan'],
        grants: {
          authorization_code: {
            issuer_state: offerId,
            authorization_server: BASE_URL,
          },
          ...(usePreAuthorized
            ? {
              'urn:ietf:params:oauth:grant-type:pre-authorized_code': {
                'pre-authorized_code': preAuthorizedCode!,
                user_pin_required: false,
              },
            }
            : {}),
        },
      }

      // Store the offer in database with 10-minute expiry
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000)

      await prisma.credentialOffer.create({
        data: {
          id: offerId,
          offerData: credentialOffer as any,
          expiresAt,
        },
      })

      if (preAuthorizedCode) {
        await prisma.issuerConfig.upsert({
          where: { key: `pre-auth-code:${preAuthorizedCode}` },
          update: {
            value: JSON.stringify({
              offerId,
              code: preAuthorizedCode,
              expiresAt: expiresAt.toISOString(),
              used: false,
            }),
            description: 'OID4VCI pre-authorized code metadata',
          },
          create: {
            key: `pre-auth-code:${preAuthorizedCode}`,
            value: JSON.stringify({
              offerId,
              code: preAuthorizedCode,
              expiresAt: expiresAt.toISOString(),
              used: false,
            }),
            description: 'OID4VCI pre-authorized code metadata',
          },
        })
      }

      // Build openid-credential-offer:// URI
      const credentialOfferUri = `openid-credential-offer://?credential_offer_uri=${encodeURIComponent(
        `${ISSUER_ENDPOINTS.credentialOffer}/${offerId}`
      )}`

      const walletOfferUrl = `${ISSUER_ENDPOINTS.credentialOffer}?offerId=${encodeURIComponent(offerId)}`

      // Generate QR code from the URI
      const qrCode = await generateQRCode(credentialOfferUri)
      const walletQrCode = await generateQRCode(walletOfferUrl)

      console.log('📋 Credential offer created')
      console.log('🆔 Offer ID:', offerId)
      console.log('🔗 Offer URI:', credentialOfferUri)

      res.json({
        success: true,
        offerId,
        credentialOffer,
        credentialOfferUri,
        pre_authorized_code: preAuthorizedCode,
        walletOfferUrl,
        qrCode,
        walletQrCode,
        expiresAt: expiresAt.toISOString(),
      })
    } catch (error: any) {
      console.error('❌ Error creating credential offer:', error.message)
      res.status(500).json({
        success: false,
        error: 'Failed to create credential offer',
        message: error.message,
      })
    }
  }

  /**
   * GET /credential-offer/:id
   * 
   * Returns the stored credential offer JSON.
   * Called by the wallet after scanning the QR code.
   */
  static async getOffer(req: Request, res: Response) {
    try {
      const { id } = req.params
      return OfferController.getOfferById(id, res)
    } catch (error: any) {
      console.error('❌ Error retrieving credential offer:', error.message)
      res.status(500).json({
        error: 'Failed to retrieve credential offer',
        message: error.message,
      })
    }
  }
}
