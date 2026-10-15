$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$dataRoot = Join-Path $projectRoot 'data'
$envPath = Join-Path $projectRoot '.env'
if (Test-Path -LiteralPath $envPath) {
  foreach ($line in Get-Content -LiteralPath $envPath) { if ($line -match '^VOCAB_DATA_DIR=(.+)$') { $dataRoot = $Matches[1].Trim('"', "'") } }
}
if (![IO.Path]::IsPathRooted($dataRoot)) { $dataRoot = Join-Path $projectRoot $dataRoot }
$dataRoot = [IO.Path]::GetFullPath($dataRoot)
$recordPath = Join-Path $dataRoot 'runtime.json'
if (!(Test-Path -LiteralPath $recordPath)) { Write-Output '没有本启动器的运行记录。'; exit 0 }
$record = Get-Content -LiteralPath $recordPath -Raw | ConvertFrom-Json
$serviceProcess = Get-Process -Id $record.pid -ErrorAction SilentlyContinue
if ($serviceProcess) {
  $recordStartedTicks = if ($record.started -is [DateTime]) { $record.started.ToUniversalTime().Ticks } else { ([DateTimeOffset]::Parse([string]$record.started)).UtcDateTime.Ticks }
  $processStartedTicks = $serviceProcess.StartTime.ToUniversalTime().Ticks
  if ($serviceProcess.ProcessName -ne 'node' -or $processStartedTicks -ne $recordStartedTicks -or $record.project -ne $projectRoot) { throw '运行记录与当前进程不匹配，未停止其他程序。' }
  Stop-Process -Id $serviceProcess.Id
}
Write-Output '词库服务已停止；电脑和平板暂时无法读取或保存。已保存数据保留。'
