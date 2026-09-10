# Registers a weekly Windows Task Scheduler job for Raff DB backups.
# Run once from PowerShell in the project root:
#   powershell -ExecutionPolicy Bypass -File scripts\register-raff-backup-task.ps1
#
# Default: Sundays 9:00 PM local time. PC must be on (or wake to run).

param(
  [string]$TaskName = "ShiftClose-Raff-DB-Backup",
  [string]$Time = "21:00",
  [ValidateSet("Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday")]
  [string]$Day = "Sunday"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$node = (Get-Command node -ErrorAction Stop).Source
$script = Join-Path $root "scripts\backup-raff.mjs"

if (-not (Test-Path $script)) {
  throw "Missing $script"
}

$action = New-ScheduledTaskAction -Execute $node -Argument "`"$script`"" -WorkingDirectory $root
$trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek $Day -At $Time
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null

Write-Host "Registered task '$TaskName' - every $Day at $Time"
Write-Host "Runs: $node $script"
Write-Host "Working directory: $root"
Write-Host "Test now: node scripts/backup-raff.mjs"
Write-Host "Remove later: Unregister-ScheduledTask -TaskName $TaskName -Confirm:`$false"
