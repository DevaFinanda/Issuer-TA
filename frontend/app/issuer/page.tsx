"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Navbar } from "@/components/navbar"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { issuerApi } from "@/lib/api"
import { QrCode, Loader2, Copy, CheckCircle, AlertCircle, RefreshCw } from "lucide-react"

export default function IssuerPage() {
  const router = useRouter()
  const [adminName, setAdminName] = useState("")
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState("")
  const [offer, setOffer] = useState<{
    offerId: string
    credentialOfferUri: string
    qrCode: string
    expiresAt: string
  } | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const token = localStorage.getItem("auth_token")
    const name = localStorage.getItem("admin_name")
    if (!token) {
      router.push("/login")
      return
    }
    setAdminName(name || "Admin")
    setLoading(false)
  }, [router])

  async function handleCreateOffer() {
    setCreating(true)
    setError("")
    setOffer(null)
    try {
      const result = await issuerApi.createCredentialOffer()
      setOffer({
        offerId: result.offerId,
        credentialOfferUri: result.credentialOfferUri,
        qrCode: result.qrCode,
        expiresAt: result.expiresAt,
      })
    } catch (err: any) {
      const msg = err.response?.data?.error || err.message || "Gagal membuat credential offer"
      setError(msg)
    } finally {
      setCreating(false)
    }
  }

  async function copyUri() {
    if (!offer) return
    await navigator.clipboard.writeText(offer.credentialOfferUri)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-secondary to-background flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
          <p className="mt-4 text-muted-foreground">Memuat...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary to-background">
      <Navbar adminName={adminName} />

      <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <Card className="shadow-xl">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
              <QrCode className="w-8 h-8 text-blue-600" />
            </div>
            <CardTitle className="text-2xl">Terbitkan Credential Offer</CardTitle>
            <CardDescription>
              Buat QR code credential offer yang dapat di-scan oleh holder wallet.
              Holder akan diminta login dengan NIK + password untuk menerima IdentityCredential.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            {error && (
              <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
                <span className="text-sm text-destructive">{error}</span>
              </div>
            )}

            {!offer ? (
              <div className="text-center space-y-4">
                <p className="text-sm text-muted-foreground">
                  Klik tombol di bawah untuk membuat credential offer baru.
                  QR code akan muncul untuk di-scan oleh holder.
                </p>
                <Button
                  onClick={handleCreateOffer}
                  disabled={creating}
                  size="lg"
                  className="w-full sm:w-auto"
                >
                  {creating ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Membuat Offer...
                    </>
                  ) : (
                    <>
                      <QrCode className="w-4 h-4 mr-2" />
                      Buat Credential Offer
                    </>
                  )}
                </Button>
              </div>
            ) : (
              <div className="space-y-6">
                {/* QR Code */}
                <div className="flex flex-col items-center space-y-4">
                  <div className="p-4 bg-white rounded-2xl shadow-md">
                    <img
                      src={offer.qrCode}
                      alt="Credential Offer QR Code"
                      className="w-64 h-64"
                    />
                  </div>
                  <p className="text-sm text-muted-foreground text-center">
                    Scan QR code ini dengan wallet holder
                  </p>
                </div>

                {/* Offer URI */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Credential Offer URI</label>
                  <div className="flex gap-2">
                    <code className="flex-1 text-xs break-all p-3 bg-muted rounded-lg">
                      {offer.credentialOfferUri}
                    </code>
                    <Button variant="outline" size="sm" onClick={copyUri}>
                      {copied ? (
                        <CheckCircle className="w-4 h-4 text-green-600" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>

                {/* Info */}
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Offer ID:</span>
                    <p className="font-mono text-xs">{offer.offerId.substring(0, 12)}...</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Berlaku hingga:</span>
                    <p className="text-xs">{new Date(offer.expiresAt).toLocaleString("id-ID")}</p>
                  </div>
                </div>

                {/* Create another */}
                <Button
                  variant="outline"
                  onClick={handleCreateOffer}
                  disabled={creating}
                  className="w-full"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Buat Offer Baru
                </Button>
              </div>
            )}

            {/* Flow explanation */}
            <div className="border-t pt-4">
              <h4 className="text-sm font-semibold mb-2">Alur OID4VCI Authorization Code Flow:</h4>
              <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                <li>Admin membuat credential offer (QR code)</li>
                <li>Holder scan QR dengan wallet</li>
                <li>Holder diarahkan ke halaman login (NIK + password)</li>
                <li>Backend menerbitkan authorization code</li>
                <li>Wallet menukar code → access token</li>
                <li>Wallet request credential dengan access token</li>
                <li>Backend menandatangani & mengembalikan JWT VC (IdentityCredential)</li>
              </ol>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
