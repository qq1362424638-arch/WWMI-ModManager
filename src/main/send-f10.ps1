$ErrorActionPreference = 'Stop'

$proc = Get-Process -Name 'Client-Win64-Shipping' -ErrorAction SilentlyContinue
if (-not $proc) {
    Write-Output 'Game process not found: Client-Win64-Shipping'
    exit 1
}

$hwnd = $proc | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $hwnd) {
    Write-Output 'Game process found, but no visible main window'
    exit 1
}
$h = $hwnd.MainWindowHandle

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class Native {
    [DllImport("user32.dll")]
    public static extern bool PostMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);
}
'@

function Make-LParam([int]$scanCode, [bool]$keyUp, [bool]$sysKey) {
    $value = 1 -bor ($scanCode -shl 16)
    if ($sysKey) { $value = $value -bor (1 -shl 29) }
    if ($keyUp) { $value = $value -bor (1 -shl 30) -bor (1 -shl 31) }
    return [IntPtr]$value
}

function Post-Key([int]$msg, [int]$vk, [int]$scanCode, [bool]$keyUp, [bool]$sysKey) {
    [Native]::PostMessage($h, $msg, [IntPtr]$vk, (Make-LParam $scanCode $keyUp $sysKey)) | Out-Null
}

# Background post Ctrl+Alt+F10 for wipe_user_config.
Post-Key 0x0100 0x10 0x2A $true  $false
Post-Key 0x0100 0x11 0x1D $false $false
Post-Key 0x0104 0x12 0x38 $false $true
Post-Key 0x0104 0x79 0x44 $false $true
Post-Key 0x0105 0x79 0x44 $true  $true
Post-Key 0x0105 0x12 0x38 $true  $true
Post-Key 0x0101 0x11 0x1D $true  $false

Write-Output 'Load mod hotkey posted'
