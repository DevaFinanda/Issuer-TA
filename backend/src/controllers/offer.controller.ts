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

export class OfferController {
  /**
   * POST /credential-offer
   * 
   * Creates a new credential offer with authorization_code grant.
   * Returns the offer object, openid-credential-offer:// URI, and QR code.
   */
  static async createOffer(req: Request, res: Response) {
    try {
      const issuerBaseUrl = process.env.ISSUER_BASE_URL || `http://localhost:${process.env.PORT || 3001}`

      // Generate unique offer ID
      const offerId = crypto.randomUUID()

      // Build credential offer object (OID4VCI spec)
      const credentialOffer: CredentialOffer = {
        credential_issuer: issuerBaseUrl,
        credential_configuration_ids: ['identity_credential'],
        grants: {
          authorization_code: {},
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

      // Build openid-credential-offer:// URI
      const credentialOfferUri = `openid-credential-offer://?credential_offer_uri=${encodeURIComponent(
        `${issuerBaseUrl}/credential-offer/${offerId}`
      )}`

      // Generate QR code from the URI
      const qrCode = await generateQRCode(credentialOfferUri)

      console.log('📋 Credential offer created')
      console.log('🆔 Offer ID:', offerId)
      console.log('🔗 Offer URI:', credentialOfferUri)

      res.json({
        success: true,
        offerId,
        credentialOffer,
        credentialOfferUri,
        qrCode,
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

      const offer = await prisma.credentialOffer.findUnique({
        where: { id },
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

      // Mark as used
      await prisma.credentialOffer.update({
        where: { id },
        data: { used: true },
      })

      // Return the credential offer JSON
      res.json(offer.offerData)
    } catch (error: any) {
      console.error('❌ Error retrieving credential offer:', error.message)
      res.status(500).json({
        error: 'Failed to retrieve credential offer',
        message: error.message,
      })
    }
  }
}
