"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Navbar } from "@/components/navbar"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { FileText, CheckCircle, Clock, Trash2, Eye, Search, X } from "lucide-react"

interface CredentialRecord {
  id: string
  userId: string
  userName: string
  documentType: string
  documentId: string
  recipientName: string
  createdAt: string
  status: "pending" | "issued" | "verified"
}

export default function DashboardPage() {
  const router = useRouter()
  const [adminName, setAdminName] = useState("")
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [filterStatus, setFilterStatus] = useState<string>("all")

  const [selectedCredential, setSelectedCredential] = useState<CredentialRecord | null>(null)
  const [showViewModal, setShowViewModal] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null)

  const [credentials, setCredentials] = useState<CredentialRecord[]>([])

  useEffect(() => {
    const token = localStorage.getItem("auth_token")
    const name = localStorage.getItem("admin_name")

    if (!token) {
      router.push("/login")
      return
    }

    setAdminName(name || "Admin")

    const storedCredentials = JSON.parse(localStorage.getItem("credentials") || "[]")
    setCredentials(storedCredentials)

    setLoading(false)
  }, [router])

  useEffect(() => {
    const handleStorageChange = () => {
      const updatedCredentials = JSON.parse(localStorage.getItem("credentials") || "[]")
      setCredentials(updatedCredentials)
    }

    window.addEventListener("storage", handleStorageChange)
    return () => window.removeEventListener("storage", handleStorageChange)
  }, [])

  const filteredCredentials = credentials.filter((cred) => {
    const matchesSearch =
      cred.recipientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cred.userName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cred.documentId.toLowerCase().includes(searchQuery.toLowerCase())

    const matchesFilter = filterStatus === "all" || cred.status === filterStatus

    return matchesSearch && matchesFilter
  })

  const stats = [
    {
      title: "Total Credential",
      value: credentials.length.toString(),
      icon: FileText,
      color: "from-primary to-accent",
    },
    {
      title: "Issued",
      value: credentials.filter((c) => c.status === "issued").length.toString(),
      icon: CheckCircle,
      color: "from-green-400 to-green-600",
    },
    {
      title: "Pending",
      value: credentials.filter((c) => c.status === "pending").length.toString(),
      icon: Clock,
      color: "from-yellow-400 to-yellow-600",
    },
    {
      title: "Verified",
      value: credentials.filter((c) => c.status === "verified").length.toString(),
      icon: CheckCircle,
      color: "from-blue-400 to-blue-600",
    },
  ]

  const getStatusColor = (status: string) => {
    switch (status) {
      case "issued":
        return "bg-green-100 text-green-800 border-green-300"
      case "verified":
        return "bg-blue-100 text-blue-800 border-blue-300"
      case "pending":
        return "bg-yellow-100 text-yellow-800 border-yellow-300"
      default:
        return "bg-gray-100 text-gray-800 border-gray-300"
    }
  }

  const handleViewCredential = (credential: CredentialRecord) => {
    setSelectedCredential(credential)
    setShowViewModal(true)
  }

  const handleDeleteCredential = (id: string) => {
    const newCredentials = credentials.filter((c) => c.id !== id)
    localStorage.setItem("credentials", JSON.stringify(newCredentials))
    setCredentials(newCredentials)
    setShowDeleteConfirm(null)
  }

  const handleExport = () => {
    if (filteredCredentials.length === 0) {
      alert("Tidak ada data untuk diexport")
      return
    }

    const headers = ["User", "Tipe Dokumen", "Penerima", "ID Dokumen", "Waktu", "Status"]
    const rows = filteredCredentials.map((cred) => [
      cred.userName,
      cred.documentType,
      cred.recipientName,
      cred.documentId,
      cred.createdAt,
      cred.status.toUpperCase(),
    ])

    const csvContent = [headers, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n")

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const link = document.createElement("a")
    const url = URL.createObjectURL(blob)

    link.setAttribute("href", url)
    link.setAttribute("download", `credentials-export-${new Date().toISOString().split("T")[0]}.csv`)
    link.style.visibility = "hidden"

    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

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

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Dashboard Admin BPJS</h1>
          <p className="text-muted-foreground">Kelola dan monitor penerbitan credential digital</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {stats.map((stat) => {
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

        <Card className="border-0 shadow-lg">
          <CardHeader className="pb-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <CardTitle className="text-2xl">Riwayat Penerbitan Credential</CardTitle>
                <CardDescription>Data penerbitan credential digital oleh user</CardDescription>
              </div>
              <Button
                onClick={handleExport}
                className="bg-gradient-to-r from-primary to-accent text-primary-foreground"
              >
                <FileText className="w-4 h-4 mr-2" />
                Export
              </Button>
            </div>
          </CardHeader>

          <CardContent>
            <div className="flex flex-col sm:flex-row gap-4 mb-6">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Cari nama, username, atau ID dokumen..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                />
              </div>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="px-4 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary transition-all"
              >
                <option value="all">Semua Status</option>
                <option value="pending">Pending</option>
                <option value="issued">Issued</option>
                <option value="verified">Verified</option>
              </select>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-4 font-semibold text-sm">User</th>
                    <th className="text-left py-3 px-4 font-semibold text-sm">Tipe Dokumen</th>
                    <th className="text-left py-3 px-4 font-semibold text-sm">Penerima</th>
                    <th className="text-left py-3 px-4 font-semibold text-sm">Waktu</th>
                    <th className="text-left py-3 px-4 font-semibold text-sm">Status</th>
                    <th className="text-left py-3 px-4 font-semibold text-sm">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCredentials.length > 0 ? (
                    filteredCredentials.map((cred) => (
                      <tr key={cred.id} className="border-b border-border hover:bg-muted/50 transition-colors">
                        <td className="py-4 px-4 text-sm">{cred.userName}</td>
                        <td className="py-4 px-4 text-sm">{cred.documentType}</td>
                        <td className="py-4 px-4 text-sm font-medium">{cred.recipientName}</td>
                        <td className="py-4 px-4 text-sm text-muted-foreground">{cred.createdAt}</td>
                        <td className="py-4 px-4 text-sm">
                          <span
                            className={`inline-block px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(cred.status)}`}
                          >
                            {cred.status.charAt(0).toUpperCase() + cred.status.slice(1)}
                          </span>
                        </td>
                        <td className="py-4 px-4 text-sm">
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleViewCredential(cred)}
                              className="p-1 hover:bg-primary/10 rounded transition-colors"
                              title="Lihat detail"
                            >
                              <Eye className="w-4 h-4 text-primary" />
                            </button>
                            <button
                              onClick={() => setShowDeleteConfirm(cred.id)}
                              className="p-1 hover:bg-destructive/10 rounded transition-colors"
                              title="Hapus"
                            >
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="py-8 px-4 text-center text-muted-foreground">
                        Tidak ada data credential
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </main>

      {showViewModal && selectedCredential && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-2xl border-0 shadow-2xl">
            <CardHeader className="flex flex-row items-center justify-between pb-4">
              <div>
                <CardTitle className="text-xl">Detail Credential</CardTitle>
                <CardDescription>Informasi lengkap penerbitan credential</CardDescription>
              </div>
              <button onClick={() => setShowViewModal(false)} className="p-1 hover:bg-muted rounded transition-colors">
                <X className="w-5 h-5" />
              </button>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">User</p>
                  <p className="text-base font-semibold">{selectedCredential.userName}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">ID User</p>
                  <p className="text-base font-semibold">{selectedCredential.userId}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Tipe Dokumen</p>
                  <p className="text-base font-semibold">{selectedCredential.documentType}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">ID Dokumen</p>
                  <p className="text-base font-semibold">{selectedCredential.documentId}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Nama Penerima</p>
                  <p className="text-base font-semibold">{selectedCredential.recipientName}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Waktu Penerbitan</p>
                  <p className="text-base font-semibold">{selectedCredential.createdAt}</p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-sm font-medium text-muted-foreground">Status</p>
                  <span
                    className={`inline-block mt-1 px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(selectedCredential.status)}`}
                  >
                    {selectedCredential.status.charAt(0).toUpperCase() + selectedCredential.status.slice(1)}
                  </span>
                </div>
              </div>

              <div className="flex gap-2 justify-end pt-4 border-t border-border">
                <Button variant="outline" onClick={() => setShowViewModal(false)}>
                  Tutup
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-md border-0 shadow-2xl">
            <CardHeader>
              <CardTitle className="text-lg">Konfirmasi Hapus</CardTitle>
            </CardHeader>

            <CardContent className="space-y-4">
              <p className="text-muted-foreground">
                Apakah Anda yakin ingin menghapus credential ini? Data tidak dapat dipulihkan setelah dihapus.
              </p>

              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setShowDeleteConfirm(null)}>
                  Batal
                </Button>
                <Button
                  className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                  onClick={() => handleDeleteCredential(showDeleteConfirm)}
                >
                  Hapus
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
