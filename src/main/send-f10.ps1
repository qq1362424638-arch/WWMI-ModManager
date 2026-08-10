# ---------- 向鸣潮游戏窗口发送 F10 重载热键 ----------
# 找不到游戏进程/窗口时退出码 1；成功时输出 OK
# F10 会被 WWI 捕获用于 reload_fixes（见 d3dx.ini）

$ErrorActionPreference = 'Stop'

# 查找游戏进程（鸣潮客户端）
$proc = Get-Process -Name 'Client-Win64-Shipping' -ErrorAction SilentlyContinue
if (-not $proc) {
    Write-Output '未找到游戏进程 Client-Win64-Shipping'
    exit 1
}

# 取主窗口句柄（可能同一进程有多个实例，取第一个有窗口的）
$hwnd = $proc | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $hwnd) {
    Write-Output '找到游戏进程但无可见窗口'
    exit 1
}
$h = $hwnd.MainWindowHandle

# 通过 user32 发送按键（keybd_event），F10 = 0x79
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class Native {
    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
}
'@

# 激发游戏窗口，确保按键被游戏捕获
[Native]::SetForegroundWindow($h) | Out-Null
Start-Sleep -Milliseconds 50

# 按下再抬起 F10
[Native]::keybd_event(0x79, 0, 0, [UIntPtr]::Zero)     # KEYEVENTF_KEYDOWN
[Native]::keybd_event(0x79, 0, 2, [UIntPtr]::Zero)     # KEYEVENTF_KEYUP
Write-Output 'F10 sent'