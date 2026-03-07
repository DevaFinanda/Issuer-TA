"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Navbar } from "@/components/navbar"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { issuerApi } from "@/lib/api"
import {
  FileText, CheckCircle, Clock, Eye, Search, X, RefreshCw,
  ShieldCheck, AlertCircle, Activity,
} from "lucide-react"

interface StatsData {
  totalCredentials: number
  activeCredentials: number
  revokedCredentials: number
  totalUsers: number
  [key: string]: any
}

export default function DashboardPage() {
  const router = useRouter()
  const [adminName, setAdminName] = useState("")
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<StatsData | null>(null)
  const [health, setHealth] = useState<any>(null)
  const [error, setError] = useState("")
  const [refreshing, setRefreshing] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      const [statsRes, healthRes] = await Promise.all([
        issuerApi.getStatistics().catch(() => null),
        issuerApi.healthCheck().catch(() => null),
      ])
      if (statsRes?.success) setStats(statsRes.statistics as unknown as StatsData)
      if (healthRes) setHealth(healthRes)
    } catch {
      setError("Gagal memuat data dashboard")
    }
  }, [])

  useEffect(() => {
    const token = localStorage.getItem("auth_token")
    const name = localStorage.getItem("admin_name")
    if (!token) {
      router.push("/login")
      return
    }
    setAdminName(name || "Admin")
    fetchData().then(() => setLoading(false))
  }, [router, fetchData])

  async function handleRefresh() {
    setRefreshing(true)
    await fetchData()
    setRefreshing(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-secondary to-background flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
          <p className="mt-4 text-muted-foreground">Memuat dashboard...</p>
        </div>
      </div>
    )
  }

  const statCards = [
    {
      title: "Total Credential",
      value: stats?.totalCredentials?.toString() || "0",
      icon: FileText,
      color: "from-primary to-accent",
    },
    {
      title: "Active",
      value: stats?.activeCredentials?.toString() || "0",
      icon: CheckCircle,
      color: "from-green-400 to-green-600",
    },
    {
      title: "Revoked",
      value: stats?.revokedCredentials?.toString() || "0",
      icon: AlertCircle,
      color: "from-red-400 to-red-600",
    },
    {
      title: "Total Users",
      value: stats?.totalUsers?.toString() || "0",
      icon: ShieldCheck,
      color: "from-blue-400 to-blue-600",
    },
  ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary to-background">
      <Navbar adminName={adminName} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex justify-between items-start mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2">Dashboard Issuer</h1>
            <p className="text-muted-foreground">Monitor & kelola penerbitan IdentityCredential</p>
          </div>
          <Button variant="outline" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 mb-6 bg-destructive/10 border border-destructive/20 rounded-lg">
            <AlertCircle className="w-4 h-4 text-destructive" />
            <span className="text-sm text-destructive">{error}</span>
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {statCards.map((stat) => {
            const Icon = stat.icon
            return (
              <Card key={stat.title} className="overflow-hidden border-0 shadow-lg">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-muted-foreground text-sm mb-1">{stat.title}</p>
                      <p className="text-3xl font-bold">{stat.value}</p>
                    </div>
                    <div className={`bg-gradient-to-br ${stat.color} p-3 rounded-lg`}>
                      <Icon className="w-6 h-6 text-white" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>

        {/* System Health */}
        {health && (
          <Card className="border-0 shadow-lg mb-8">
            <CardHeader>
              <CardTitle className="text-xl flex items-center gap-2">
                <Activity className="w-5 h-5" />
                Status Sistem
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Server</p>
                  <p className={`font-semibold ${health.status === "ok" ? "text-green-600" : "text-red-600"}`}>
                    {health.status === "ok" ? "Online" : "Degraded"}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Database</p>
                  <p className={`font-semibold ${health.database === "connected" ? "text-green-600" : "text-red-600"}`}>
                    {health.database === "connected" ? "Connected" : "Disconnected"}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Issuer DID</p>
                  <p className="font-mono text-xs break-all">{health.issuerDID}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Protocol Info */}
        <Card className="border-0 shadow-lg">
          <CardHeader>
            <CardTitle className="text-xl">Informasi Protokol</CardTitle>
            <CardDescription>Konfigurasi OID4VCI saat ini</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Flow</p>
                <p className="font-semibold">Authorization Code Flow</p>
              </div>
              <div>
                <p className="text-muted-foreground">Format Credential</p>
                <p className="font-semibold">jwt_vc_json</p>
              </div>
              <div>
                <p className="text-muted-foreground">Tipe Credential</p>
                <p className="font-semibold">IdentityCredential</p>
              </div>
              <div>
                <p className="text-muted-foreground">Signing Algorithm</p>
                <p className="font-semibold">EdDSA (Ed25519)</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
