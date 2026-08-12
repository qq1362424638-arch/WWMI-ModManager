$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (Test-Path "$root\dist") {
  Get-ChildItem -LiteralPath "$root\dist" -Filter 'WWMI-ModManager-Setup-*.exe' -ErrorAction SilentlyContinue |
    Remove-Item -Force
  Get-ChildItem -LiteralPath "$root\dist" -Filter 'WWMI-ModManager-Setup-*.exe.blockmap' -ErrorAction SilentlyContinue |
    Remove-Item -Force
}

npm.cmd run dist:win

$installer = Get-ChildItem -LiteralPath "$root\dist" -Filter 'WWMI-ModManager-Setup-*-x64.exe' |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

if (-not $installer) {
  throw 'Installer was not generated.'
}

$blockMap = "$($installer.FullName).blockmap"
$files = @($installer.FullName)
if (Test-Path $blockMap) {
  $files += $blockMap
}

Write-Host ''
Write-Host 'GitHub Release files:'
foreach ($file in $files) {
  $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $file).Hash
  Write-Host "  $file"
  Write-Host "  SHA256: $hash"
}

Write-Host ''
if (-not $env:CSC_LINK) {
  Write-Host 'Notice: CSC_LINK is not set, so the installer is unsigned and Windows SmartScreen may warn new users.'
  Write-Host 'Set CSC_LINK and CSC_KEY_PASSWORD before building to sign release artifacts.'
}
