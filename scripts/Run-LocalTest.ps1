param([Parameter(Mandatory = $true)][string]$RuntimeDirectory)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$resolvedRuntime = [IO.Path]::GetFullPath($RuntimeDirectory)
if (($resolvedRuntime -split '[\\/]') -notcontains '.runtime') { throw '测试目录必须位于 .runtime 内。' }
New-Item -ItemType Directory -Path $resolvedRuntime -Force | Out-Null
$env:VOCAB_LOCAL_RUNTIME_DIR = $resolvedRuntime
Set-Location -LiteralPath $projectRoot
& (Get-Command node -ErrorAction Stop).Source (Join-Path $PSScriptRoot 'dev-local.mjs') *>> (Join-Path $resolvedRuntime 'launcher.log')
exit $LASTEXITCODE
