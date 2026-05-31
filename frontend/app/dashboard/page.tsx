"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Navbar } from "@/components/navbar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  issuerApi,
  type HoldersSummaryItem,
  type ManagedCredential,
  type ManagedCredentialDetail,
} from "@/lib/api"
import {
  AlertCircle,
  CheckCircle,
  FileText,
  RefreshCw,
  ShieldCheck,
  Trash2,
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
  const [refreshing, setRefreshing] = useState(false)
  const [listLoading, setListLoading] = useState(false)
  const [error, setError] = useState("")

  const [stats, setStats] = useState<StatsData | null>(null)
  const [credentials, setCredentials] = useState<ManagedCredential[]>([])
  const [holders, setHolders] = useState<HoldersSummaryItem[]>([])

  const [statusFilter, setStatusFilter] = useState("ALL")
  const [selectedCredential, setSelectedCredential] = useState<ManagedCredentialDetail | null>(null)
  const [selectedHolder, setSelectedHolder] = useState<HoldersSummaryItem | null>(null)
  const [selectedCredentialIds, setSelectedCredentialIds] = useState<Set<string>>(new Set())
  const [selectedHolderIds, setSelectedHolderIds] = useState<Set<string>>(new Set())

  const getFromStorage = (key: string) => {
    try {
      return window.localStorage.getItem(key)
    } catch {
      return null
    }
  }

  const hasActiveSession = useCallback(() => {
    try {
      const token = window.localStorage.getItem("auth_token")
      const cookieToken = document.cookie
        .split(";")
        .map((item) => item.trim())
        .find((item) => item.startsWith("auth_token="))

      return Boolean(token && cookieToken)
    } catch {
      return false
    }
  }, [])

  const fetchHeaderData = useCallback(async () => {
    const statsRes = await issuerApi.getStatistics().catch(() => null)

    if (statsRes?.success) setStats(statsRes.statistics as unknown as StatsData)
  }, [])

  const fetchManagementData = useCallback(async (status: string) => {
    setListLoading(true)
    try {
      const [credentialsRes, holdersRes] = await Promise.all([
        issuerApi.getCredentials({
          page: 1,
          limit: 50,
          status: status === "ALL" ? undefined : status,
        }).catch(() => null),
        issuerApi.getHolders().catch(() => null),
      ])

      setCredentials(credentialsRes?.credentials || [])
      setHolders(holdersRes?.holders || [])
    } finally {
      setListLoading(false)
    }
  }, [])

  useEffect(() => {
    const token = getFromStorage("auth_token")
    const name = getFromStorage("admin_name")

    if (!token || !hasActiveSession()) {
      router.replace("/login")
      setLoading(false)
      return
    }

    setAdminName(name || "Admin")

    Promise.all([fetchHeaderData(), fetchManagementData(statusFilter)])
      .catch(() => setError("Gagal memuat data dashboard"))
      .finally(() => setLoading(false))
  }, [router, fetchHeaderData, fetchManagementData, statusFilter, hasActiveSession])

  useEffect(() => {
    const handlePageShow = () => {
      if (!hasActiveSession()) {
        router.replace("/login")
      }
    }

    window.addEventListener("pageshow", handlePageShow)
    return () => window.removeEventListener("pageshow", handlePageShow)
  }, [router, hasActiveSession])

  useEffect(() => {
    if (!loading) {
      fetchManagementData(statusFilter).catch(() => setError("Gagal memuat data manajemen"))
    }
  }, [statusFilter, loading, fetchManagementData])

  useEffect(() => {
    const availableIds = new Set(credentials.map((credential) => credential.id))
    setSelectedCredentialIds((previous) => {
      const next = new Set<string>()
      previous.forEach((id) => {
        if (availableIds.has(id)) next.add(id)
      })
      return next
    })
  }, [credentials])

  useEffect(() => {
    const availableIds = new Set(holders.map((holder) => holder.id))
    setSelectedHolderIds((previous) => {
      const next = new Set<string>()
      previous.forEach((id) => {
        if (availableIds.has(id)) next.add(id)
      })
      return next
    })
  }, [holders])

  async function handleRefresh() {
    setRefreshing(true)
    try {
      await Promise.all([fetchHeaderData(), fetchManagementData(statusFilter)])
    } catch {
      setError("Gagal refresh data")
    } finally {
      setRefreshing(false)
    }
  }

  async function handleCredentialDetail(id: string) {
    try {
      const response = await issuerApi.getCredentialDetail(id)
      if (response.success) setSelectedCredential(response.credential)
    } catch {
      setError("Gagal memuat detail credential")
    }
  }

  async function handleRevoke(id: string) {
    const reason = window.prompt("Alasan revoke (opsional)", "Revoked by admin") || undefined
    try {
      await issuerApi.revokeCredential(id, reason)
      await fetchManagementData(statusFilter)
    } catch {
      setError("Gagal revoke credential")
    }
  }

  async function handleSuspend(id: string) {
    const reason = window.prompt("Alasan suspend (opsional)", "Temporarily suspended") || undefined
    try {
      await issuerApi.suspendCredential(id, reason)
      await fetchManagementData(statusFilter)
    } catch {
      setError("Gagal suspend credential")
    }
  }

  async function handleExtendExpiry(id: string, currentValidUntil: string) {
    const suggestedDate = new Date(new Date(currentValidUntil).getTime() + 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10)

    const nextDate = window.prompt("Tanggal expiry baru (YYYY-MM-DD)", suggestedDate)
    if (!nextDate) return

    try {
      await issuerApi.extendCredentialExpiry(id, `${nextDate}T23:59:59.000Z`)
      await fetchManagementData(statusFilter)
    } catch {
      setError("Gagal memperpanjang masa berlaku credential")
    }
  }

  async function handleDeleteCredential(id: string) {
    const confirmed = window.confirm("Hapus credential ini secara permanen?")
    if (!confirmed) return

    try {
      await issuerApi.deleteCredential(id)
      if (selectedCredential?.id === id) setSelectedCredential(null)
      await fetchManagementData(statusFilter)
      await fetchHeaderData()
    } catch {
      setError("Gagal menghapus credential")
    }
  }

  async function handleBulkDeleteCredentials() {
    if (!selectedCredentialIds.size) return

    const confirmed = window.confirm(`Hapus ${selectedCredentialIds.size} credential terpilih secara permanen?`)
    if (!confirmed) return

    try {
      const selectedIds = [...selectedCredentialIds]
      const results = await Promise.allSettled(selectedIds.map((id) => issuerApi.deleteCredential(id)))
      const failed = results.filter((result) => result.status === "rejected").length

      setSelectedCredentialIds(new Set())
      if (selectedCredential && selectedIds.includes(selectedCredential.id)) setSelectedCredential(null)

      await fetchManagementData(statusFilter)
      await fetchHeaderData()

      if (failed > 0) {
        setError(`${failed} credential gagal dihapus`)
      }
    } catch {
      setError("Gagal menghapus credential terpilih")
    }
  }

  async function handleDeleteHolder(holder: HoldersSummaryItem) {
    const warning = holder.credentialCount > 0
      ? `Holder ini punya ${holder.credentialCount} credential. Semua data akan terhapus permanen. Lanjutkan?`
      : "Hapus holder ini secara permanen?"

    const confirmed = window.confirm(warning)
    if (!confirmed) return

    try {
      await issuerApi.deleteHolder(holder.id)
      if (selectedHolder?.id === holder.id) setSelectedHolder(null)
      await fetchManagementData(statusFilter)
      await fetchHeaderData()
    } catch {
      setError("Gagal menghapus holder")
    }
  }

  async function handleBulkDeleteHolders() {
    if (!selectedHolderIds.size) return

    const selectedItems = holders.filter((holder) => selectedHolderIds.has(holder.id))
    const totalCredentials = selectedItems.reduce((total, item) => total + item.credentialCount, 0)
    const warning = totalCredentials > 0
      ? `Hapus ${selectedHolderIds.size} holder terpilih beserta ${totalCredentials} credential terkait secara permanen?`
      : `Hapus ${selectedHolderIds.size} holder terpilih secara permanen?`

    const confirmed = window.confirm(warning)
    if (!confirmed) return

    try {
      const selectedIds = [...selectedHolderIds]
      const results = await Promise.allSettled(selectedIds.map((id) => issuerApi.deleteHolder(id)))
      const failed = results.filter((result) => result.status === "rejected").length

      setSelectedHolderIds(new Set())
      if (selectedHolder && selectedIds.includes(selectedHolder.id)) setSelectedHolder(null)

      await fetchManagementData(statusFilter)
      await fetchHeaderData()

      if (failed > 0) {
        setError(`${failed} holder gagal dihapus`)
      }
    } catch {
      setError("Gagal menghapus holder terpilih")
    }
  }

  function toggleCredentialSelection(id: string, checked: boolean) {
    setSelectedCredentialIds((previous) => {
      const next = new Set(previous)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  function toggleHolderSelection(id: string, checked: boolean) {
    setSelectedHolderIds((previous) => {
      const next = new Set(previous)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const allCredentialsSelected = credentials.length > 0 && selectedCredentialIds.size === credentials.length
  const credentialSelectionState = allCredentialsSelected
    ? true
    : selectedCredentialIds.size > 0
      ? "indeterminate"
      : false

  const allHoldersSelected = holders.length > 0 && selectedHolderIds.size === holders.length
  const holderSelectionState = allHoldersSelected
    ? true
    : selectedHolderIds.size > 0
      ? "indeterminate"
      : false

  function statusBadge(status: string) {
    if (status === "ACTIVE") return <Badge className="bg-green-600">Active</Badge>
    if (status === "REVOKED") return <Badge variant="destructive">Revoked</Badge>
    if (status === "SUSPENDED") return <Badge className="bg-amber-500">Suspended</Badge>
    if (status === "EXPIRED") return <Badge variant="secondary">Expired</Badge>
    return <Badge variant="outline">Offered</Badge>
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

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold mb-2">Dashboard Issuer</h1>
            <p className="text-muted-foreground">Monitor, audit, dan lifecycle credential holder</p>
          </div>
          <Button variant="outline" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
            <AlertCircle className="w-4 h-4 text-destructive" />
            <span className="text-sm text-destructive">{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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

        <Tabs defaultValue="credentials" className="space-y-4">
          <TabsList>
            <TabsTrigger value="credentials">Credential Management</TabsTrigger>
            <TabsTrigger value="holders">Holder Management</TabsTrigger>
          </TabsList>

          <TabsContent value="credentials" className="space-y-4">
            <Card className="border-0 shadow-lg">
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="text-xl">Daftar Credential</CardTitle>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={!selectedCredentialIds.size}
                    onClick={handleBulkDeleteCredentials}
                  >
                    <Trash2 className="w-4 h-4 mr-1" />
                    Delete Selected ({selectedCredentialIds.size})
                  </Button>
                  {["ALL", "ACTIVE", "SUSPENDED", "REVOKED", "EXPIRED"].map((status) => (
                    <Button
                      key={status}
                      size="sm"
                      variant={statusFilter === status ? "default" : "outline"}
                      onClick={() => setStatusFilter(status)}
                    >
                      {status}
                    </Button>
                  ))}
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">
                        <Checkbox
                          checked={credentialSelectionState}
                          onCheckedChange={(value) => {
                            const checked = value === true
                            setSelectedCredentialIds(checked ? new Set(credentials.map((item) => item.id)) : new Set())
                          }}
                          aria-label="Select all credentials"
                        />
                      </TableHead>
                      <TableHead>Credential ID</TableHead>
                      <TableHead>Holder DID</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Expires</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {credentials.map((credential) => (
                      <TableRow key={credential.id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedCredentialIds.has(credential.id)}
                            onCheckedChange={(value) => toggleCredentialSelection(credential.id, value === true)}
                            aria-label={`Select credential ${credential.id}`}
                          />
                        </TableCell>
                        <TableCell className="font-mono text-xs">{credential.id.slice(0, 12)}...</TableCell>
                        <TableCell className="max-w-[220px] truncate font-mono text-xs">
                          {credential.holderDID || "-"}
                        </TableCell>
                        <TableCell>KartuBPJSKesehatan</TableCell>
                        <TableCell>{statusBadge(credential.status)}</TableCell>
                        <TableCell>{new Date(credential.validUntil).toLocaleDateString("id-ID")}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-2">
                            <Button size="sm" variant="outline" onClick={() => handleCredentialDetail(credential.id)}>
                              View
                            </Button>
                            {credential.status !== "REVOKED" && (
                              <Button size="sm" variant="destructive" onClick={() => handleRevoke(credential.id)}>
                                Revoke
                              </Button>
                            )}
                            {(credential.status === "ACTIVE" || credential.status === "OFFERED") && (
                              <Button size="sm" variant="outline" onClick={() => handleSuspend(credential.id)}>
                                Suspend
                              </Button>
                            )}
                            {credential.status !== "REVOKED" && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleExtendExpiry(credential.id, credential.validUntil)}
                              >
                                Extend
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleDeleteCredential(credential.id)}
                            >
                              <Trash2 className="w-4 h-4 mr-1" />
                              Delete
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {!credentials.length && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          {listLoading ? "Memuat data credential..." : "Belum ada credential"}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {selectedCredential && (
              <Card className="border-0 shadow-lg">
                <CardHeader>
                  <CardTitle className="text-lg">Detail Credential</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Credential ID</p>
                    <p className="font-mono text-xs break-all">{selectedCredential.id}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Status</p>
                    <p>{selectedCredential.status}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Holder DID</p>
                    <p className="font-mono text-xs break-all">{selectedCredential.holderDID || "-"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Nama Holder</p>
                    <p>{selectedCredential.nama || selectedCredential.holderName}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">NIK</p>
                    <p>{selectedCredential.nik}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Berlaku Sampai</p>
                    <p>{new Date(selectedCredential.validUntil).toLocaleString("id-ID")}</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="holders" className="space-y-4">
            <Card className="border-0 shadow-lg">
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="text-xl">Daftar Holder</CardTitle>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={!selectedHolderIds.size}
                  onClick={handleBulkDeleteHolders}
                  className="w-fit"
                >
                  <Trash2 className="w-4 h-4 mr-1" />
                  Delete Selected ({selectedHolderIds.size})
                </Button>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">
                        <Checkbox
                          checked={holderSelectionState}
                          onCheckedChange={(value) => {
                            const checked = value === true
                            setSelectedHolderIds(checked ? new Set(holders.map((item) => item.id)) : new Set())
                          }}
                          aria-label="Select all holders"
                        />
                      </TableHead>
                      <TableHead>Holder DID</TableHead>
                      <TableHead>NIK</TableHead>
                      <TableHead>Credential Count</TableHead>
                      <TableHead>Last Issued</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {holders.map((holder) => (
                      <TableRow key={holder.id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedHolderIds.has(holder.id)}
                            onCheckedChange={(value) => toggleHolderSelection(holder.id, value === true)}
                            aria-label={`Select holder ${holder.id}`}
                          />
                        </TableCell>
                        <TableCell className="max-w-[240px] truncate font-mono text-xs">{holder.holderDID || "-"}</TableCell>
                        <TableCell>{holder.nik || "-"}</TableCell>
                        <TableCell>{holder.credentialCount}</TableCell>
                        <TableCell>
                          {holder.lastIssuedAt ? new Date(holder.lastIssuedAt).toLocaleDateString("id-ID") : "-"}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-2">
                            <Button size="sm" variant="outline" onClick={() => setSelectedHolder(holder)}>
                              View
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleDeleteHolder(holder)}
                            >
                              <Trash2 className="w-4 h-4 mr-1" />
                              Delete
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {!holders.length && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          {listLoading ? "Memuat data holder..." : "Belum ada holder"}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {selectedHolder && (
              <Card className="border-0 shadow-lg">
                <CardHeader>
                  <CardTitle className="text-lg">Detail Holder</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Nama</p>
                    <p>{selectedHolder.nama}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Email</p>
                    <p>{selectedHolder.email}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">NIK</p>
                    <p>{selectedHolder.nik || "-"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Holder DID</p>
                    <p className="font-mono text-xs break-all">{selectedHolder.holderDID || "-"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Credential Dimiliki</p>
                    <p>{selectedHolder.credentialCount}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Last Issued</p>
                    <p>{selectedHolder.lastIssuedAt ? new Date(selectedHolder.lastIssuedAt).toLocaleString("id-ID") : "-"}</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}
