export function normalizeDidForStorage(did: string): string {
  return String(did || '').trim().replace(/\/+$/, '')
}

export function areEquivalentDid(left?: string | null, right?: string | null): boolean {
  if (!left || !right) return false

  const a = normalizeDidForStorage(left)
  const b = normalizeDidForStorage(right)

  if (!a || !b) return false
  if (a === b) return true

  // did:web values are commonly serialized with mixed casing by wallets.
  if (/^did:web:/i.test(a) && /^did:web:/i.test(b)) {
    return a.toLowerCase() === b.toLowerCase()
  }

  return false
}
