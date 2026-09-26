# Overt - start the dev server so Expo Go on your iPhone can open the app.
# Run it by double-clicking "Start Overt.bat" in the project folder.
param([switch]$Tunnel)

$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)

function Refresh-Path {
  $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
              [Environment]::GetEnvironmentVariable("Path", "User")
}

Write-Host ""
Write-Host "  Overt dev server" -ForegroundColor Cyan
Write-Host "  ----------------"
Write-Host ""

# 1. Node.js
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "Node.js isn't installed yet. Installing it now (about 1-2 minutes)..." -ForegroundColor Yellow
  Write-Host "If Windows asks 'Do you want to allow this app to make changes?', click Yes." -ForegroundColor Yellow
  winget install --id OpenJS.NodeJS.LTS -e --accept-package-agreements --accept-source-agreements
  Refresh-Path
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "Node.js finished installing. Close this window and double-click 'Start Overt.bat' again." -ForegroundColor Yellow
    Read-Host "Press Enter to close"
    exit 1
  }
}
Write-Host ("Node.js " + (node -v) + " found.") -ForegroundColor Green

# 2. Packages (first run, or after an update)
$stamp = "node_modules\.overt-installed"
if (-not (Test-Path $stamp) -or ((Get-Item "package-lock.json").LastWriteTime -gt (Get-Item $stamp).LastWriteTime)) {
  Write-Host "Installing app packages (first run takes a few minutes)..." -ForegroundColor Yellow
  npm install --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { Read-Host "npm install failed. Press Enter to close"; exit 1 }
  New-Item -ItemType File -Force $stamp | Out-Null
}

# 3. Expo
Write-Host ""
Write-Host "Starting Expo. When the QR code appears, scan it with your iPhone's Camera app." -ForegroundColor Cyan
Write-Host "If Windows Firewall asks about Node.js, tick 'Private networks' and click Allow." -ForegroundColor Cyan
Write-Host ""
if ($Tunnel) {
  npx expo start --go --tunnel
} else {
  npx expo start --go --lan
}
Read-Host "Expo stopped. Press Enter to close"
