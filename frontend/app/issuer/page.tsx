"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Navbar } from "@/components/navbar"
import CredentialIssuerForm from "@/components/credential-issuer-form"

export default function IssuerPage() {
  const router = useRouter()
  const [adminName, setAdminName] = useState("")
  const [loading, setLoading] = useState(true)

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

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-secondary to-background flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          <p className="mt-4 text-muted-foreground">Memuat...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary to-background">
      <Navbar adminName={adminName} />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <CredentialIssuerForm />
      </main>
    </div>
  )
}
