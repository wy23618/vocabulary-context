param([string]$RuntimeDirectory = (Join-Path (Split-Path -Parent $PSScriptRoot) '.runtime\elis-local'))
$ErrorActionPreference = 'Stop'
$resolvedRuntime = [IO.Path]::GetFullPath($RuntimeDirectory)
if (($resolvedRuntime -split '[\\/]') -notcontains '.runtime') { throw '测试目录必须位于 .runtime 内。' }
$taskName = 'Elis-LocalTest'
$launcher = Join-Path $PSScriptRoot 'Run-LocalTest.ps1'
$shellPath = (Get-Command pwsh -ErrorAction Stop).Source
$identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing -and $existing.State -eq 'Running') {
  Write-Output 'Elis 本地测试已在独立后台运行。'
  exit 0
}
$action = New-ScheduledTaskAction -Execute $shellPath -Argument "-NoLogo -NoProfile -WindowStyle Hidden -File `"$launcher`" -RuntimeDirectory `"$resolvedRuntime`"" -WorkingDirectory (Split-Path -Parent $PSScriptRoot)
$principal = New-ScheduledTaskPrincipal -UserId $identity -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -Hidden -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew
# On-demand process host only: no schedule, logon trigger, or saved password.
Register-ScheduledTask -TaskName $taskName -Action $action -Principal $principal -Settings $settings -Description 'Elis 独立本地测试服务和 HTTPS 通道；与 Codex 进程分离。' -Force | Out-Null
Start-ScheduledTask -TaskName $taskName
Write-Output 'Elis 本地测试正在独立后台启动，关闭或重启 Codex 不会停止此进程。'
Write-Output "连接记录：$(Join-Path $resolvedRuntime 'connection.json')"
Write-Output '停止：Stop-ScheduledTask -TaskName Elis-LocalTest'
