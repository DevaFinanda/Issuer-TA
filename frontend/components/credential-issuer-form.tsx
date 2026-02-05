"use client"

import type React from "react"
import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import IssuerHeader from "./issuer-header"
import FormSection from "./form-section"
import FormFields from "./form-fields"
import { issuerApi } from "@/lib/api"
import type { IssueCredentialRequest } from "@/lib/api"
import { 
  sanitizeInput, 
  isValidDID, 
  isValidNIK, 
  isValidNoBPJS, 
  isValidName, 
  isValidDate,
  isValidHash,
  rateLimiter 
} from "@/lib/security"

// VPS Configuration - Holder DID
const VPS_IP = "202.155.132.71"
const DEFAULT_HOLDER_DID = `did:web:${VPS_IP}`

// Generate random hex hash (64 characters = SHA-256 style)
const generateRandomHash = (): string => {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('')
}

// Generate random document ID
const generateDocumentId = (): string => {
  const chars = 'ABCDEF0123456789'
  let result = ''
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

interface FormData {
  documentId: string
  documentName: string
  documentType: string
  holderDid: string
  fullName: string
  bpjsNumber: string
  nik: string
  dateOfBirth: string
  address: string
  status: string
  facility: string
  visitDate: string
  clinic: string
  diagnosis: string
  doctor: string
  treatment: string
}

export default function CredentialIssuerForm() {
  // Function to generate new auto values
  const generateAutoValues = useCallback(() => ({
    documentId: generateDocumentId(),
    documentName: generateRandomHash(),
    holderDid: DEFAULT_HOLDER_DID,
  }), [])

  const [formData, setFormData] = useState<FormData>(() => {
    const autoValues = {
      documentId: generateDocumentId(),
      documentName: generateRandomHash(),
      holderDid: DEFAULT_HOLDER_DID,
    }
    return {
      ...autoValues,
      documentType: "Kartu Peserta BPJS",
      fullName: "",
      bpjsNumber: "",
      nik: "",
      dateOfBirth: "",
      address: "",
      status: "Aktif",
      facility: "",
      visitDate: "",
      clinic: "",
      diagnosis: "",
      doctor: "",
      treatment: "",
    }
  })

  // Regenerate auto values on component mount (client-side)
  useEffect(() => {
    const autoValues = generateAutoValues()
    setFormData(prev => ({
      ...prev,
      ...autoValues,
    }))
  }, [generateAutoValues])

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitMessage, setSubmitMessage] = useState("")
  const [qrCode, setQrCode] = useState<string>("")
  const [errorDetails, setErrorDetails] = useState<string>("")

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Rate limiting check
    if (!rateLimiter.canMakeRequest('credential-issue')) {
      const remainingTime = rateLimiter.getRemainingTime('credential-issue')
      setSubmitMessage(`Terlalu banyak permintaan. Silakan coba lagi dalam ${remainingTime} detik.`)
      setErrorDetails("")
      return
    }

    // Validate all inputs
    const validationErrors: string[] = []

    if (!isValidHash(formData.documentName)) {
      validationErrors.push('Document Hash harus berupa hex string (32-128 karakter)')
    }

    if (!isValidDID(formData.holderDid)) {
      validationErrors.push('Format DID tidak valid')
    }

    if (!isValidName(formData.fullName)) {
      validationErrors.push('Nama hanya boleh berisi huruf dan spasi (3-100 karakter)')
    }

    if (!isValidNoBPJS(formData.bpjsNumber)) {
      validationErrors.push('Nomor BPJS harus 13 digit angka')
    }

    if (!isValidNIK(formData.nik)) {
      validationErrors.push('NIK harus 16 digit angka')
    }

    if (!isValidDate(formData.dateOfBirth)) {
      validationErrors.push('Format tanggal lahir tidak valid')
    }

    if (formData.address.length < 10 || formData.address.length > 500) {
      validationErrors.push('Alamat harus 10-500 karakter')
    }

    if (validationErrors.length > 0) {
      setSubmitMessage('Validasi gagal')
      setErrorDetails(validationErrors.join('. '))
      return
    }

    setIsSubmitting(true)
    setSubmitMessage("")
    setErrorDetails("")
    setQrCode("")

    try {
      // Sanitize all string inputs
      const sanitizedFormData = {
        documentId: sanitizeInput(formData.documentId),
        documentHash: sanitizeInput(formData.documentName),
        documentType: sanitizeInput(formData.documentType),
        holderDID: sanitizeInput(formData.holderDid),
        holderName: sanitizeInput(formData.fullName),
        noBPJS: sanitizeInput(formData.bpjsNumber),
        nik: sanitizeInput(formData.nik),
        tanggalLahir: sanitizeInput(formData.dateOfBirth),
        alamat: sanitizeInput(formData.address)
      }

      // Prepare data based on document type
      let requestData: IssueCredentialRequest

      if (sanitizedFormData.documentType === 'Kartu Peserta BPJS') {
        requestData = {
          ...sanitizedFormData,
          metadata: {
            statusAktif: sanitizeInput(formData.status),
            faskesPertama: sanitizeInput(formData.facility),
            credentialType: 'BPJSMembershipCredential'
          }
        }
      } else if (sanitizedFormData.documentType === 'Riwayat Kunjungan Pasien') {
        requestData = {
          ...sanitizedFormData,
          metadata: {
            tanggalKunjungan: sanitizeInput(formData.visitDate),
            poli: sanitizeInput(formData.clinic),
            diagnosa: sanitizeInput(formData.diagnosis),
            dokter: sanitizeInput(formData.doctor),
            tindakan: sanitizeInput(formData.treatment),
            credentialType: 'PatientEncounterCredential'
          }
        }
      } else {
        requestData = sanitizedFormData
      }

      const response = await issuerApi.verifyDocument(requestData)
      setQrCode(response.qrCode)
      setSubmitMessage("Credential berhasil diterbitkan!")

      // Save to localStorage for dashboard
      const adminName = localStorage.getItem("admin_name") || "Admin"
      const newCredential = {
        id: Date.now().toString(),
        userId: localStorage.getItem("user_id") || "user-" + Math.random().toString(36).substr(2, 9),
        userName: adminName,
        documentType: formData.documentType,
        documentId: formData.documentId,
        recipientName: formData.fullName,
        createdAt: new Date().toLocaleString("id-ID"),
        status: "issued" as const,
      }
      const existingCredentials = JSON.parse(localStorage.getItem("credentials") || "[]")
      const updatedCredentials = [...existingCredentials, newCredential]
      localStorage.setItem("credentials", JSON.stringify(updatedCredentials))

      // Clear error details on success
      setErrorDetails("")
      
      // Generate new random values for next submission
      setFormData(prev => ({
        ...prev,
        documentId: generateDocumentId(),
        documentName: generateRandomHash(),
      }))
    } catch (error: any) {
      const errorMsg = error.response?.data?.error || error.message || 'Failed to verify document'
      setSubmitMessage('Terjadi kesalahan saat menerbitkan credential')
      setErrorDetails(sanitizeInput(errorMsg))
      console.error('❌ Error:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const isVisitRecord = formData.documentType === "Riwayat Kunjungan Pasien"

  return (
    <div className="max-w-4xl mx-auto">
      <IssuerHeader />

      <Card className="shadow-2xl border border-primary/10 overflow-hidden backdrop-blur-sm bg-card/95">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5 pointer-events-none"></div>

        <form onSubmit={handleSubmit} className="relative p-8 sm:p-12 space-y-10">
          {/* Section 1: Document Information */}
          <FormSection
            title="Informasi Credential"
            description="Lengkapi detail dokumentasi untuk penerbitkan credential digital"
          >
            <FormFields.DocumentInfo formData={formData} onChange={handleInputChange} />
          </FormSection>

          {/* Divider */}
          <div className="h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent"></div>

          {/* Section 2: Recipient Information - Dynamic based on document type */}
          <FormSection
            title={isVisitRecord ? "Data Kunjungan Pasien" : "Data Penerima Credential"}
            description={
              isVisitRecord
                ? "Informasi identitas dan riwayat kunjungan medis pasien"
                : "Data verifikasi dan profil penerima credential BPJS"
            }
          >
            {isVisitRecord ? (
              <FormFields.VisitRecordInfo formData={formData} onChange={handleInputChange} />
            ) : (
              <FormFields.RecipientInfo formData={formData} onChange={handleInputChange} />
            )}
          </FormSection>

          {/* Submit Section */}
          <div className="pt-6 border-t border-primary/10">
            {submitMessage && (
              <div
                className={`mb-5 p-4 rounded-lg text-center text-sm font-medium transition-smooth ${
                  submitMessage.includes("berhasil")
                    ? "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400 border border-green-200 dark:border-green-800"
                    : "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400 border border-red-200 dark:border-red-800"
                }`}
              >
                {submitMessage}
                {errorDetails && (
                  <div className="mt-2 text-xs opacity-80">
                    {errorDetails}
                  </div>
                )}
              </div>
            )}
            <Button
              type="submit"
              disabled={isSubmitting}
              className="w-full h-12 text-base font-semibold bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary text-primary-foreground shadow-lg hover:shadow-xl transition-smooth disabled:opacity-70"
            >
              {isSubmitting ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin"></div>
                  Memproses Penerbitkan...
                </div>
              ) : (
                "Terbitkan Credential"
              )}
            </Button>
          </div>
        </form>
      </Card>

      {/* QR Code Display Section */}
      {qrCode && (
        <Card className="mt-6 p-8 shadow-2xl border border-primary/10">
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-primary mb-2">
              </h2>
              <p className="text-muted-foreground text-sm">
                Scan QR Code Anda
              </p>
            </div>
            
            <div className="flex justify-center">
              <div className="p-6 bg-secondary/30 rounded-lg border-2 border-primary/20 inline-block">
                <img 
                  src={qrCode} 
                  alt="SD-JWT Verifiable Credential QR Code" 
                  className="w-80 h-80 rounded"
                />
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}
