/**
 * QR Code Generator
 * 
 * Generates QR codes from credential offer URIs
 */

import QRCode from 'qrcode'

/**
 * Generate a QR code as a base64-encoded data URL (PNG)
 * 
 * @param data - The data to encode in the QR code
 * @returns Base64 data URL string (e.g., "data:image/png;base64,...")
 */
export async function generateQRCode(data: string): Promise<string> {
  const qrCode = await QRCode.toDataURL(data, {
    errorCorrectionLevel: 'M',
    width: 512,
    margin: 2,
    type: 'image/png',
  })

  return qrCode
}
