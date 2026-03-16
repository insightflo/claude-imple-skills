# Claude Impl Tools Installer for Windows
# This script creates Junctions from the repo to your .claude/skills directory.

$sourceDir = Join-Path $PSScriptRoot ".." "skills"
$targetDir = Join-Path $env:USERPROFILE ".claude" "skills"

if (-not (Test-Path $targetDir)) {
    Write-Host "Creating .claude/skills directory..." -ForegroundColor Cyan
    New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
}

$skills = Get-ChildItem -Path $sourceDir -Directory

foreach ($skill in $skills) {
    $destPath = Join-Path $targetDir $skill.Name
    if (Test-Path $destPath) {
        Write-Host "Removing existing skill: $($skill.Name)" -ForegroundColor Yellow
        Remove-Item -Path $destPath -Recurse -Force
    }
    Write-Host "Installing skill: $($skill.Name)" -ForegroundColor Green
    cmd /c mklink /j "$destPath" "$($skill.FullName)"| Out-Null
}

Write-Host "`nClaude Impl Tools installed successfully!" -ForegroundColor Green
Write-Host "Run 'claude config skills' to verify." -ForegroundColor Cyan
