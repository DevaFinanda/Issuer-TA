# DID Holder
$did = "did:jwk:eyJrdHkiOiJPS1AiLCJjcnYiOiJFZDI1NTE5IiwieCI6InpfeVJtSFR5RFFoeE1ZWEJBS19DWENKclBZODk3djYyUVdGenhIazFDMmsifQ"

# Hilangkan prefix did:jwk:
$jwk = $did -replace "^did:jwk:", ""

# Base64URL -> Base64
$jwk = $jwk.Replace('-', '+').Replace('_', '/')

switch ($jwk.Length % 4) {
    2 { $jwk += "==" }
    3 { $jwk += "=" }
}

# Decode
$json = [System.Text.Encoding]::UTF8.GetString(
    [System.Convert]::FromBase64String($jwk)
)

Write-Host "Decoded JWK:"
Write-Host $json