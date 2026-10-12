param([switch]$WithRules)

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$runtime = Join-Path $PSScriptRoot '.tools\node.exe'
$cli = Join-Path $PSScriptRoot '.tools\firebase-cli.cjs'
if (-not (Test-Path -LiteralPath $runtime)) { throw 'Missing .tools/node.exe' }
if (-not (Test-Path -LiteralPath $cli)) { throw 'Missing .tools/firebase-cli.cjs' }

& $runtime --preserve-symlinks --preserve-symlinks-main build.cjs
if ($LASTEXITCODE -ne 0) { throw 'Build failed. Nothing was published.' }

$targets = 'hosting'
if ($WithRules) { $targets = 'database,hosting' }
& $runtime --preserve-symlinks --preserve-symlinks-main $cli deploy --only $targets --project gerty-b6913 --non-interactive
if ($LASTEXITCODE -ne 0) { throw 'Deployment failed. Check the Firebase output above.' }

Write-Output 'Published: https://gerty-b6913.web.app'
