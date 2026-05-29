$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

$packageJson = Get-Content -LiteralPath "package.json" -Raw | ConvertFrom-Json
$version = $packageJson.version
$outputDir = Join-Path $root "dist-release"
$msiPath = Join-Path $outputDir "PostPilot-$version-x64.msi"

Write-Host "Building application"
npm run build

Write-Host "Packaging Windows MSI"
npx electron-builder --win msi --x64 --publish never

if (!(Test-Path -LiteralPath $msiPath)) {
  throw "Release MSI was not generated"
}

$msi = Get-Item -LiteralPath $msiPath
if ($msi.Length -le 0) {
  throw "Release MSI is empty"
}

Write-Host "Release artifact ready: $msiPath"
