$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

$packageJson = Get-Content -LiteralPath "package.json" -Raw | ConvertFrom-Json
$version = $packageJson.version
$outputDir = Join-Path $root "dist-release"
$unpackedDir = Join-Path $outputDir "win-unpacked"
$zipPath = Join-Path $outputDir "PostPilot-$version-x64.zip"

Write-Host "Building application"
npm run build

Write-Host "Packaging unpacked Windows app"
npx electron-builder --dir --publish never

if (!(Test-Path -LiteralPath $unpackedDir)) {
  throw "Unpacked app directory was not generated"
}

if (Test-Path -LiteralPath $zipPath) {
  Remove-Item -LiteralPath $zipPath -Force
}

Write-Host "Creating release zip"
Compress-Archive -Path (Join-Path $unpackedDir "*") -DestinationPath $zipPath -CompressionLevel Optimal

if (!(Test-Path -LiteralPath $zipPath)) {
  throw "Release zip was not generated"
}

$zip = Get-Item -LiteralPath $zipPath
if ($zip.Length -le 0) {
  throw "Release zip is empty"
}

Write-Host "Release artifact ready: $zipPath"
