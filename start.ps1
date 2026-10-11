$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$runtime = Join-Path $PSScriptRoot '.tools\node.exe'
if (-not (Test-Path -LiteralPath $runtime)) {
    $command = Get-Command node -ErrorAction SilentlyContinue
    if (-not $command) { throw 'Node.js is required. Install Node.js, then run this script again.' }
    $runtime = $command.Source
}
$toolDirectory = Join-Path $PSScriptRoot '.tools'
New-Item -ItemType Directory -Path $toolDirectory -Force | Out-Null
$passwordFile = Join-Path $toolDirectory 'admin-password.txt'
if (-not $env:ADMIN_PASSWORD) {
    if (Test-Path -LiteralPath $passwordFile) {
        $env:ADMIN_PASSWORD = [IO.File]::ReadAllText($passwordFile).Trim()
    } else {
        $randomBytes = New-Object byte[] 24
        $randomGenerator = [Security.Cryptography.RandomNumberGenerator]::Create()
        $randomGenerator.GetBytes($randomBytes)
        $randomGenerator.Dispose()
        $env:ADMIN_PASSWORD = [Convert]::ToBase64String($randomBytes)
        [IO.File]::WriteAllText($passwordFile, $env:ADMIN_PASSWORD)
    }
}
$env:HOST = '127.0.0.1'
$env:PORT = '3000'
& $runtime -e "fetch('http://127.0.0.1:3000/api/admin/orders',{signal:AbortSignal.timeout(1500)}).then(r=>process.exit(r.status===401?0:2)).catch(()=>process.exit(1))"
if ($LASTEXITCODE -eq 0) {
    Write-Output 'Server already running: http://localhost:3000 | Admin: http://localhost:3000/admin.html'
    Write-Output ('Admin password file: ' + $passwordFile)
    exit 0
}
if ($LASTEXITCODE -eq 2) { throw 'Port 3000 is used by another service.' }
$arguments = @('--preserve-symlinks', '--preserve-symlinks-main', 'server.cjs')
$process = Start-Process -FilePath $runtime -ArgumentList $arguments -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $toolDirectory 'server.log') -RedirectStandardError (Join-Path $toolDirectory 'server-error.log')
$healthy = $false
for ($attempt = 0; $attempt -lt 15; $attempt++) {
    if ($process.HasExited) { throw ('Server stopped. See ' + (Join-Path $toolDirectory 'server-error.log')) }
        & $runtime -e "fetch('http://127.0.0.1:3000/',{signal:AbortSignal.timeout(1500)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
    if ($LASTEXITCODE -eq 0) { $healthy = $true; break }
    Start-Sleep -Milliseconds 200
}
if (-not $healthy) { throw 'Server did not respond. Check .tools/server-error.log.' }
[IO.File]::WriteAllText((Join-Path $toolDirectory 'server.pid'), [string]$process.Id)
Write-Output 'Shop: http://localhost:3000'
Write-Output 'Admin: http://localhost:3000/admin.html'
Write-Output ('Admin password file: ' + $passwordFile)
