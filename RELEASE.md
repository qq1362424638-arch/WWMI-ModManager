# Release

## Build

```powershell
npm ci
npm run release:win
```

Upload the generated installer from `dist/` to GitHub New release:

```text
WWMI-ModManager-Setup-<version>-x64.exe
WWMI-ModManager-Setup-<version>-x64.exe.blockmap
```

## Windows Warnings

Windows SmartScreen warnings cannot be fully removed by packaging settings alone.
For the lowest warning rate, sign the release with a trusted code-signing certificate:

```powershell
$env:CSC_LINK = "C:\path\to\certificate.pfx"
$env:CSC_KEY_PASSWORD = "certificate-password"
npm run release:win
```

Unsigned builds may show "Unknown publisher" or SmartScreen warnings until the file gains reputation.

GitHub Actions can build it on `windows-latest`:

1. Create and publish a GitHub Release.
2. The `Build Windows Release` workflow builds the installer and uploads it to that Release.
3. Or run the workflow manually and download the artifact.

## New User Notes

- The installer and app executable use ASCII names to avoid Chinese-path launcher issues.
- The Electron runtime is bundled, so users do not need Node.js.
- The app is built unpacked instead of `asar` so bundled scripts can be executed reliably.
- Some tools still call Windows PowerShell.
- Python tools currently require a user-installed Python 3; `watcher.py` also requires the `keyboard` Python package.
