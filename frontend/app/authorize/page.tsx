"use client"

import { useState, useEffect, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { holderApi } from "@/lib/api"
import { ShieldCheck, Loader2, AlertCircle, KeyRound, User } from "lucide-react"

/**
 * /authorize — Holder Login Page (OID4VCI Authorization Code Flow)
 */
function AuthorizeContent() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const clientId = searchParams.get("client_id") || ""
  const redirectUri = searchParams.get("redirect_uri") || ""
  const state = searchParams.get("state") || ""
  const offerId = searchParams.get("offer_id") || ""

  const [nik, setNik] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)
  const [authCode, setAuthCode] = useState("")

  // Validate required params
  const missingParams = !clientId || !redirectUri

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      const result = await holderApi.authorize({
        nik,
        password,
        client_id: clientId,
        redirect_uri: redirectUri,
        state: state || undefined,
      })

      if (result.success && result.code) {
        setAuthCode(result.code)
        setSuccess(true)

        // Build redirect URL with auth code
        const redirect = new URL(result.redirect_uri)
        redirect.searchParams.set("code", result.code)
        if (state) redirect.searchParams.set("state", state)

        // Auto-redirect after 2 seconds
        setTimeout(() => {
          window.location.href = redirect.toString()
        }, 2000)
      }
    } catch (err: any) {
      const msg = err.response?.data?.error || err.message || "Login gagal"
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <Card className="w-full max-w-md shadow-2xl">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
            <ShieldCheck className="w-8 h-8 text-blue-600" />
          </div>
          <CardTitle className="text-2xl font-bold">Otorisasi Credential</CardTitle>
          <CardDescription>
            Masukkan NIK dan password Anda untuk menerima IdentityCredential
          </CardDescription>
        </CardHeader>
        <CardContent>
          {missingParams ? (
            <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
              <p className="text-sm text-amber-800">
                Parameter tidak lengkap. Halaman ini harus diakses melalui credential offer yang valid.
              </p>
            </div>
          ) : success ? (
            <div className="text-center space-y-4">
              <div className="mx-auto w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                <ShieldCheck className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <h3 className="font-semibold text-green-700">Otorisasi Berhasil!</h3>
                <p className="text-sm text-gray-500 mt-1">
                  Authorization code diterbitkan. Mengalihkan ke wallet...
                </p>
                <code className="mt-2 block text-xs text-gray-400 break-all">
                  {authCode.substring(0, 16)}...
                </code>
              </div>
              <Loader2 className="w-5 h-5 animate-spin mx-auto text-blue-500" />
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              <div className="space-y-2">
                <label htmlFor="nik" className="text-sm font-medium text-gray-700">
                  NIK (Nomor Induk Kependudukan)
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    id="nik"
                    type="text"
                    placeholder="16 digit NIK"
                    value={nik}
                    onChange={(e) => setNik(e.target.value.replace(/\D/g, "").slice(0, 16))}
                    className="pl-10"
                    required
                    maxLength={16}
                    minLength={16}
                    pattern="[0-9]{16}"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="password" className="text-sm font-medium text-gray-700">
                  Password
                </label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="Masukkan password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10"
                    required
                    minLength={6}
                  />
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={loading || nik.length !== 16}>
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Memverifikasi...
                  </>
                ) : (
                  "Login & Otorisasi"
                )}
              </Button>

              <div className="text-center">
                <a
                  href="/register"
                  className="text-sm text-blue-600 hover:underline"
                >
                  Belum punya akun? Daftar di sini
                </a>
              </div>

              {offerId && (
                <p className="text-xs text-gray-400 text-center mt-2">
                  Offer: {offerId.substring(0, 8)}...
                </p>
              )}
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default function AuthorizePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    }>
      <AuthorizeContent />
    </Suspense>
  )
}
