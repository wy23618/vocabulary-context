$projectRoot = Split-Path -Parent $PSScriptRoot
$dataRoot = Join-Path $projectRoot 'data'
$listenPort = '8787'
$origin = 'http://127.0.0.1:8787'
$envPath = Join-Path $projectRoot '.env'
if (Test-Path -LiteralPath $envPath) {
  foreach ($line in Get-Content -LiteralPath $envPath) {
    if ($line -match '^VOCAB_DATA_DIR=(.+)$') { $dataRoot = $Matches[1].Trim('"', "'") }
    if ($line -match '^PORT=(.+)$') { $listenPort = $Matches[1] }
    if ($line -match '^VOCAB_PUBLIC_URL=(.+)$') { $origin = $Matches[1] }
  }
}
if (![IO.Path]::IsPathRooted($dataRoot)) { $dataRoot = Join-Path $projectRoot $dataRoot }
$dataRoot = [IO.Path]::GetFullPath($dataRoot)
try { $health = Invoke-RestMethod "http://127.0.0.1:$listenPort/health" -TimeoutSec 2; Write-Output "服务：$($health.service) 正在运行" } catch { Write-Output '服务：无法访问或已停止' }
Write-Output "数据：$dataRoot"
Write-Output "配置服务地址：$origin"
if ($origin -like 'https://*') {
  try {
    $remoteHealth = Invoke-RestMethod "$origin/health" -TimeoutSec 8
    if ($remoteHealth.service -eq 'vocabulary-context') { Write-Output 'HTTPS 服务：当前可达；连接授权须在 ChatGPT 完成。' } else { Write-Output 'HTTPS 服务：响应不匹配，尚不可用。' }
  } catch { Write-Output 'HTTPS 服务：当前无法访问；请保持电脑联网并重启安全连接。' }
} else { Write-Output '安全连接：尚未配置；平板不能访问电脑 localhost。' }
Write-Output '平板 App 可用性：仍需在目标 ChatGPT 中完成真实调用检验；HTTPS 响应不能证明 App 已支持。'
