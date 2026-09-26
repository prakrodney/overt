# Overt - upload this project to github.com/prakrodney/overt
# Run it by double-clicking "Upload to GitHub.bat" in the project folder.
$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)

function Refresh-Path {
  $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
              [Environment]::GetEnvironmentVariable("Path", "User")
}

Write-Host ""
Write-Host "  Upload Overt to GitHub" -ForegroundColor Cyan
Write-Host "  ----------------------"
Write-Host ""

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Write-Host "Git isn't installed yet. Installing it now (about 1-2 minutes)..." -ForegroundColor Yellow
  Write-Host "If Windows asks 'Do you want to allow this app to make changes?', click Yes." -ForegroundColor Yellow
  winget install --id Git.Git -e --accept-package-agreements --accept-source-agreements
  Refresh-Path
  if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host "Git finished installing. Close this window and double-click 'Upload to GitHub.bat' again." -ForegroundColor Yellow
    Read-Host "Press Enter to close"
    exit 1
  }
}

git config --global --add safe.directory ((Get-Location).Path -replace '\\', '/') 2>$null

Write-Host "Uploading to https://github.com/prakrodney/overt ..." -ForegroundColor Cyan
Write-Host "If a GitHub sign-in window opens, choose 'Sign in with your browser' and approve it." -ForegroundColor Cyan
git push -u origin main
if ($LASTEXITCODE -eq 0) {
  Write-Host ""
  Write-Host "Done! Your code is at https://github.com/prakrodney/overt" -ForegroundColor Green
} else {
  Write-Host ""
  Write-Host "The upload didn't go through. Take a screenshot of this window and send it to Claude." -ForegroundColor Red
}
Read-Host "Press Enter to close"
