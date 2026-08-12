$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$cscCandidates = @(
  "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe",
  "$env:WINDIR\Microsoft.NET\Framework\v4.0.30319\csc.exe"
)
$csc = $cscCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $csc) {
  throw 'csc.exe not found. Install .NET Framework build tools or run from a developer prompt.'
}

& $csc `
  /nologo `
  /target:winexe `
  /platform:x64 `
  /optimize+ `
  /win32icon:"$PSScriptRoot\icon.ico" `
  /reference:System.Windows.Forms.dll `
  /out:"$root\WWMI-ModManager.exe" `
  "$PSScriptRoot\launcher.cs"

Write-Host "Launcher written to $root\WWMI-ModManager.exe"
