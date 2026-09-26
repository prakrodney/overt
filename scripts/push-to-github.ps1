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

# First run: turn this folder into a git repository using the history that
# came with the project (scripts\overt.bundle), without touching your files.
if (-not (Test-Path ".git")) {
  git init -q -b main
  git fetch -q "scripts/overt.bundle" main
  git update-ref refs/heads/main FETCH_HEAD
  git reset -q
  Add-Content ".git/info/exclude" "scripts/overt.bundle"
  git remote add origin https://github.com/prakrodney/overt.git
}
if (-not (git config user.name)) { git config user.name "rodney" }
if (-not (git config user.email)) { git config user.email "334100603+prakrodney@users.noreply.github.com" }

# Anything you changed since then gets saved as a new commit before uploading.
git add -A
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) { git commit -q -m "Update from my PC" }

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
