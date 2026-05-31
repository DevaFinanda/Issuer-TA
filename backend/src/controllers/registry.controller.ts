import { Request, Response } from 'express'
import {
  findTrustedRegistryIdentityByNIK,
  importTrustedRegistryIdentities,
  listTrustedIssuers,
  upsertTrustedIssuer,
} from '../services/registry.service.js'

export class RegistryController {
  static async importIdentities(req: Request, res: Response) {
    try {
      const records = req.body?.records
      const result = await importTrustedRegistryIdentities(records)
      return res.status(201).json({
        success: true,
        ...result,
      })
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        error: error.message || 'Failed to import registry identities',
      })
    }
  }

  static async getIdentityByNik(req: Request, res: Response) {
    try {
      const identity = await findTrustedRegistryIdentityByNIK(req.params.nik)
      if (!identity) {
        return res.status(404).json({
          success: false,
          error: 'Registry identity not found',
        })
      }

      return res.json({
        success: true,
        identity,
      })
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch registry identity',
      })
    }
  }

  static async upsertTrustedIssuer(req: Request, res: Response) {
    try {
      const issuer = await upsertTrustedIssuer({
        did: req.body?.did,
        name: req.body?.name,
        isActive: req.body?.isActive,
        checkRevocation: req.body?.checkRevocation,
        minMatchScore: req.body?.minMatchScore,
        requiredClaims: req.body?.requiredClaims,
      })

      return res.status(201).json({
        success: true,
        issuer,
      })
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        error: error.message || 'Failed to upsert trusted issuer',
      })
    }
  }

  static async listTrustedIssuers(_req: Request, res: Response) {
    try {
      const issuers = await listTrustedIssuers()
      return res.json({
        success: true,
        issuers,
      })
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to list trusted issuers',
      })
    }
  }
}
