"use client"

import type React from "react"
import { Input } from "@/components/ui/input"

interface FormDataType {
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

interface FieldsProps {
  formData: FormDataType
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void
}

export const DocumentInfo = ({ formData, onChange }: FieldsProps) => (
  <>
    <div className="grid sm:grid-cols-2 gap-5">
      <div className="space-y-2">
        <label className="block text-sm font-semibold text-foreground">
          Document ID <span className="text-destructive">*</span>
        </label>
        <Input
          type="text"
          name="documentId"
          placeholder="Auto-generated..."
          value={formData.documentId}
          onChange={onChange}
          required
          readOnly
          className="bg-muted/50 border-border text-foreground placeholder:text-muted-foreground input-focus transition-smooth font-mono cursor-not-allowed"
        />
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-semibold text-foreground">
          Document Hash <span className="text-destructive">*</span>
        </label>
        <Input
          type="text"
          name="documentName"
          placeholder="Auto-generated SHA-256 hash..."
          value={formData.documentName}
          onChange={onChange}
          required
          readOnly
          className="bg-muted/50 border-border text-foreground placeholder:text-muted-foreground input-focus transition-smooth font-mono text-xs cursor-not-allowed"
        />
      </div>
    </div>

    <div className="grid sm:grid-cols-2 gap-5">
      <div className="space-y-2">
        <label className="block text-sm font-semibold text-foreground">
          Document Type <span className="text-destructive">*</span>
        </label>
        <select
          name="documentType"
          value={formData.documentType}
          onChange={onChange}
          className="w-full px-4 py-2.5 bg-input border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 transition-smooth appearance-none cursor-pointer"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23666' d='M6 9L1 4h10z'/%3E%3C/svg%3E")`,
            backgroundRepeat: "no-repeat",
            backgroundPosition: "right 1rem center",
            paddingRight: "2.5rem",
          }}
        >
          <option value="Kartu Peserta BPJS">Kartu Peserta BPJS</option>
          <option value="Riwayat Kunjungan Pasien">Riwayat Kunjungan Pasien</option>
        </select>
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-semibold text-foreground">
          Holder DID <span className="text-destructive">*</span>
        </label>
        <Input
          type="text"
          name="holderDid"
          placeholder="did:web:202.155.132.71"
          value={formData.holderDid}
          onChange={onChange}
          required
          readOnly
          className="bg-muted/50 border-border text-foreground placeholder:text-muted-foreground input-focus transition-smooth font-mono text-sm cursor-not-allowed"
        />
      </div>
    </div>
  </>
)

export const RecipientInfo = ({ formData, onChange }: FieldsProps) => (
  <>
    <div className="grid sm:grid-cols-2 gap-5">
      <div className="space-y-2">
        <label className="block text-sm font-semibold text-foreground">
          Nama Lengkap <span className="text-destructive">*</span>
        </label>
        <Input
          type="text"
          name="fullName"
          placeholder="Ahmad Sulaiman"
          value={formData.fullName}
          onChange={onChange}
          required
          className="bg-input border-border text-foreground placeholder:text-muted-foreground input-focus transition-smooth"
        />
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-semibold text-foreground">
          Nomor BPJS <span className="text-destructive">*</span>
        </label>
        <Input
          type="text"
          name="bpjsNumber"
          placeholder="0012345678901"
          value={formData.bpjsNumber}
          onChange={onChange}
          required
          className="bg-input border-border text-foreground placeholder:text-muted-foreground input-focus transition-smooth"
        />
      </div>
    </div>

    <div className="grid sm:grid-cols-2 gap-5">
      <div className="space-y-2">
        <label className="block text-sm font-semibold text-foreground">
          NIK <span className="text-destructive">*</span>
        </label>
        <Input
          type="text"
          name="nik"
          placeholder="1201234567890123"
          value={formData.nik}
          onChange={onChange}
          required
          className="bg-input border-border text-foreground placeholder:text-muted-foreground input-focus transition-smooth"
        />
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-semibold text-foreground">
          Tanggal Lahir <span className="text-destructive">*</span>
        </label>
        <Input
          type="date"
          name="dateOfBirth"
          value={formData.dateOfBirth}
          onChange={onChange}
          required
          className="bg-input border-border text-foreground placeholder:text-muted-foreground input-focus transition-smooth"
        />
      </div>
    </div>

    <div className="space-y-2">
      <label className="block text-sm font-semibold text-foreground">
        Alamat <span className="text-destructive">*</span>
      </label>
      <textarea
        name="address"
        placeholder="Jl. Merdeka No. 123, Jakarta"
        value={formData.address}
        onChange={onChange}
        required
        rows={3}
        className="w-full px-4 py-2.5 bg-input border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 transition-smooth resize-none"
      />
    </div>

    <div className="grid sm:grid-cols-2 gap-5">
      <div className="space-y-2">
        <label className="block text-sm font-semibold text-foreground">
          Status Aktif <span className="text-destructive">*</span>
        </label>
        <select
          name="status"
          value={formData.status}
          onChange={onChange}
          className="w-full px-4 py-2.5 bg-input border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 transition-smooth appearance-none cursor-pointer"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23666' d='M6 9L1 4h10z'/%3E%3C/svg%3E")`,
            backgroundRepeat: "no-repeat",
            backgroundPosition: "right 1rem center",
            paddingRight: "2.5rem",
          }}
        >
          <option value="Aktif">Aktif</option>
          <option value="Tidak Aktif">Tidak Aktif</option>
          <option value="Suspended">Suspended</option>
        </select>
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-semibold text-foreground">
          Fasilitas Pertama <span className="text-destructive">*</span>
        </label>
        <Input
          type="text"
          name="facility"
          placeholder="Puskesmas Kebayoran Baru"
          value={formData.facility}
          onChange={onChange}
          required
          className="bg-input border-border text-foreground placeholder:text-muted-foreground input-focus transition-smooth"
        />
      </div>
    </div>
  </>
)

export const VisitRecordInfo = ({ formData, onChange }: FieldsProps) => (
  <>
    <div className="grid sm:grid-cols-2 gap-5">
      <div className="space-y-2">
        <label className="block text-sm font-semibold text-foreground">
          Nama Lengkap <span className="text-destructive">*</span>
        </label>
        <Input
          type="text"
          name="fullName"
          placeholder="Ahmad Sulaiman"
          value={formData.fullName}
          onChange={onChange}
          required
          className="bg-input border-border text-foreground placeholder:text-muted-foreground input-focus transition-smooth"
        />
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-semibold text-foreground">
          Nomor BPJS <span className="text-destructive">*</span>
        </label>
        <Input
          type="text"
          name="bpjsNumber"
          placeholder="0012345678901"
          value={formData.bpjsNumber}
          onChange={onChange}
          required
          className="bg-input border-border text-foreground placeholder:text-muted-foreground input-focus transition-smooth"
        />
      </div>
    </div>

    <div className="grid sm:grid-cols-2 gap-5">
      <div className="space-y-2">
        <label className="block text-sm font-semibold text-foreground">
          NIK <span className="text-destructive">*</span>
        </label>
        <Input
          type="text"
          name="nik"
          placeholder="1201234567890123"
          value={formData.nik}
          onChange={onChange}
          required
          className="bg-input border-border text-foreground placeholder:text-muted-foreground input-focus transition-smooth"
        />
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-semibold text-foreground">
          Tanggal Lahir <span className="text-destructive">*</span>
        </label>
        <Input
          type="date"
          name="dateOfBirth"
          value={formData.dateOfBirth}
          onChange={onChange}
          required
          className="bg-input border-border text-foreground placeholder:text-muted-foreground input-focus transition-smooth"
        />
      </div>
    </div>

    <div className="space-y-2">
      <label className="block text-sm font-semibold text-foreground">
        Alamat <span className="text-destructive">*</span>
      </label>
      <textarea
        name="address"
        placeholder="Jl. Merdeka No. 123, Jakarta"
        value={formData.address}
        onChange={onChange}
        required
        rows={3}
        className="w-full px-4 py-2.5 bg-input border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 transition-smooth resize-none"
      />
    </div>

    <div className="grid sm:grid-cols-2 gap-5">
      <div className="space-y-2">
        <label className="block text-sm font-semibold text-foreground">
          Tanggal Kunjungan <span className="text-destructive">*</span>
        </label>
        <Input
          type="date"
          name="visitDate"
          value={formData.visitDate}
          onChange={onChange}
          required
          className="bg-input border-border text-foreground placeholder:text-muted-foreground input-focus transition-smooth"
        />
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-semibold text-foreground">
          Poli <span className="text-destructive">*</span>
        </label>
        <Input
          type="text"
          name="clinic"
          placeholder="Poli Umum"
          value={formData.clinic}
          onChange={onChange}
          required
          className="bg-input border-border text-foreground placeholder:text-muted-foreground input-focus transition-smooth"
        />
      </div>
    </div>

    <div className="space-y-2">
      <label className="block text-sm font-semibold text-foreground">
        Diagnosa <span className="text-destructive">*</span>
      </label>
      <Input
        type="text"
        name="diagnosis"
        placeholder="Demam Berdarah Dengue"
        value={formData.diagnosis}
        onChange={onChange}
        required
        className="bg-input border-border text-foreground placeholder:text-muted-foreground input-focus transition-smooth"
      />
    </div>

    <div className="space-y-2">
      <label className="block text-sm font-semibold text-foreground">
        Dokter <span className="text-destructive">*</span>
      </label>
      <Input
        type="text"
        name="doctor"
        placeholder="dr. Budi Santoso, Sp.PD"
        value={formData.doctor}
        onChange={onChange}
        required
        className="bg-input border-border text-foreground placeholder:text-muted-foreground input-focus transition-smooth"
      />
    </div>

    <div className="space-y-2">
      <label className="block text-sm font-semibold text-foreground">
        Tindakan <span className="text-destructive">*</span>
      </label>
      <textarea
        name="treatment"
        placeholder="Pemeriksaan fisik, Pemeriksaan darah lengkap, Pemberian obat"
        value={formData.treatment}
        onChange={onChange}
        required
        rows={3}
        className="w-full px-4 py-2.5 bg-input border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 transition-smooth resize-none"
      />
    </div>
  </>
)

export default {
  DocumentInfo,
  RecipientInfo,
  VisitRecordInfo,
}
