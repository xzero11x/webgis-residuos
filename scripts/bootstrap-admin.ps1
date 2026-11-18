param(
  [Parameter(Mandatory=$true)][ValidatePattern('^[a-zA-Z][a-zA-Z0-9_]{0,62}$')][string]$BaseConfirmada,
  [Parameter(Mandatory=$true)][ValidatePattern('^[a-z0-9_-]{3,50}$')][string]$Usuario,
  [Parameter(Mandatory=$true)][ValidateLength(2,120)][string]$Nombre
)
$ErrorActionPreference = 'Stop'
$previousEncoding = $OutputEncoding
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$secure = Read-Host 'Contraseña inicial (mínimo 16 caracteres)' -AsSecureString
$address = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  $secret = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($address)
  if ($secret.Length -lt 16 -or $secret.Length -gt 200) { throw 'Longitud de contraseña no válida.' }
  $payload = @{baseConfirmada=$BaseConfirmada;usuario=$Usuario;nombre=$Nombre;password=$secret} | ConvertTo-Json -Compress
  $payload | docker compose exec -T backend node backend/dist/db/bootstrap-admin.js
  if ($LASTEXITCODE -ne 0) { throw 'No se creó el acceso inicial. No se modificaron cuentas existentes.' }
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($address)
  $secret = $null
  $payload = $null
  $secure.Dispose()
  $OutputEncoding = $previousEncoding
}
