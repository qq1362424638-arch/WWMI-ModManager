param(
    [Parameter(Mandatory = $true)][string]$Target,
    [string]$Events = '',
    [string]$StopFile = '',
    [string]$StopToken = ''
)

$ErrorActionPreference = 'Stop'
$PollIntervalMs = 8
$AllBindings = New-Object System.Collections.Generic.List[object]
$Active = @{}
$RegisteredHotkeys = New-Object System.Collections.Generic.List[object]
$PolledHotkeys = New-Object System.Collections.Generic.List[object]

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
[StructLayout(LayoutKind.Sequential)]
public struct KeyMessage {
    public IntPtr HWnd;
    public uint Message;
    public UIntPtr WParam;
    public IntPtr LParam;
    public uint Time;
    public int PointX;
    public int PointY;
}
public static class KeyNative {
    [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int vKey);
    [DllImport("user32.dll", SetLastError = true)] public static extern bool RegisterHotKey(IntPtr hWnd, int id, uint modifiers, uint vk);
    [DllImport("user32.dll", SetLastError = true)] public static extern bool UnregisterHotKey(IntPtr hWnd, int id);
    [DllImport("user32.dll")] public static extern bool PeekMessage(out KeyMessage message, IntPtr hWnd, uint minFilter, uint maxFilter, uint removeMsg);
}
'@

$VkCodes = @{
    'up'=0x26; 'down'=0x28; 'left'=0x25; 'right'=0x27;
    'space'=0x20; 'esc'=0x1B; 'enter'=0x0D; 'tab'=0x09;
    'backspace'=0x08; 'delete'=0x2E; 'home'=0x24; 'end'=0x23;
    'page up'=0x21; 'page down'=0x22;
    '.'=0xBE; 'period'=0xBE; ','=0xBC; 'comma'=0xBC; '='=0xBB;
    '['=0xDB; ']'=0xDD; '\'=0xDC; ';'=0xBA; "'"=0xDE; '-'=0xBD; '/'=0xBF; '`'=0xC0
}
$VkCodes['vk_up'] = 0x26; $VkCodes['vk_down'] = 0x28
$VkCodes['vk_left'] = 0x25; $VkCodes['vk_right'] = 0x27
$VkCodes['vk_space'] = 0x20; $VkCodes['vk_escape'] = 0x1B
$VkCodes['vk_return'] = 0x0D; $VkCodes['vk_enter'] = 0x0D
$VkCodes['vk_tab'] = 0x09; $VkCodes['vk_back'] = 0x08
$VkCodes['vk_backspace'] = 0x08; $VkCodes['vk_delete'] = 0x2E
$VkCodes['vk_home'] = 0x24; $VkCodes['vk_end'] = 0x23
$VkCodes['vk_prior'] = 0x21; $VkCodes['vk_next'] = 0x22
$VkCodes['vk_shift'] = 0x10; $VkCodes['vk_control'] = 0x11
$VkCodes['vk_ctrl'] = 0x11; $VkCodes['vk_menu'] = 0x12
$VkCodes['vk_lshift'] = 0xA0; $VkCodes['vk_rshift'] = 0xA1
$VkCodes['vk_lcontrol'] = 0xA2; $VkCodes['vk_rcontrol'] = 0xA3
$VkCodes['vk_lmenu'] = 0xA4; $VkCodes['vk_rmenu'] = 0xA5
for ($i = 0; $i -le 9; $i++) {
    $VkCodes[[string]$i] = 0x30 + $i
    $VkCodes["numpad$i"] = 0x60 + $i
    $VkCodes["vk_$i"] = 0x30 + $i
    $VkCodes["vk_numpad$i"] = 0x60 + $i
}
for ($i = 0; $i -lt 26; $i++) {
    $letter = [char](97 + $i)
    $VkCodes[$letter] = 0x41 + $i
    $VkCodes["vk_$letter"] = 0x41 + $i
}
for ($i = 1; $i -le 12; $i++) {
    $VkCodes["f$i"] = 0x6F + $i
    $VkCodes["vk_f$i"] = 0x6F + $i
}

$VkMap = @{
    'VK_UP'='up'; 'UP'='up'; 'VK_DOWN'='down'; 'DOWN'='down'; 'VK_LEFT'='left'; 'LEFT'='left'; 'VK_RIGHT'='right'; 'RIGHT'='right';
    'VK_SPACE'='space'; 'VK_ESCAPE'='esc'; 'VK_RETURN'='enter'; 'VK_TAB'='tab'; 'VK_BACK'='backspace'; 'VK_DELETE'='delete';
    'VK_HOME'='home'; 'VK_END'='end'; 'VK_PRIOR'='page up'; 'VK_NEXT'='page down';
    'VK_F1'='f1'; 'VK_F2'='f2'; 'VK_F3'='f3'; 'VK_F4'='f4'; 'VK_F5'='f5'; 'VK_F6'='f6'; 'VK_F7'='f7'; 'VK_F8'='f8'; 'VK_F9'='f9'; 'VK_F10'='f10'; 'VK_F11'='f11'; 'VK_F12'='f12';
    'VK_OEM_PERIOD'='.'; 'OEM_PERIOD'='.'; 'VK_OEM_COMMA'=','; 'OEM_COMMA'=','; 'VK_OEM_PLUS'='='; 'OEM_PLUS'='=';
    'VK_OEM_4'='['; 'OEM_4'='['; 'VK_OEM_6'=']'; 'OEM_6'=']'; 'VK_OEM_5'='\'; 'OEM_5'='\';
    'VK_OEM_1'=';'; 'OEM_1'=';'; 'VK_OEM_7'="'"; 'OEM_7'="'"; 'VK_OEM_MINUS'='-'; 'OEM_MINUS'='-';
    'VK_OEM_2'='/'; 'OEM_2'='/'; 'VK_OEM_3'='`'; 'OEM_3'='`'; 'VK_OEM_8'='`'; 'OEM_8'='`';
    'VK_NUMPAD0'='numpad0'; 'NUMPAD0'='numpad0'; 'VK_NUMPAD1'='numpad1'; 'NUMPAD1'='numpad1';
    'VK_NUMPAD2'='numpad2'; 'NUMPAD2'='numpad2'; 'VK_NUMPAD3'='numpad3'; 'NUMPAD3'='numpad3';
    'VK_NUMPAD4'='numpad4'; 'NUMPAD4'='numpad4'; 'VK_NUMPAD5'='numpad5'; 'NUMPAD5'='numpad5';
    'VK_NUMPAD6'='numpad6'; 'NUMPAD6'='numpad6'; 'VK_NUMPAD7'='numpad7'; 'NUMPAD7'='numpad7';
    'VK_NUMPAD8'='numpad8'; 'NUMPAD8'='numpad8'; 'VK_NUMPAD9'='numpad9'; 'NUMPAD9'='numpad9'
}

function Emit-Event($Payload) {
    if (-not $Events) { return }
    try {
        $dir = Split-Path -Parent $Events
        if ($dir) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
        ($Payload | ConvertTo-Json -Compress -Depth 5) + "`n" | Add-Content -LiteralPath $Events -Encoding UTF8
    } catch {}
}

function Convert-Key($Key) {
    $keyText = [string]$Key
    if (-not $keyText.Trim()) { return '' }
    $upper = $keyText.ToUpperInvariant()
    if ($VkMap.ContainsKey($upper)) { return $VkMap[$upper] }
    switch ($keyText.ToLowerInvariant()) {
        'leftbracket' { '[' }
        'rightbracket' { ']' }
        'minus' { '-' }
        'equal' { '=' }
        default { $keyText.ToLowerInvariant() }
    }
}

function Parse-Key($Raw) {
    $mods = New-Object System.Collections.Generic.List[string]
    $remaining = New-Object System.Collections.Generic.List[string]
    foreach ($token in ([string]$Raw).Trim().Replace('+', ' ').Split(' ', [StringSplitOptions]::RemoveEmptyEntries)) {
        $lower = $token.ToLowerInvariant()
        if ($lower -in @('no_modifiers','no_alt','no_ctrl','no_shift')) { continue }
        if ($lower -eq 'control') { $lower = 'ctrl' }
        if ($lower -in @('alt','ctrl','shift')) {
            if (-not $mods.Contains($lower)) { $mods.Add($lower) }
        } else {
            $remaining.Add($token)
        }
    }
    $key = Convert-Key ($remaining -join ' ')
    if (-not $key) { return '' }
    $ordered = @('alt','ctrl','shift') | Where-Object { $mods.Contains($_) }
    if ($ordered.Count) { return ((@($ordered) + @($key)) -join '+') }
    return $key
}

function Parse-Hotkey($Hotkey) {
    $modifiers = 0
    $modifierKeys = @{}
    $keyCode = $null
    foreach ($part in ([string]$Hotkey).Replace('+', ' ').Split(' ', [StringSplitOptions]::RemoveEmptyEntries)) {
        $part = $part.Trim().ToLowerInvariant()
        if ($part -in @('no_modifiers','no_alt','no_ctrl','no_shift')) { continue }
        if ($part -in @('control','ctrl')) { $part = 'ctrl'; $modifiers = $modifiers -bor 2; $modifierKeys.ctrl = 0; continue }
        if ($part -in @('rctrl','rightctrl','rightcontrol','vk_rcontrol')) { $modifiers = $modifiers -bor 2; $modifierKeys.ctrl = 0xA3; continue }
        if ($part -in @('lctrl','leftctrl','leftcontrol','vk_lcontrol')) { $modifiers = $modifiers -bor 2; $modifierKeys.ctrl = 0xA2; continue }
        if ($part -in @('alt','menu')) { $part = 'alt'; $modifiers = $modifiers -bor 1; $modifierKeys.alt = 0; continue }
        if ($part -in @('ralt','rightalt','rightmenu','vk_rmenu')) { $modifiers = $modifiers -bor 1; $modifierKeys.alt = 0xA5; continue }
        if ($part -in @('lalt','leftalt','leftmenu','vk_lmenu')) { $modifiers = $modifiers -bor 1; $modifierKeys.alt = 0xA4; continue }
        if ($part -eq 'shift') { $modifiers = $modifiers -bor 4; $modifierKeys.shift = 0; continue }
        if ($part -in @('rshift','rightshift','vk_rshift')) { $modifiers = $modifiers -bor 4; $modifierKeys.shift = 0xA1; continue }
        if ($part -in @('lshift','leftshift','vk_lshift')) { $modifiers = $modifiers -bor 4; $modifierKeys.shift = 0xA0; continue }
        if (-not $VkCodes.ContainsKey($part)) { return $null }
        if ($keyCode -ne $null) { return $null }
        $keyCode = $VkCodes[$part]
    }
    if ($keyCode -eq $null) { return $null }
    [pscustomobject]@{ Modifiers = $modifiers; Vk = [int]$keyCode; ModifierKeys = $modifierKeys }
}

function Read-Text($Path) {
    [IO.File]::ReadAllText($Path, [Text.Encoding]::UTF8)
}

function Write-Text($Path, $Text) {
    [IO.File]::WriteAllText($Path, $Text, [Text.Encoding]::UTF8)
}

function Find-IniFiles($Root) {
    if (Test-Path -LiteralPath $Root -PathType Leaf) { return @((Resolve-Path -LiteralPath $Root).Path) }
    Get-ChildItem -LiteralPath $Root -Recurse -File -Filter '*.ini' -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -notmatch '(?i)(\\|^)(disabled_|DISABLED_)|\.bak' } |
        ForEach-Object { $_.FullName }
}

function Get-CommandListHints($Lines) {
    $hints = @{}
    $section = $null
    $vars = @{}
    function Save-Section {
        if ($script:section -and $script:vars.Count) { $script:hints[$script:section] = $script:vars.Clone() }
    }
    foreach ($line in $Lines) {
        $trimmed = $line.Trim()
        if ($trimmed -match '^\[CommandList([^\]]+)\]') {
            if ($section -and $vars.Count) { $hints[$section] = $vars.Clone() }
            $section = $Matches[1].ToLowerInvariant()
            $vars = @{}
            continue
        }
        if ($trimmed -match '^\[') {
            if ($section -and $vars.Count) { $hints[$section] = $vars.Clone() }
            $section = $null
            $vars = @{}
            continue
        }
        if (-not $section) { continue }
        if ($trimmed -match '^\$(\w+)\s*=\s*\$\w+\s*\+\s*1') {
            $name = $Matches[1].ToLowerInvariant()
            if (-not $vars.ContainsKey($name)) { $vars[$name] = $null }
            continue
        }
        if ($trimmed -match '^if\s+\$(\w+)\s*>\s*(\d+)') {
            $name = $Matches[1].ToLowerInvariant()
            if ($vars.ContainsKey($name)) { $vars[$name] = 0..([int]$Matches[2]) | ForEach-Object { [string]$_ } }
        }
    }
    if ($section -and $vars.Count) { $hints[$section] = $vars.Clone() }
    $hints
}

function Load-Bindings($Root) {
    foreach ($file in Find-IniFiles $Root) {
        $text = Read-Text $file
        $lines = $text -split "\r?\n"
        $cmdHints = Get-CommandListHints $lines
        $inKey = $false
        $curKey = $null
        foreach ($line in $lines) {
            $trimmed = $line.Trim()
            if ($trimmed -match '^\[Key[^\]]*\]') { $inKey = $true; $curKey = $null; continue }
            if ($inKey -and $trimmed -match '^\[') { $inKey = $false; $curKey = $null; continue }
            if (-not $inKey) { continue }
            if ($trimmed -match '^key\s*=\s*(.+)') {
                $curKey = Parse-Key $Matches[1].Trim()
                continue
            }
            if ($curKey -and $trimmed -match '^\$(\w+)\s*=\s*([-\d,\s]+)$') {
                $values = $Matches[2].Split(',') | ForEach-Object { $_.Trim() } | Where-Object { $_ }
                $AllBindings.Add([pscustomobject]@{ Hotkey=$curKey; VarName=$Matches[1].ToLowerInvariant(); Values=@($values); File=$file })
                $curKey = $null
                continue
            }
            if ($curKey -and $trimmed -match '^run\s*=\s*CommandList(\w+)') {
                $vars = $cmdHints[$Matches[1].ToLowerInvariant()]
                if ($vars) {
                    foreach ($name in $vars.Keys) {
                        $values = $vars[$name]
                        if ($values -and $values.Count) {
                            $AllBindings.Add([pscustomobject]@{ Hotkey=$curKey; VarName=$name; Values=@($values); File=$file })
                        }
                    }
                    $curKey = $null
                }
            }
        }
    }
}

function Read-Persist($File, $VarName) {
    $text = Read-Text $File
    $persistName = [regex]::Escape('$' + $VarName)
    $m = [regex]::Match($text, "(?im)^\s*global\s+persist\s+$persistName\s*=\s*([^\r\n]+)")
    if ($m.Success) { return $m.Groups[1].Value.Trim() }
    ''
}

function Sync-D3dxUser($File, $VarName, $Value) {
    $parts = [IO.Path]::GetFullPath($File).Split([IO.Path]::DirectorySeparatorChar)
    $modsIndex = -1
    for ($i = 0; $i -lt $parts.Length; $i++) {
        if ($parts[$i].ToLowerInvariant() -eq 'mods') { $modsIndex = $i; break }
    }
    if ($modsIndex -lt 0) { return }
    $root = ($parts[0..($modsIndex - 1)] -join [IO.Path]::DirectorySeparatorChar)
    $userIni = Join-Path $root 'd3dx_user.ini'
    if (-not (Test-Path -LiteralPath $userIni)) { return }
    $rel = ($parts[($modsIndex + 1)..($parts.Length - 1)] -join [IO.Path]::DirectorySeparatorChar).ToLowerInvariant()
    $key = '$\mods\' + $rel + '\' + $VarName
    $lines = (Read-Text $userIni) -split "\r?\n"
    $found = $false
    for ($i = 0; $i -lt $lines.Length; $i++) {
        if ($lines[$i].TrimStart().ToLowerInvariant().StartsWith($key.ToLowerInvariant())) {
            $lines[$i] = "$key = $Value"
            $found = $true
            break
        }
    }
    if (-not $found) { $lines += "$key = $Value" }
    Write-Text $userIni ($lines -join "`r`n")
}

function Cycle-Value($Binding) {
    $text = Read-Text $Binding.File
    $var = [regex]::Escape('$' + $Binding.VarName)
    $regex = [regex]"(?im)^(global\s+persist\s+$var)\s*=\s*(-?\d+)\s*$"
    $match = $regex.Match($text)
    if (-not $match.Success) { return '' }
    $current = $match.Groups[2].Value
    $idx = [Array]::IndexOf($Binding.Values, $current)
    if ($idx -lt 0) { $idx = 0 } else { $idx = ($idx + 1) % $Binding.Values.Count }
    $next = [string]$Binding.Values[$idx]
    $newText = $regex.Replace($text, "`$1 = $next", 1)
    Write-Text $Binding.File $newText
    Sync-D3dxUser $Binding.File $Binding.VarName $next
    $next
}

function Should-Stop {
    if (-not $StopFile -or -not (Test-Path -LiteralPath $StopFile)) { return $false }
    if (-not $StopToken) { return $true }
    try { return ((Get-Content -LiteralPath $StopFile -Raw -ErrorAction Stop).Trim() -eq $StopToken) } catch { return $false }
}

function Is-KeyDown([int]$Vk) {
    ([KeyNative]::GetAsyncKeyState($Vk) -band 0x8000) -ne 0
}

function Get-KeyState([int]$Vk) {
    $state = [KeyNative]::GetAsyncKeyState($Vk)
    [pscustomobject]@{
        Down = (($state -band 0x8000) -ne 0)
        Pressed = (($state -band 0x0001) -ne 0)
    }
}

function Is-ModifierDown([int]$Mod) {
    if ($Mod -eq 1) { return (Is-KeyDown 0x12) -or (Is-KeyDown 0xA4) -or (Is-KeyDown 0xA5) }
    if ($Mod -eq 2) { return (Is-KeyDown 0x11) -or (Is-KeyDown 0xA2) -or (Is-KeyDown 0xA3) }
    if ($Mod -eq 4) { return (Is-KeyDown 0x10) -or (Is-KeyDown 0xA0) -or (Is-KeyDown 0xA1) }
    $false
}

function Get-ModifierMask {
    $mask = 0
    if (Is-ModifierDown 1) { $mask = $mask -bor 1 }
    if (Is-ModifierDown 2) { $mask = $mask -bor 2 }
    if (Is-ModifierDown 4) { $mask = $mask -bor 4 }
    $mask
}

function Is-ParsedModifierDown($Parsed, [string]$Name, [int]$GenericMask) {
    if (-not $Parsed.ModifierKeys.ContainsKey($Name)) { return $false }
    $specificVk = [int]$Parsed.ModifierKeys[$Name]
    if ($specificVk -gt 0) { return Is-KeyDown $specificVk }
    Is-ModifierDown $GenericMask
}

function Combo-Pressed($Parsed, $KeyState, [bool]$WasDown) {
    if (-not ($KeyState.Pressed -or ($KeyState.Down -and -not $WasDown))) { return $false }
    if (($Parsed.Modifiers -band 1) -ne 0 -and -not (Is-ParsedModifierDown $Parsed 'alt' 1)) { return $false }
    if (($Parsed.Modifiers -band 2) -ne 0 -and -not (Is-ParsedModifierDown $Parsed 'ctrl' 2)) { return $false }
    if (($Parsed.Modifiers -band 4) -ne 0 -and -not (Is-ParsedModifierDown $Parsed 'shift' 4)) { return $false }
    $true
}

try {
    Load-Bindings ([IO.Path]::GetFullPath($Target))
    $hotkeyMap = @{}
    $registrationMap = @{}
    $nextId = 1000
    $failed = 0
    $message = New-Object KeyMessage
    [void][KeyNative]::PeekMessage([ref]$message, [IntPtr]::Zero, 0, 0, 0)
    foreach ($binding in $AllBindings) {
        $parsed = Parse-Hotkey $binding.Hotkey
        if ($null -eq $parsed) {
            $failed += 1
            Emit-Event @{ type='registerError'; key=$binding.Hotkey; varName=$binding.VarName; file=$binding.File; message='unsupported key' }
            continue
        }
        $comboKey = "$($parsed.Modifiers):$($parsed.Vk)"
        if ($registrationMap.ContainsKey($comboKey)) {
            $registrationMap[$comboKey].Bindings.Add($binding)
            continue
        }
        $hasSpecificModifier = @($parsed.ModifierKeys.Values | Where-Object { [int]$_ -gt 0 }).Count -gt 0
        if ($hasSpecificModifier) {
            $PolledHotkeys.Add([pscustomobject]@{
                Id = "poll-$($PolledHotkeys.Count)"
                Parsed = $parsed
                Binding = $binding
            })
            continue
        }
        $id = $nextId
        $nextId += 1
        if (-not [KeyNative]::RegisterHotKey([IntPtr]::Zero, $id, [uint32]$parsed.Modifiers, [uint32]$parsed.Vk)) {
            $failed += 1
            Emit-Event @{ type='registerError'; key=$binding.Hotkey; varName=$binding.VarName; file=$binding.File; message="hotkey registration failed: $([Runtime.InteropServices.Marshal]::GetLastWin32Error())" }
            continue
        }
        $item = [pscustomobject]@{
            Id = $id
            Bindings = New-Object System.Collections.Generic.List[object]
        }
        $item.Bindings.Add($binding)
        $RegisteredHotkeys.Add($item)
        $hotkeyMap[[string]$id] = $item
        $registrationMap[$comboKey] = $item
    }
    if (-not $AllBindings.Count) {
        Emit-Event @{ type='error'; message='no key bindings' }
        exit 1
    }
    Emit-Event @{ type='ready'; registered=($RegisteredHotkeys.Count + $PolledHotkeys.Count); failed=$failed; pid=$PID; stopToken=$StopToken }
    while (-not (Should-Stop)) {
        while ([KeyNative]::PeekMessage([ref]$message, [IntPtr]::Zero, 0, 0, 1)) {
            if ($message.Message -ne 0x0312) { continue }
            $item = $hotkeyMap[[string]$message.WParam.ToUInt32()]
            if (-not $item) { continue }
            foreach ($binding in $item.Bindings) {
                $value = Cycle-Value $binding
                if ($value) {
                    Emit-Event @{ type='change'; varName=$binding.VarName; file=$binding.File; value=$value; time=(Get-Date -Format 'HH:mm:ss') }
                } else {
                    Emit-Event @{ type='error'; key=$binding.Hotkey; varName=$binding.VarName; file=$binding.File; message='hotkey detected but persist value was not updated' }
                }
            }
        }
        $stateCache = @{}
        foreach ($item in $PolledHotkeys) {
            $id = [string]$item.Id
            $vkKey = [string]$item.Parsed.Vk
            if (-not $stateCache.ContainsKey($vkKey)) { $stateCache[$vkKey] = Get-KeyState $item.Parsed.Vk }
            $keyState = $stateCache[$vkKey]
            $pressed = Combo-Pressed $item.Parsed $keyState ([bool]$Active[$id])
            if ($pressed) {
                $value = Cycle-Value $item.Binding
                if ($value) {
                    Emit-Event @{ type='change'; varName=$item.Binding.VarName; file=$item.Binding.File; value=$value; time=(Get-Date -Format 'HH:mm:ss') }
                } else {
                    Emit-Event @{ type='error'; key=$item.Binding.Hotkey; varName=$item.Binding.VarName; file=$item.Binding.File; message='hotkey detected but persist value was not updated' }
                }
            }
            $Active[$id] = $keyState.Down
        }
        Start-Sleep -Milliseconds $PollIntervalMs
    }
} catch {
    Emit-Event @{ type='error'; message=$_.Exception.Message }
    exit 1
} finally {
    foreach ($item in $RegisteredHotkeys) {
        [void][KeyNative]::UnregisterHotKey([IntPtr]::Zero, [int]$item.Id)
    }
}
