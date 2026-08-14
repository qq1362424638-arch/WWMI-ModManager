param(
    [string]$Combo = 'Ctrl+Alt+F10'
)

$ErrorActionPreference = 'Stop'

$proc = Get-Process -Name 'Client-Win64-Shipping' -ErrorAction SilentlyContinue
if (-not $proc) {
    Write-Output 'Game process not found: Client-Win64-Shipping'
    exit 1
}

$gameProc = $proc | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $gameProc) {
    Write-Output 'Game process found, but no visible main window'
    exit 1
}
$game = [IntPtr]$gameProc.MainWindowHandle

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class Native {
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
    [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
    [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern uint MapVirtualKey(uint uCode, uint uMapType);
    [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
}
'@

function Resolve-Vk([string]$token) {
    $key = $token.Trim().ToUpperInvariant()
    if ($key.StartsWith('VK_')) { $key = $key.Substring(3) }
    if ($key -match '^[A-Z]$') { return [int][char]$key }
    if ($key -match '^[0-9]$') { return 0x30 + [int]::Parse($key) }
    switch ($key) {
        'CTRL' { return 0xA2 }
        'CONTROL' { return 0xA2 }
        'ALT' { return 0xA4 }
        'SHIFT' { return 0xA0 }
        'UP' { return 0x26 }
        'DOWN' { return 0x28 }
        'LEFT' { return 0x25 }
        'RIGHT' { return 0x27 }
        'SPACE' { return 0x20 }
        'ESC' { return 0x1B }
        'ESCAPE' { return 0x1B }
        'ENTER' { return 0x0D }
        'RETURN' { return 0x0D }
        'TAB' { return 0x09 }
        'NUMPAD0' { return 0x60 }
        'NUMPAD1' { return 0x61 }
        'NUMPAD2' { return 0x62 }
        'NUMPAD3' { return 0x63 }
        'NUMPAD4' { return 0x64 }
        'NUMPAD5' { return 0x65 }
        'NUMPAD6' { return 0x66 }
        'NUMPAD7' { return 0x67 }
        'NUMPAD8' { return 0x68 }
        'NUMPAD9' { return 0x69 }
        'F1' { return 0x70 }
        'F2' { return 0x71 }
        'F3' { return 0x72 }
        'F4' { return 0x73 }
        'F5' { return 0x74 }
        'F6' { return 0x75 }
        'F7' { return 0x76 }
        'F8' { return 0x77 }
        'F9' { return 0x78 }
        'F10' { return 0x79 }
        'F11' { return 0x7A }
        'F12' { return 0x7B }
        '.' { return 0xBE }
        ',' { return 0xBC }
        '-' { return 0xBD }
        '=' { return 0xBB }
        '[' { return 0xDB }
        ']' { return 0xDD }
        '\' { return 0xDC }
        ';' { return 0xBA }
        "'" { return 0xDE }
        '/' { return 0xBF }
        '`' { return 0xC0 }
        default {
            throw "Unsupported key: $token"
        }
    }
}

function Parse-Combo([string]$combo) {
    $tokens = $combo -split '\+' | ForEach-Object { $_.Trim() } | Where-Object { $_ }
    if (-not $tokens) { throw 'Empty key combo' }
    $modifiers = New-Object System.Collections.Generic.List[int]
    $key = $null
    foreach ($token in $tokens) {
        switch ($token.ToUpperInvariant()) {
            'NO_MODIFIERS' { continue }
            'NO_ALT' { continue }
            'NO_CTRL' { continue }
            'NO_SHIFT' { continue }
            'CTRL' { $modifiers.Add(0xA2); continue }
            'CONTROL' { $modifiers.Add(0xA2); continue }
            'ALT' { $modifiers.Add(0xA4); continue }
            'SHIFT' { $modifiers.Add(0xA0); continue }
            default {
                if ($key -ne $null) { throw "Only one main key is supported: $combo" }
                $key = Resolve-Vk $token
            }
        }
    }
    if ($key -eq $null) { throw "Missing main key: $combo" }
    return ,@($modifiers, $key)
}

function Send-Key([int]$vk, [bool]$keyUp) {
    $scan = [byte]([Native]::MapVirtualKey([uint32]$vk, 0) -band 0xff)
    $flags = 0
    if ($keyUp) { $flags = $flags -bor 0x0002 }
    [Native]::keybd_event([byte]$vk, $scan, [uint32]$flags, [UIntPtr]::Zero)
}

function Send-ComboInput([string]$combo) {
    $parsed = Parse-Combo $combo
    $modifiers = $parsed[0]
    $key = $parsed[1]
    foreach ($vk in $modifiers) {
        Send-Key $vk $false
        Start-Sleep -Milliseconds 15
    }
    Send-Key $key $false
    Start-Sleep -Milliseconds 35
    Send-Key $key $true
    for ($i = $modifiers.Count - 1; $i -ge 0; $i--) {
        Start-Sleep -Milliseconds 15
        Send-Key $modifiers[$i] $true
    }
    return $true
}

$previous = [Native]::GetForegroundWindow()
$currentThread = [Native]::GetCurrentThreadId()
$previousThread = [uint32]0
$gameThread = [uint32]0
if ($previous -ne [IntPtr]::Zero) {
    $null = [Native]::GetWindowThreadProcessId($previous, [ref]$previousThread)
}
$null = [Native]::GetWindowThreadProcessId($game, [ref]$gameThread)

if ($previousThread -ne 0) { [void][Native]::AttachThreadInput($currentThread, $previousThread, $true) }
if ($gameThread -ne 0) { [void][Native]::AttachThreadInput($currentThread, $gameThread, $true) }
[void][Native]::ShowWindowAsync($game, 9)
[void][Native]::SetForegroundWindow($game)
Start-Sleep -Milliseconds 100

$sent = Send-ComboInput $Combo
Start-Sleep -Milliseconds 80

if ($previous -ne [IntPtr]::Zero) { [void][Native]::SetForegroundWindow($previous) }
if ($gameThread -ne 0) { [void][Native]::AttachThreadInput($currentThread, $gameThread, $false) }
if ($previousThread -ne 0) { [void][Native]::AttachThreadInput($currentThread, $previousThread, $false) }

if (-not $sent) {
    Write-Output 'Hotkey send failed'
    exit 1
}
Write-Output "Hotkey sent: $Combo"
