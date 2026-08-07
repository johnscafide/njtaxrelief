param(
  [string]$Manifest = "property/CHANGED-FILES-v0.25.0.txt",
  [string]$Message = "Watchdog v0.25.0: institutional 100-marker data release"
)
$ErrorActionPreference = "Stop"
$root = git rev-parse --show-toplevel 2>$null
if (-not $root) { throw "Run this from anywhere inside your cloned GitHub repository." }
Set-Location $root
if (-not (Test-Path $Manifest)) { throw "Cannot find $Manifest. Extract the release ZIP into the repository first." }
$files = Get-Content $Manifest | Where-Object { $_ -match '^property/' }
if (-not $files) { throw "No repository paths found in $Manifest." }
Write-Host "Files this release will stage:" -ForegroundColor Cyan
git status --short -- $files
$answer = Read-Host "Stage these release files, commit, and push? (y/N)"
if ($answer -notmatch '^[Yy]$') { Write-Host "Cancelled. Nothing was pushed."; exit 0 }
git add -- $files
if (-not (git diff --cached --quiet)) {
  git commit -m $Message
} else {
  Write-Host "No staged differences to commit."
}
$branch = git branch --show-current
if (-not $branch) { throw "Could not determine the current Git branch." }
git push origin $branch
Write-Host "Done. Pushed $branch to origin." -ForegroundColor Green
