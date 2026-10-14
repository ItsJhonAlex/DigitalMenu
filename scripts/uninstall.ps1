#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Desinstala MenuDigital (tarea, firewall, accesos directos, exe).
  Por defecto conserva data\. Use -RemoveData para borrar todo.
#>
param(
  [string]$InstallDir = "C:\MenuDigital",
  [switch]$RemoveData
)

$ErrorActionPreference = "Stop"
$TaskName = "MenuDigital"
$AdminLnkName = "Menú Digital — Admin.lnk"

Write-Host "=== MenuDigital uninstall ===" -ForegroundColor Cyan

Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
Write-Host "OK: tarea '$TaskName' eliminada (si existía)"

Get-Process -Name "MenuDigital","MenuDigital-debug" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 1

Get-NetFirewallRule -DisplayName "MenuDigital*" -ErrorAction SilentlyContinue | Remove-NetFirewallRule
Write-Host "OK: reglas de firewall eliminadas"

# Accesos directos Admin
$desktopTargets = @()
if ($env:PUBLIC) { $desktopTargets += (Join-Path $env:PUBLIC "Desktop") }
$userDesk = [Environment]::GetFolderPath("Desktop")
if ($userDesk) { $desktopTargets += $userDesk }
foreach ($desk in ($desktopTargets | Select-Object -Unique)) {
  $p = Join-Path $desk $AdminLnkName
  Remove-Item $p -Force -ErrorAction SilentlyContinue
  # Nombre antiguo de la documentación
  Remove-Item (Join-Path $desk "Menú Digital - Admin.lnk") -Force -ErrorAction SilentlyContinue
}

# Acceso directo Inicio
$startup = [Environment]::GetFolderPath("Startup")
if ($startup) {
  Remove-Item (Join-Path $startup "MenuDigital.lnk") -Force -ErrorAction SilentlyContinue
}
Write-Host "OK: accesos directos eliminados"

Remove-Item "$InstallDir\MenuDigital.exe" -Force -ErrorAction SilentlyContinue
Remove-Item "$InstallDir\MenuDigital-debug.exe" -Force -ErrorAction SilentlyContinue
Remove-Item "$InstallDir\MenuDigital.prev.exe" -Force -ErrorAction SilentlyContinue

if ($RemoveData) {
  if (Test-Path $InstallDir) {
    Remove-Item $InstallDir -Recurse -Force
    Write-Host "OK: $InstallDir eliminado (incl. data)"
  }
} else {
  Write-Host "OK: data\ conservado en $InstallDir\data (use -RemoveData para borrarlo)"
}

Write-Host "=== Desinstalación terminada ===" -ForegroundColor Cyan