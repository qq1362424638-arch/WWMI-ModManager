param([string]$TargetDir)
if (-not $TargetDir) { $TargetDir = Read-Host "请输入要平整的目录路径" }
if (-not (Test-Path -LiteralPath $TargetDir -PathType Container)) {
    Write-Host "[x] 目录不存在: $TargetDir" -ForegroundColor Red
    exit 1
}
$uuidRegex = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}_(.+)$'
Get-ChildItem -LiteralPath $TargetDir -Directory | ForEach-Object {
    $parent = $_.FullName
    $match = [regex]::Match($_.Name, $uuidRegex)
    if ($match.Success) {
        $newName = $match.Groups[1].Value
        $newPath = Join-Path -Path $TargetDir -ChildPath $newName
        if (-not (Test-Path -LiteralPath $newPath -PathType Container)) {
            Rename-Item -LiteralPath $_.FullName -NewName $newName -Force
            $parent = $newPath
            Write-Host "[OK] UUID removed: $($_.Name) -> $newName"
        } else {
            Write-Host "[..] Skipped(target exists): $($_.Name)"
        }
    }
    $current = $parent
    $depth = 0
    while ($true) {
        $children = Get-ChildItem -LiteralPath $current -Directory
        $files = Get-ChildItem -LiteralPath $current -File
        $realFiles = $files | Where-Object { $_.Name -notin @("preview.png") -and $_.Extension -ne ".url" }
        if ($children.Count -eq 1 -and $realFiles.Count -eq 0) {
            $childName = $children[0].Name
            if ($childName -eq (Split-Path -Leaf $current)) {
                $current = $children[0].FullName
                $depth++
                continue
            }
        }
        break
    }
    if ($depth -gt 0 -and $current -ne $parent) {
        Get-ChildItem -LiteralPath $current | Move-Item -Destination $parent -Force
        $temp = $current
        for ($i = 0; $i -lt $depth; $i++) {
            $toRemove = Split-Path -Parent $temp
            Remove-Item -LiteralPath $temp -Recurse -Force
            $temp = $toRemove
        }
        Write-Host "[OK] Flattened: $(Split-Path -Leaf $parent) (removed $depth nesting)"
    }
}
