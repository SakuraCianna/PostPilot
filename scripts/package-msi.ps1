$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

$packageJson = Get-Content -LiteralPath "package.json" -Raw | ConvertFrom-Json
$version = $packageJson.version
$outputDir = Join-Path $root "dist-msi"
$msiPath = Join-Path $outputDir "PostPilot-$version-x64.msi"

Write-Host "开始构建应用"
npm run build

Write-Host "开始打包 Windows MSI"
npx electron-builder --win msi --x64 --publish never

if (!(Test-Path -LiteralPath $msiPath)) {
  throw "MSI 安装包未生成"
}

$msi = Get-Item -LiteralPath $msiPath
if ($msi.Length -le 0) {
  throw "MSI 安装包为空"
}

Write-Host "MSI 安装包已生成: $msiPath"
