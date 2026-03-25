# Baseline an existing Postgres/Neon DB that already matches all migrations
# EXCEPT app_users / password_reset_tokens (20260325140000_app_users_rbac).
#
# Use when: `prisma migrate dev` or `deploy` fails with P3005, and login fails with
# P2021 (table app_users does not exist) because RBAC migration never ran.
#
# Steps:
# 1. Backup your database.
# 2. Confirm your schema already matches everything before 20260325140000_app_users_rbac
#    (all Shift Close tables except app_users / password_reset_tokens).
# 3. Run from repo root:
#      .\scripts\baseline-migrations-before-rbac.ps1
#    Non-interactive:
#      .\scripts\baseline-migrations-before-rbac.ps1 -Force
# 4. Then:
#      npx prisma migrate deploy
# 5. Seed users (optional):
#      npx prisma db seed
#
# If your DB is truly empty, do NOT use this script — use `npx prisma migrate deploy` only.
#
# When deploy keeps failing with 42P07 (relation exists) or 42701 (column exists), your DB
# already has those objects — not only "new tables" but also ALTER TABLE ... ADD COLUMN
# on staff and other tables. Same fix: mark that migration as applied, or use
# -ContinueOnError to mark all pre-RBAC migrations and skip errors (e.g. already applied).

param([switch]$Force, [switch]$ContinueOnError)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
if (-not (Test-Path (Join-Path $root "prisma\schema.prisma"))) {
  Write-Error "Run this script from the Shift Close repo (prisma/schema.prisma not found)."
}
Set-Location $root

$cutoff = "20260325140000_app_users_rbac"
$dirs = Get-ChildItem "prisma\migrations" -Directory | Sort-Object Name
$toResolve = $dirs | Where-Object { $_.Name -lt $cutoff }

Write-Host "Will mark $($toResolve.Count) migrations as applied (all folders before $cutoff)."
Write-Host "Then run: npx prisma migrate deploy"
if (-not $Force) {
  $confirm = Read-Host "Continue? (y/N)"
  if ($confirm -ne "y" -and $confirm -ne "Y") { exit 0 }
}

foreach ($d in $toResolve) {
  Write-Host "resolve --applied $($d.Name)"
  npx prisma migrate resolve --applied $d.Name 2>&1
  if ($LASTEXITCODE -ne 0) {
    if ($ContinueOnError) {
      Write-Warning "Skipped or failed (often already applied): $($d.Name)"
    } else {
      exit $LASTEXITCODE
    }
  }
}

Write-Host ""
Write-Host "Done. Next: npx prisma migrate deploy"
