import fs from 'fs'
import path from 'path'
import { PDFParse } from 'pdf-parse'
import { importTrustedRegistryIdentities, type RegistryIdentityInput } from '../services/registry.service.js'
import { disconnectDatabase } from '../lib/prisma.js'

function parseCsvLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (char === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
      continue
    }

    current += char
  }

  result.push(current.trim())
  return result
}

function parseCsv(content: string): RegistryIdentityInput[] {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  if (lines.length < 2) {
    throw new Error('CSV must contain header and at least one row')
  }

  const header = parseCsvLine(lines[0]).map((h) => h.toLowerCase())

  const nikIdx = header.findIndex((h) => h === 'nik')
  const namaIdx = header.findIndex((h) => h === 'nama' || h === 'fullname' || h === 'full_name')
  const tanggalIdx = header.findIndex((h) => h === 'tanggal_lahir' || h === 'tanggalLahir'.toLowerCase() || h === 'dob')

  if (nikIdx < 0 || namaIdx < 0) {
    throw new Error('CSV header must include at least nik and nama columns')
  }

  return lines.slice(1).map((line) => {
    const cols = parseCsvLine(line)
    return {
      nik: cols[nikIdx] || '',
      nama: cols[namaIdx] || '',
      tanggalLahir: tanggalIdx >= 0 ? cols[tanggalIdx] || undefined : undefined,
      source: 'PT21_IMPORT',
      rawData: Object.fromEntries(header.map((key, idx) => [key, cols[idx] || null])),
    }
  })
}

function parseJson(content: string): RegistryIdentityInput[] {
  const parsed = JSON.parse(content)
  if (!Array.isArray(parsed)) {
    throw new Error('JSON file must contain an array of records')
  }

  return parsed.map((item: Record<string, unknown>) => ({
    nik: String(item.nik || item.NIK || ''),
    nama: String(item.nama || item.fullName || item.full_name || ''),
    tanggalLahir: item.tanggal_lahir
      ? String(item.tanggal_lahir)
      : item.tanggalLahir
        ? String(item.tanggalLahir)
        : item.dob
          ? String(item.dob)
          : undefined,
    source: 'PT21_IMPORT',
    rawData: item,
  }))
}

function normalizeDateToken(input?: string): string | undefined {
  if (!input) {
    return undefined
  }

  const value = input.trim()
  if (!value) {
    return undefined
  }

  const dmy = value.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/)
  if (dmy) {
    const day = dmy[1].padStart(2, '0')
    const month = dmy[2].padStart(2, '0')
    const yearRaw = dmy[3]
    const year = yearRaw.length === 2 ? `19${yearRaw}` : yearRaw
    return `${year}-${month}-${day}`
  }

  const ymd = value.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/)
  if (ymd) {
    const year = ymd[1]
    const month = ymd[2].padStart(2, '0')
    const day = ymd[3].padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  return undefined
}

function normalizeNameToken(input: string): string {
  return input
    .replace(/[|;]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function parsePdfText(content: string): RegistryIdentityInput[] {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  const recordsByNik = new Map<string, RegistryIdentityInput>()

  for (const line of lines) {
    const nikMatch = line.match(/(?:^|\D)(\d{16})(?:\D|$)/)
    if (!nikMatch) {
      continue
    }

    const nik = nikMatch[1]
    const lineWithoutNik = line.replace(nik, ' ').replace(/\s+/g, ' ').trim()
    const dateMatch = lineWithoutNik.match(/(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}|\d{4}[\/-]\d{1,2}[\/-]\d{1,2})/)
    const tanggalLahir = normalizeDateToken(dateMatch?.[1])

    let namaSegment = ''
    const genderMatch = lineWithoutNik.match(/\b(Laki-Laki|Perempuan)\b/i)

    if (genderMatch && typeof genderMatch.index === 'number') {
      namaSegment = lineWithoutNik.slice(0, genderMatch.index).trim()
    } else {
      const afterNik = line.slice(line.indexOf(nik) + nik.length).trim()
      namaSegment = dateMatch && typeof dateMatch.index === 'number'
        ? lineWithoutNik.slice(0, dateMatch.index).trim()
        : afterNik || lineWithoutNik
    }

    // Drop leading table row number if present.
    namaSegment = namaSegment.replace(/^\d+\s+/, '').trim()
    const nama = normalizeNameToken(namaSegment)

    // Skip likely header/noise lines while keeping person names.
    if (nama.length < 2 || /^nik$/i.test(nama) || /^nama$/i.test(nama)) {
      continue
    }

    recordsByNik.set(nik, {
      nik,
      nama,
      tanggalLahir,
      source: 'PT21_PDF_IMPORT',
      rawData: {
        rawLine: line,
      },
    })
  }

  return [...recordsByNik.values()]
}

async function parsePdf(buffer: Buffer): Promise<RegistryIdentityInput[]> {
  const parser = new PDFParse({ data: buffer })
  const parsed = await parser.getText()
  await parser.destroy()

  const records = parsePdfText(parsed.text || '')

  if (records.length === 0) {
    throw new Error(
      'No valid identity records found in PDF. Ensure PDF contains selectable text with NIK (16 digit), nama, and optional tanggal_lahir.',
    )
  }

  return records
}

async function main() {
  const inputPath = process.argv[2]

  if (!inputPath) {
    throw new Error('Usage: pnpm registry:import -- <path-to-json-or-csv-or-pdf>')
  }

  const resolvedPath = path.resolve(process.cwd(), inputPath)
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Input file not found: ${resolvedPath}`)
  }

  const fileBuffer = fs.readFileSync(resolvedPath)
  const content = fileBuffer.toString('utf-8')
  const ext = path.extname(resolvedPath).toLowerCase()

  let records: RegistryIdentityInput[]
  if (ext === '.json') {
    records = parseJson(content)
  } else if (ext === '.csv') {
    records = parseCsv(content)
  } else if (ext === '.pdf') {
    records = await parsePdf(fileBuffer)
  } else {
    throw new Error('Only .json, .csv, and .pdf are supported.')
  }

  const result = await importTrustedRegistryIdentities(records)
  console.log('Registry import result:')
  console.log(JSON.stringify(result, null, 2))
}

main()
  .catch((error) => {
    console.error('❌ Registry import failed:', error.message)
    process.exitCode = 1
  })
  .finally(async () => {
    await disconnectDatabase()
  })
