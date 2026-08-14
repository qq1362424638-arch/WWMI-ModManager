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

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class KeyNative {
    [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int vKey);
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
for ($i = 0; $i -le 9; $i++) {
    $VkCodes[[string]$i] = 0x30 + $i
    $VkCodes["numpad$i"] = 0x60 + $i
}
for ($i = 0; $i -lt 26; $i++) { $VkCodes[[char](97 + $i)] = 0x41 + $i }
for ($i = 1; $i -le 12; $i++) { $VkCodes["f$i"] = 0x6F + $i }

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
    foreach ($token in ([string]$Raw).Trim().Split(' ', [StringSplitOptions]::RemoveEmptyEntries)) {
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
    if ($ordered.Count) { return (($ordered + @($key)) -join '+') }
    return $key
}

function Parse-Hotkey($Hotkey) {
    $modifiers = 0
    $keyCode = $null
    foreach ($part in ([string]$Hotkey).Replace('+', ' ').Split(' ', [StringSplitOptions]::RemoveEmptyEntries)) {
        $part = $part.Trim().ToLowerInvariant()
        if ($part -in @('no_modifiers','no_alt','no_ctrl','no_shift')) { continue }
        if ($part -eq 'control') { $part = 'ctrl' }
        if ($part -eq 'ctrl') { $modifiers = $modifiers -bor 2; continue }
        if ($part -eq 'alt') { $modifiers = $modifiers -bor 1; continue }
        if ($part -eq 'shift') { $modifiers = $modifiers -bor 4; continue }
        if (-not $VkCodes.ContainsKey($part)) { return $null }
        if ($keyCode -ne $null) { return $null }
        $keyCode = $VkCodes[$part]
    }
    if ($keyCode -eq $null) { return $null }
    [pscustomobject]@{ Modifiers = $modifiers; Vk = [int]$keyCode }
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

function Combo-Pressed($Parsed, $KeyState, [bool]$WasDown) {
    if (-not ($KeyState.Pressed -or ($KeyState.Down -and -not $WasDown))) { return $false }
    foreach ($mod in @(1,2,4)) {
        if (($Parsed.Modifiers -band $mod) -ne 0 -and -not (Is-ModifierDown $mod)) { return $false }
    }
    $true
}

try {
    Load-Bindings ([IO.Path]::GetFullPath($Target))
    $watched = New-Object System.Collections.Generic.List[object]
    $failed = 0
    foreach ($binding in $AllBindings) {
        $parsed = Parse-Hotkey $binding.Hotkey
        if ($null -eq $parsed) {
            $failed += 1
            Emit-Event @{ type='registerError'; key=$binding.Hotkey; varName=$binding.VarName; file=$binding.File; message='unsupported key' }
            continue
        }
        $watched.Add([pscustomobject]@{ Parsed=$parsed; Binding=$binding })
    }
    if (-not $AllBindings.Count) {
        Emit-Event @{ type='error'; message='no key bindings' }
        exit 1
    }
    Emit-Event @{ type='ready'; registered=$watched.Count; failed=$failed; stopToken=$StopToken }
    while (-not (Should-Stop)) {
        $stateCache = @{}
        foreach ($item in $watched) {
            $id = "$($item.Parsed.Modifiers):$($item.Parsed.Vk):$($item.Binding.VarName):$($item.Binding.File)"
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
}
