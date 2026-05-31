"use client"

import type React from "react"

import { Suspense, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Lock, User, AlertCircle, CheckCircle, CreditCard, Calendar } from "lucide-react"
import { holderApi } from "@/lib/api"

function RegisterContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)
  const [formData, setFormData] = useState({
    nik: "",
    nama: "",
    email: "",
    tanggalLahir: "",
    password: "",
    confirmPassword: "",
  })

  const authorizeParams = new URLSearchParams()
  const clientId = searchParams.get("client_id")
  const redirectUri = searchParams.get("redirect_uri")
  const state = searchParams.get("state")
  const offerId = searchParams.get("offer_id")

  if (clientId) authorizeParams.set("client_id", clientId)
  if (redirectUri) authorizeParams.set("redirect_uri", redirectUri)
  if (state) authorizeParams.set("state", state)
  if (offerId) authorizeParams.set("offer_id", offerId)

  const hasAuthorizeContext = Boolean(clientId && redirectUri)
  const postRegisterTarget = hasAuthorizeContext
    ? `/authorize${authorizeParams.toString() ? `?${authorizeParams.toString()}` : ""}`
    : "/login"

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    if (name === "nik") {
      setFormData((prev) => ({ ...prev, [name]: value.replace(/\D/g, "").slice(0, 16) }))
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }))
    }
    setError("")
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")

    if (formData.nik.length !== 16) {
      setError("NIK harus 16 digit")
      setLoading(false)
      return
    }

    if (formData.password !== formData.confirmPassword) {
      setError("Password tidak sesuai")
      setLoading(false)
      return
    }

    if (formData.password.length < 8) {
      setError("Password minimal 8 karakter")
      setLoading(false)
      return
    }

    try {
      await holderApi.register({
        nik: formData.nik,
        nama: formData.nama.trim() || undefined,
        email: formData.email.trim() || undefined,
        tanggal_lahir: formData.tanggalLahir || undefined,
        password: formData.password,
      })

      setSuccess(true)
      setTimeout(() => {
        router.push(postRegisterTarget)
      }, 2000)
    } catch (err: any) {
      const data = err.response?.data
      const alreadyRegistered = err.response?.status === 409 || data?.code === "ALREADY_REGISTERED"

      if (alreadyRegistered) {
        setSuccess(true)
        setError("")
        setTimeout(() => {
          router.push(postRegisterTarget)
        }, 1500)
        return
      }

      // Tampilkan detail validasi jika ada, fallback ke pesan error umum
      const msg = data?.details?.join(' • ') || data?.error || err.message || "Registrasi gagal"
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary to-background flex items-center justify-center px-4 py-12">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 -left-4 w-72 h-72 bg-primary/5 rounded-full mix-blend-multiply filter blur-3xl animate-pulse"></div>
        <div className="absolute bottom-0 -right-4 w-72 h-72 bg-accent/5 rounded-full mix-blend-multiply filter blur-3xl animate-pulse delay-2000"></div>
      </div>

      <div className="relative z-10 w-full max-w-md">
        <Card className="shadow-2xl border-0">
          <CardHeader className="text-center pb-6">
            <div className="w-16 h-16 bg-gradient-to-br from-primary to-accent rounded-xl mx-auto mb-4 flex items-center justify-center">
              <User className="w-8 h-8 text-primary-foreground" />
            </div>
            <CardTitle className="text-3xl font-bold">Daftar Holder</CardTitle>
            <CardDescription>Daftar untuk menerima Kartu BPJS Kesehatan</CardDescription>
          </CardHeader>

          <CardContent>
            {success ? (
              <div className="text-center space-y-4">
                <div className="flex justify-center">
                  <CheckCircle className="w-16 h-16 text-accent" />
                </div>
                <div>
                  <p className="font-semibold text-lg">Registrasi Berhasil!</p>
                  <p className="text-muted-foreground text-sm">Akun siap digunakan. Anda akan diarahkan ke halaman login...</p>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-3">
                {error && (
                  <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                    <AlertCircle className="w-4 h-4 text-destructive" />
                    <span className="text-sm text-destructive">{error}</span>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-sm font-medium">NIK (Nomor Induk Kependudukan)</label>
                  <div className="relative">
                    <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <Input
                      type="text"
                      name="nik"
                      value={formData.nik}
                      onChange={handleChange}
                      placeholder="3201234567890001"
                      className="pl-10"
                      required
                      maxLength={16}
                      minLength={16}
                      pattern="[0-9]{16}"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Nama Lengkap</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <Input
                      type="text"
                      name="nama"
                      value={formData.nama}
                      onChange={handleChange}
                      placeholder="Budi Santoso"
                      className="pl-10"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Email</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <Input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      placeholder="nama@email.com"
                      className="pl-10"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Tanggal Lahir</label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <Input
                      type="date"
                      name="tanggalLahir"
                      value={formData.tanggalLahir}
                      onChange={handleChange}
                      className="pl-10"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <Input
                      type="password"
                      name="password"
                      value={formData.password}
                      onChange={handleChange}
                      placeholder="Minimal 8 karakter"
                      className="pl-10"
                      required
                      minLength={8}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Konfirmasi Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <Input
                      type="password"
                      name="confirmPassword"
                      value={formData.confirmPassword}
                      onChange={handleChange}
                      placeholder="Ulangi password"
                      className="pl-10"
                      required
                      minLength={8}
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full h-11 bg-gradient-to-r from-primary to-accent hover:opacity-90 text-primary-foreground font-semibold rounded-lg transition-all"
                >
                  {loading ? "Memproses..." : "Daftar"}
                </Button>
              </form>
            )}

            <div className="mt-6 text-center text-sm">
              <span className="text-muted-foreground">Sudah punya akun? </span>
              <Link href={postRegisterTarget} className="text-primary font-semibold hover:underline">
                Masuk
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Memuat...</div>}>
      <RegisterContent />
    </Suspense>
  )
}
