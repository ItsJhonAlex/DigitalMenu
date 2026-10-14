#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Instala MenuDigital en el POS: exe, data, firewall, autoarranque y acceso directo Admin (RF-03, ADR-14).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\install.ps1 -PosUser "Cajero"
#>
param(
  [int]$Port = 8080,
  [string]$InstallDir = "C:\MenuDigital",
  [string]$PosUser = $env:USERNAME,
  [switch]$SkipStart
)

$ErrorActionPreference = "Stop"
$TaskName = "MenuDigital"
$AdminLnkName = "Menú Digital — Admin.lnk"

Write-Host "=== MenuDigital install ===" -ForegroundColor Cyan
Write-Host "InstallDir=$InstallDir  Port=$Port  PosUser=$PosUser"

# 1. Carpetas y ejecutables
New-Item -ItemType Directory -Force -Path "$InstallDir\data" | Out-Null
$srcExe = Join-Path $PSScriptRoot "MenuDigital.exe"
$srcDebug = Join-Path $PSScriptRoot "MenuDigital-debug.exe"
if (-not (Test-Path $srcExe)) {
  # Permitir instalar desde carpeta dist/ del repo de desarrollo
  $alt = Join-Path (Split-Path $PSScriptRoot -Parent) "dist\MenuDigital.exe"
  $altDebug = Join-Path (Split-Path $PSScriptRoot -Parent) "dist\MenuDigital-debug.exe"
  if (Test-Path $alt) { $srcExe = $alt; $srcDebug = $altDebug }
}
if (-not (Test-Path $srcExe)) {
  throw "No se encontró MenuDigital.exe junto a install.ps1 ni en dist\"
}
Copy-Item $srcExe "$InstallDir\MenuDigital.exe" -Force
if (Test-Path $srcDebug) {
  Copy-Item $srcDebug "$InstallDir\MenuDigital-debug.exe" -Force
  Unblock-File "$InstallDir\MenuDigital-debug.exe" -ErrorAction SilentlyContinue
}
Unblock-File "$InstallDir\MenuDigital.exe" -ErrorAction SilentlyContinue
icacls "$InstallDir\data" /grant "${PosUser}:(OI)(CI)M" | Out-Null
Write-Host "OK: ejecutables en $InstallDir"

# 2. Configuración inicial
$cfg = "$InstallDir\data\config.json"
if (-not (Test-Path $cfg)) {
  @{
    port = $Port
    host = "0.0.0.0"
    logLevel = "info"
    edgePath = $null
    backup = @{ keepDaily = 14; hour = 4 }
  } | ConvertTo-Json | Set-Content -Encoding UTF8 $cfg
  Write-Host "OK: config.json creado (puerto $Port)"
} else {
  Write-Host "OK: config.json existente (sin tocar)"
}

# 3. Firewall (solo perfil Private)
Get-NetFirewallRule -DisplayName "MenuDigital*" -ErrorAction SilentlyContinue | Remove-NetFirewallRule
New-NetFirewallRule -DisplayName "MenuDigital (TCP $Port)" -Direction Inbound -Action Allow `
  -Protocol TCP -LocalPort $Port -Profile Private | Out-Null
Write-Host "OK: regla de firewall TCP $Port (Private)"

# 4. Autoarranque — tarea programada al iniciar sesión (ADR-14)
#    ExecutionTimeLimit = 0 → sin límite (el default mataría a las 72 h)
#    Priority 7 → por debajo de lo normal (no compite con AxisPOS)
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

$action = New-ScheduledTaskAction `
  -Execute "$InstallDir\MenuDigital.exe" `
  -WorkingDirectory $InstallDir

$trigger = New-ScheduledTaskTrigger -AtLogOn -User $PosUser

$settings = New-ScheduledTaskSettingsSet `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -RestartCount 999 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew `
  -Priority 7

$principal = New-ScheduledTaskPrincipal `
  -UserId $PosUser `
  -LogonType Interactive `
  -RunLevel Limited

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Principal $principal `
  -Force | Out-Null

# Confirmar sin límite de tiempo (algunas ediciones de Windows ignoran el parámetro)
try {
  $task = Get-ScheduledTask -TaskName $TaskName
  $task.Settings.ExecutionTimeLimit = "PT0S"
  Set-ScheduledTask -InputObject $task | Out-Null
} catch {
  Write-Warning "No se pudo forzar ExecutionTimeLimit=PT0S: $($_.Exception.Message)"
}
Write-Host "OK: tarea programada '$TaskName' (AtLogOn, sin límite de tiempo)"
# Sin acceso directo en Inicio: la tarea ya arranca el servidor; un .lnk duplicado
# provocaba doble arranque y falso aviso de puerto ocupado (RF-04).

# 5. Acceso directo Admin en escritorio público + del usuario
$ws = New-Object -ComObject WScript.Shell
$desktopTargets = @()
if ($env:PUBLIC) { $desktopTargets += (Join-Path $env:PUBLIC "Desktop") }
$userDesk = [Environment]::GetFolderPath("Desktop")
if ($userDesk) { $desktopTargets += $userDesk }
foreach ($desk in ($desktopTargets | Select-Object -Unique)) {
  if (-not (Test-Path $desk)) { continue }
  $lnkPath = Join-Path $desk $AdminLnkName
  $lnk = $ws.CreateShortcut($lnkPath)
  $lnk.TargetPath = "$InstallDir\MenuDigital.exe"
  $lnk.Arguments = "--open-admin"
  $lnk.WorkingDirectory = $InstallDir
  $lnk.IconLocation = "$InstallDir\MenuDigital.exe,0"
  $lnk.Description = "Menú Digital — Admin (Avanzar In Time)"
  $lnk.Save()
  Write-Host "OK: acceso directo Admin → $lnkPath"
}

# 6. Energía: no suspender (carta disponible)
powercfg /change standby-timeout-ac 0 | Out-Null
powercfg /change hibernate-timeout-ac 0 | Out-Null
Write-Host "OK: suspensión AC desactivada"

# 7. Arrancar ahora y comprobar
if (-not $SkipStart) {
  Start-ScheduledTask -TaskName $TaskName
  $ok = $false
  for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Seconds 1
    try {
      $health = Invoke-RestMethod "http://127.0.0.1:$Port/api/health" -TimeoutSec 2
      if ($health.app -eq "DigitalMenu") { $ok = $true; break }
    } catch { }
  }
  if ($ok) {
    Write-Host "OK: servidor activo — $($health | ConvertTo-Json -Compress)" -ForegroundColor Green
  } else {
    Write-Warning "El servidor no respondió a /api/health. Revise logs en $InstallDir\data\logs"
  }
}

Write-Host "=== Instalación terminada ===" -ForegroundColor Cyan