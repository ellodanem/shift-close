# Installs a Windows Scheduled Task to run the harvest agent at user logon.
# Run from an elevated PowerShell prompt if the task cannot be created.
param(
  [string]$NodePath = (Get-Command node -ErrorAction SilentlyContinue).Source,
  [string]$WorkingDir = (Split-Path -Parent $PSScriptRoot)
)

if (-not $NodePath) {
  Write-Error "Node.js not found on PATH. Install Node 18+ first."
  exit 1
}

$taskName = "ShiftCloseHarvestAgent"
$indexJs = Join-Path $WorkingDir "src\index.js"
$action = New-ScheduledTaskAction -Execute $NodePath -Argument "`"$indexJs`"" -WorkingDirectory $WorkingDir
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null

Write-Host "Scheduled task '$taskName' created."
Write-Host "It runs: node $indexJs"
Write-Host "Dashboard: http://127.0.0.1:3921"
Write-Host "To remove: Unregister-ScheduledTask -TaskName '$taskName' -Confirm:`$false"
