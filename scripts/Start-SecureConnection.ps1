$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$nodePath = (Get-Command node -ErrorAction Stop).Source
$tunnelPath = (Get-Command cloudflared -ErrorAction Stop).Source
& (Join-Path $PSScriptRoot 'Start-VocabularyContext.ps1')
$settings = @{}
$envPath = Join-Path $projectRoot '.env'
foreach ($line in Get-Content -LiteralPath $envPath) { if ($line -match '^([A-Z_]+)=(.*)$') { $settings[$Matches[1]] = $Matches[2].Trim('"', "'") } }
$dataRoot = if ($settings['VOCAB_DATA_DIR']) { $settings['VOCAB_DATA_DIR'] } else { Join-Path $projectRoot 'data' }
if (![IO.Path]::IsPathRooted($dataRoot)) { $dataRoot = Join-Path $projectRoot $dataRoot }
$dataRoot = [IO.Path]::GetFullPath($dataRoot)
$listenPort = if ($settings['PORT']) { $settings['PORT'] } else { '8787' }
$recordPath = Join-Path $dataRoot 'tunnel-runtime.json'
if (Test-Path -LiteralPath $recordPath) {
  $existing = Get-Content -LiteralPath $recordPath -Raw | ConvertFrom-Json
  $existingProcess = Get-Process -Id $existing.pid -ErrorAction SilentlyContinue
  $existingStartedTicks = if ($existing.started -is [DateTime]) { $existing.started.ToUniversalTime().Ticks } else { ([DateTimeOffset]::Parse([string]$existing.started)).UtcDateTime.Ticks }
  if ($existingProcess -and $existingProcess.ProcessName -eq 'cloudflared' -and $existingProcess.StartTime.ToUniversalTime().Ticks -eq $existingStartedTicks) {
    Write-Output "已有安全连接进程：$($existing.origin)/mcp。仍需在 ChatGPT 验证。"; exit 0
  }
}
$health = Invoke-RestMethod "http://127.0.0.1:$listenPort/health" -TimeoutSec 3
if (!$health.login_configured) { throw '词库登录尚未配置，拒绝开启公网转发。' }
$logPath = Join-Path $dataRoot 'tunnel.log'
$errPath = Join-Path $dataRoot 'tunnel-error.log'
$tunnelConfig = Join-Path $dataRoot 'vocabulary-tunnel.yml'
if (!(Test-Path -LiteralPath $tunnelConfig)) { [IO.File]::WriteAllText($tunnelConfig,'{}',[Text.UTF8Encoding]::new($false)) }
$tunnelProcess = Start-Process -FilePath $tunnelPath -ArgumentList @('tunnel','--config',"`"$tunnelConfig`"",'--no-autoupdate','--protocol','http2','--edge-ip-version','4','--url',"http://127.0.0.1:$listenPort") -WindowStyle Hidden -PassThru -RedirectStandardOutput $logPath -RedirectStandardError $errPath
$origin = $null
for ($attempt=0; $attempt -lt 30; $attempt++) {
  Start-Sleep -Seconds 1
  $logText = ''
  foreach ($p in @($logPath,$errPath)) { if (Test-Path -LiteralPath $p) { $logText += Get-Content -LiteralPath $p -Raw -ErrorAction SilentlyContinue } }
  $match = [regex]::Match($logText,'https://[a-z0-9-]+\.trycloudflare\.com')
  if ($match.Success) { $origin=$match.Value; break }
  if ($tunnelProcess.HasExited) { break }
}
if (!$origin) {
  if (!$tunnelProcess.HasExited) { Stop-Process -Id $tunnelProcess.Id }
  throw "没有取得安全连接地址。词库仍在本机安全运行；请查看 $errPath。"
}
@{ pid=$tunnelProcess.Id; started=$tunnelProcess.StartTime.ToUniversalTime().ToString('o'); origin=$origin; project=$projectRoot } | ConvertTo-Json | Set-Content -LiteralPath $recordPath -Encoding UTF8
$envText = [IO.File]::ReadAllText($envPath)
$envText = [regex]::Replace($envText,'(?m)^VOCAB_PUBLIC_URL=.*$',"VOCAB_PUBLIC_URL=$origin")
[IO.File]::WriteAllText($envPath,$envText,[Text.UTF8Encoding]::new($false))
& (Join-Path $PSScriptRoot 'Stop-VocabularyContext.ps1')
& (Join-Path $PSScriptRoot 'Start-VocabularyContext.ps1')
& $nodePath (Join-Path $PSScriptRoot 'configure-endpoint.mjs') $origin
if ($LASTEXITCODE -ne 0) { throw '插件地址更新失败。' }
Write-Output "安全连接已创建：$origin/mcp"
Write-Output '这是临时测试地址，无可用性保证；停止后失效。电脑须持续开机联网。ChatGPT 安装与平板连接仍需各自验证。'
