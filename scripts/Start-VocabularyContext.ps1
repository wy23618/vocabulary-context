$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$nodePath = (Get-Command node -ErrorAction Stop).Source
& $nodePath (Join-Path $PSScriptRoot 'setup.mjs')
if ($LASTEXITCODE -ne 0) { throw '配置创建失败。' }
$dataRoot = Join-Path $projectRoot 'data'
$envPath = Join-Path $projectRoot '.env'
$settings = @{}
foreach ($line in Get-Content -LiteralPath $envPath) {
  if ($line -match '^([A-Z_]+)=(.*)$') { $settings[$Matches[1]] = $Matches[2].Trim('"', "'") }
}
if ($settings['VOCAB_DATA_DIR']) { $dataRoot = $settings['VOCAB_DATA_DIR'] }
if (![IO.Path]::IsPathRooted($dataRoot)) { $dataRoot = Join-Path $projectRoot $dataRoot }
$dataRoot = [IO.Path]::GetFullPath($dataRoot)
$listenPort = if ($settings['PORT']) { $settings['PORT'] } else { '8787' }
$localHealth = "http://127.0.0.1:$listenPort/health"
try {
  $health = Invoke-RestMethod -Uri $localHealth -TimeoutSec 2
  if ($health.service -eq 'vocabulary-context') { Write-Output "服务已运行。数据位置：$dataRoot"; exit 0 }
} catch {}
New-Item -ItemType Directory -Path $dataRoot -Force | Out-Null
$startRecordPath = Join-Path $dataRoot 'runtime.json'
$nodeArgs = @("--env-file-if-exists=`"$envPath`"", "`"$(Join-Path $projectRoot 'server/index.mjs')`"")
$serviceProcess = Start-Process -FilePath $nodePath -ArgumentList $nodeArgs -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $dataRoot 'service.log') -RedirectStandardError (Join-Path $dataRoot 'service-error.log')
@{ pid=$serviceProcess.Id; started=$serviceProcess.StartTime.ToUniversalTime().ToString('o'); project=$projectRoot; data=$dataRoot; health=$localHealth } | ConvertTo-Json | Set-Content -LiteralPath $startRecordPath -Encoding UTF8
Start-Sleep -Seconds 2
try {
  $health = Invoke-RestMethod -Uri $localHealth -TimeoutSec 3
  if ($health.service -ne 'vocabulary-context') { throw '服务响应不匹配。' }
  Write-Output "服务正在运行。数据位置：$dataRoot"
  Write-Output '安全连接：需按 docs/LOCAL-CONNECTION.md 配置并在 ChatGPT 验证。平板不能访问电脑 localhost。'
} catch { throw "服务尚未就绪，请查看 $dataRoot/service-error.log。" }
