$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class NativeToken {
    [DllImport("kernel32.dll", SetLastError=true)] public static extern IntPtr OpenProcess(UInt32 access, bool inherit, UInt32 processId);
    [DllImport("advapi32.dll", SetLastError=true)] public static extern bool OpenProcessToken(IntPtr processHandle, UInt32 desiredAccess, out IntPtr tokenHandle);
    [DllImport("advapi32.dll", SetLastError=true)] public static extern bool GetTokenInformation(IntPtr tokenHandle, int tokenInformationClass, IntPtr tokenInformation, int tokenInformationLength, out int returnLength);
    [DllImport("kernel32.dll", SetLastError=true)] public static extern bool CloseHandle(IntPtr handle);
}
'@

function Get-Integrity([int]$ProcessId) {
    $process = [NativeToken]::OpenProcess(0x1000, $false, [uint32]$ProcessId)
    if ($process -eq [IntPtr]::Zero) { return "OpenProcessFail:$([Runtime.InteropServices.Marshal]::GetLastWin32Error())" }
    $token = [IntPtr]::Zero
    try {
        if (-not [NativeToken]::OpenProcessToken($process, 0x0008, [ref]$token)) {
            return "OpenTokenFail:$([Runtime.InteropServices.Marshal]::GetLastWin32Error())"
        }
        $length = 0
        [void][NativeToken]::GetTokenInformation($token, 25, [IntPtr]::Zero, 0, [ref]$length)
        $buffer = [Runtime.InteropServices.Marshal]::AllocHGlobal($length)
        try {
            if (-not [NativeToken]::GetTokenInformation($token, 25, $buffer, $length, [ref]$length)) {
                return "GetTokenFail:$([Runtime.InteropServices.Marshal]::GetLastWin32Error())"
            }
            $sid = [Runtime.InteropServices.Marshal]::ReadIntPtr($buffer)
            $count = [Runtime.InteropServices.Marshal]::ReadByte($sid, 1)
            $rid = [Runtime.InteropServices.Marshal]::ReadInt32($sid, 8 + 4 * ($count - 1))
            if ($rid -ge 0x4000) { return 'System' }
            if ($rid -ge 0x3000) { return 'High/Admin' }
            if ($rid -ge 0x2000) { return 'Medium/User' }
            if ($rid -ge 0x1000) { return 'Low' }
            return "RID:$rid"
        } finally {
            [Runtime.InteropServices.Marshal]::FreeHGlobal($buffer)
        }
    } finally {
        if ($token -ne [IntPtr]::Zero) { [void][NativeToken]::CloseHandle($token) }
        [void][NativeToken]::CloseHandle($process)
    }
}

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
$isAdmin = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
$game = Get-Process -Name 'Client-Win64-Shipping' -ErrorAction SilentlyContinue |
    Where-Object { $_.MainWindowHandle -ne 0 } |
    Select-Object -First 1

$result = [ordered]@{
    currentAdmin = $isAdmin
    gameFound = [bool]$game
    gameId = if ($game) { $game.Id } else { $null }
    gameIntegrity = if ($game) { Get-Integrity $game.Id } else { '' }
}
$result | ConvertTo-Json -Compress
