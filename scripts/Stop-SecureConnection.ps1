$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$dataRoot = Join-Path $projectRoot 'data'
$envPath = Join-Path $projectRoot '.env'
if (Test-Path -LiteralPath $envPath) { foreach ($line in Get-Content -LiteralPath $envPath) { if ($line -match '^VOCAB_DATA_DIR=(.+)$') { $dataRoot=$Matches[1].Trim('"', "'") } } }
if (![IO.Path]::IsPathRooted($dataRoot)) { $dataRoot = Join-Path $projectRoot $dataRoot }
$dataRoot = [IO.Path]::GetFullPath($dataRoot)
$recordPath = Join-Path $dataRoot 'tunnel-runtime.json'
if (Test-Path -LiteralPath $recordPath) {
  $record = Get-Content -LiteralPath $recordPath -Raw | ConvertFrom-Json
  $tunnelProcess = Get-Process -Id $record.pid -ErrorAction SilentlyContinue
  if ($tunnelProcess) {
    $recordStartedTicks = if ($record.started -is [DateTime]) { $record.started.ToUniversalTime().Ticks } else { ([DateTimeOffset]::Parse([string]$record.started)).UtcDateTime.Ticks }
    $processStartedTicks = $tunnelProcess.StartTime.ToUniversalTime().Ticks
    if ($tunnelProcess.ProcessName -ne 'cloudflared' -or $processStartedTicks -ne $recordStartedTicks -or $record.project -ne $projectRoot) { throw '运行记录不匹配，未停止其他连接。' }
    Stop-Process -Id $tunnelProcess.Id
  }
}
Write-Output '安全转发已停止。本机数据保留，平板暂时无法访问。'
