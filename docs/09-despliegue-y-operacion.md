# 09 — Despliegue y operación

## 1. Requisitos

### Máquina de desarrollo
- Windows con **Bun 1.4.3**, Git y pnpm (pnpm no es necesario; se usa `bun install`, ver 05 §6).
- Los parámetros `--windows-hide-console` y `--windows-icon` de `bun build --compile` solo funcionan al compilar **en Windows** (*Supuesto* según el comportamiento conocido de Bun; validar en la Fase 0).

### PC del POS
- Windows 11 Pro 24H2 x64, i3-3110M (sin AVX2), 4 GB RAM, Microsoft Edge instalado, AxisPOS.
- **Sin internet**: todo se transfiere por **USB** (o carpeta compartida en la LAN, si existe).
- Una cuenta de usuario de Windows con la que trabaja el POS (*Supuesto*: la misma sesión en la que corre AxisPOS, con inicio de sesión automático o manual al encender).
- Permisos de administrador **solo durante la instalación** (firewall, tarea programada).

## 2. Build

### 2.1 Comandos

```powershell
cd DigitalMenu
bun install
bun test
bun run typecheck
bun run build          # ejecuta scripts/build.ts
```

### 2.2 `scripts/build.ts` (propuesta)

```ts
import { $ } from "bun";
import pkg from "../package.json";

const version = pkg.version;
await $`bun run build:web`;                    // dist/web/{carta,admin} minificados + .gz
await $`bun scripts/gen-assets-manifest.ts`;   // src/server/assets.generated.ts
await $`bun scripts/check-budget.ts`;          // falla si la carta supera 60 KB gzip

const common = [
  "./src/server/main.ts",
  "--compile",
  "--target=bun-windows-x64-baseline",         // ¡OBLIGATORIO! la CPU del POS no tiene AVX2
  "--minify",
  "--sourcemap",                               // trazas legibles en los logs
  `--define`, `APP_VERSION="${version}"`,
];

// Producción: sin ventana de consola, con icono
await $`bun build ${common} --windows-hide-console --windows-icon=./assets/icon.ico --outfile ./dist/MenuDigital.exe`;
// Depuración: con consola visible (para diagnosticar en el POS)
await $`bun build ${common} --windows-icon=./assets/icon.ico --outfile ./dist/MenuDigital-debug.exe`;

console.log(`OK: dist/MenuDigital.exe v${version}`);
```

Comando equivalente manual:

```powershell
bun build .\src\server\main.ts --compile --target=bun-windows-x64-baseline --minify --sourcemap `
  --windows-hide-console --windows-icon=.\assets\icon.ico `
  --define APP_VERSION='"0.1.0"' --outfile .\dist\MenuDigital.exe
```

> **Importante:** nunca distribuir un build con `--target=bun-windows-x64` (o sin `--target` en una máquina con AVX2): en el i3-3110M fallaría al arrancar (instrucción ilegal). Ver ADR-02.
>
> **Supuesto:** si `--smol` resulta útil para reducir RAM (Fase 0), se aplicará en tiempo de ejecución (p. ej. mediante `BUN_OPTIONS` o el mecanismo que soporte Bun 1.4.3 para ejecutables compilados); a validar.

### 2.3 Paquete de entrega (USB)

```
MenuDigital-v1.0.0\
├─ MenuDigital.exe
├─ MenuDigital-debug.exe
├─ install.ps1
├─ update.ps1
├─ uninstall.ps1
├─ LEEME.txt                 ← pasos resumidos
└─ SHA256SUMS.txt            ← Get-FileHash para verificar la copia
```

Generar sumas: `Get-FileHash .\MenuDigital.exe -Algorithm SHA256`.

## 3. Instalación en el POS

### 3.1 Comprobaciones previas

| Comprobación | Comando / acción | Esperado |
|-------------|------------------|----------|
| Puerto libre | `netstat -ano \| findstr ":8080"` | Sin resultados (si no, elegir otro puerto) |
| Puertos de AxisPOS | `netstat -ano \| findstr LISTENING` + `tasklist /FI "PID eq <pid>"` | Anotar y evitar |
| Perfil de red | `Get-NetConnectionProfile` | `NetworkCategory : Private` (si es `Public`, cambiarlo) |
| Edge | `Test-Path "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"` | `True` |
| MAC aleatoria desactivada | Configuración → Red e Internet → Wi-Fi → *Direcciones de hardware aleatorias* | **Desactivado** (si no, la reserva DHCP falla) |
| Aislamiento de clientes (router) | Panel del router → Wifi → *AP/Client isolation* | **Desactivado** en la red de clientes |

### 3.2 Script `install.ps1` (ejecutar como administrador)

> Guardar los `.ps1` en **UTF-8 con BOM** (PowerShell 5.1 los necesita así para los acentos). Ejecutar con: `powershell -ExecutionPolicy Bypass -File .\install.ps1 -PosUser "<usuario del POS>"`.

```powershell
#Requires -RunAsAdministrator
param(
  [int]$Port = 8080,
  [string]$InstallDir = "C:\MenuDigital",
  [string]$PosUser = $env:USERNAME
)
$ErrorActionPreference = "Stop"

# 1. Carpetas y ejecutable
New-Item -ItemType Directory -Force -Path "$InstallDir\data" | Out-Null
Copy-Item "$PSScriptRoot\MenuDigital.exe" "$InstallDir\MenuDigital.exe" -Force
Copy-Item "$PSScriptRoot\MenuDigital-debug.exe" "$InstallDir\MenuDigital-debug.exe" -Force
Unblock-File "$InstallDir\MenuDigital.exe"
Unblock-File "$InstallDir\MenuDigital-debug.exe"
icacls "$InstallDir\data" /grant "${PosUser}:(OI)(CI)M" | Out-Null

# 2. Configuración inicial (si no existe)
$cfg = "$InstallDir\data\config.json"
if (-not (Test-Path $cfg)) {
  @{ port = $Port; host = "0.0.0.0"; logLevel = "info"; backup = @{ keepDaily = 14; hour = 4 } } |
    ConvertTo-Json | Set-Content -Encoding UTF8 $cfg
}

# 3. Firewall: permitir el puerto solo en redes privadas
Get-NetFirewallRule -DisplayName "MenuDigital*" -ErrorAction SilentlyContinue | Remove-NetFirewallRule
New-NetFirewallRule -DisplayName "MenuDigital (TCP $Port)" -Direction Inbound -Action Allow `
  -Protocol TCP -LocalPort $Port -Profile Private | Out-Null

# 4. Autoarranque: tarea programada al iniciar sesión del usuario del POS
$action    = New-ScheduledTaskAction -Execute "$InstallDir\MenuDigital.exe" -WorkingDirectory $InstallDir
$trigger   = New-ScheduledTaskTrigger -AtLogOn -User $PosUser
# ExecutionTimeLimit 0 = sin límite (el valor por defecto mata la tarea a las 72 h)
# Priority 7 = por debajo de lo normal (no compite con AxisPOS)
$settings  = New-ScheduledTaskSettingsSet `
               -ExecutionTimeLimit ([TimeSpan]::Zero) `
               -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
               -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
               -StartWhenAvailable -MultipleInstances IgnoreNew `
               -Priority 7
$principal = New-ScheduledTaskPrincipal -UserId $PosUser -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName "MenuDigital" -Action $action -Trigger $trigger `
  -Settings $settings -Principal $principal -Force | Out-Null

# 5. Acceso directo al Admin en el escritorio público
$ws  = New-Object -ComObject WScript.Shell
$lnk = $ws.CreateShortcut("$env:PUBLIC\Desktop\Menú Digital - Admin.lnk")
$lnk.TargetPath   = "$InstallDir\MenuDigital.exe"
$lnk.Arguments    = "--open-admin"
$lnk.IconLocation = "$InstallDir\MenuDigital.exe,0"
$lnk.Save()

# 6. Energía: que el PC no se suspenda (la carta debe estar disponible)
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0

# 7. Arrancar ahora y comprobar
Start-ScheduledTask -TaskName "MenuDigital"
Start-Sleep -Seconds 3
Invoke-RestMethod "http://127.0.0.1:$Port/api/health"
```

### 3.3 Pasos manuales complementarios

1. **Perfil de red Privado** (si `Get-NetConnectionProfile` muestra `Public`):
   `Set-NetConnectionProfile -InterfaceAlias "Wi-Fi" -NetworkCategory Private` (o el alias del adaptador Ethernet).
2. **Ahorro de energía del adaptador wifi**: Administrador de dispositivos → adaptador → Administración de energía → desmarcar "Permitir que el equipo apague este dispositivo".
3. **IP fija** (sección 6).
4. Abrir el Admin desde el acceso directo → configurar nombre del restaurante, wifi, monedas, cargar la carta.
5. Imprimir la tarjeta QR y probarla con un Android y un iPhone.

### 3.4 Alternativas de autoarranque

| Opción | Ventajas | Inconvenientes |
|--------|----------|----------------|
| **Tarea programada al iniciar sesión** (elegida) | Reinicio automático si falla, prioridad baja, sin límite de tiempo | Requiere que alguien inicie sesión (normal en un POS) |
| Tarea programada al **iniciar el sistema** como `SYSTEM` | Funciona sin iniciar sesión | Permisos de `data\`, `--open-admin` no aplica en esa sesión; más complejo |
| Acceso directo en `shell:startup` | Muy simple | Sin reinicio automático ni control de prioridad |
| Servicio de Windows (NSSM/WinSW) | Robusto | Herramienta extra; ADR-14 lo descarta en la Fase 1 |

## 4. Abrir el Admin

- Acceso directo "Menú Digital - Admin" → `MenuDigital.exe --open-admin` → comprueba que el servidor está activo (o lo arranca) → lanza:

```
"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --app=http://localhost:8080/admin --window-size=1280,760
```

- Cerrar la ventana cuando se termine (ahorra ~100–250 MB de RAM). El servidor sigue funcionando.
- Alternativa manual: escribir `http://localhost:8080/admin` en Edge.

## 5. Copias de seguridad

| Tipo | Cuándo | Contenido | Ubicación |
|------|--------|-----------|-----------|
| Automática diaria | 04:00 si el PC está encendido, o al arrancar si la última tiene > 24 h | `menu.db` (`VACUUM INTO`) | `data\backups\menu-AAAAMMDD-HHMM.db` (14 últimas) |
| Previa a migración | Antes de aplicar migraciones al actualizar | `menu.db` | `data\backups\pre-migracion-NNN-…db` |
| Previa a restauración | Antes de restaurar | `menu.db` | `data\backups\pre-restore-…db` |
| **Completa manual** | **Semanal (recomendado)** y antes de cada actualización | `menu.db` + `images\` + `config.json` (.zip) | `data\backups\full-…zip` → **copiar a USB** |

> Las copias dentro del mismo disco no protegen contra fallo del disco o robo. **Procedimiento recomendado:** cada semana, Admin → Ajustes → Copias → "Exportar copia completa" → guardar el `.zip` en un USB que se guarde fuera del PC.

### Restauración
- **Desde el Admin**: Ajustes → Copias → elegir copia → Restaurar (se crea `pre-restore` automáticamente).
- **Manual (si el Admin no arranca)**: detener la tarea (`Stop-ScheduledTask MenuDigital`; `Stop-Process -Name MenuDigital`), renombrar `menu.db` a `menu.db.roto`, borrar `menu.db-wal` y `menu.db-shm`, copiar la copia como `menu.db` (y descomprimir `images\` si es un zip completo), arrancar la tarea.

### Migración a otro PC
1. Exportar copia completa → USB.
2. Instalar en el nuevo PC (`install.ps1`).
3. Admin → Ajustes → Copias → Importar copia (o restauración manual).
4. Reservar la nueva IP / revisar QR (la IP cambiará).

## 6. IP fija (muy recomendado)

Los QR impresos contienen la IP (`http://192.168.1.50:8080/`). Si la IP cambia, los QR dejan de funcionar. DigitalMenu **detecta** el cambio y avisa en el Admin (RF-37), pero lo correcto es evitarlo.

### Opción A — Reserva DHCP en el router (recomendada)
1. Admin → Red y QR: anotar la **MAC** y la IP actual del adaptador del POS.
2. Entrar al panel del router (habitualmente `http://192.168.1.1` o `http://192.168.0.1`; ver etiqueta del router).
3. Buscar *DHCP → Reserva de direcciones / Address Reservation / Static Lease / IP & MAC Binding*.
4. Añadir: MAC del POS → IP deseada (p. ej. `192.168.1.50`). Guardar.
5. Reiniciar la conexión del POS (`ipconfig /release` y `ipconfig /renew`) y comprobar `ipconfig`.
6. Verificar que **"Direcciones de hardware aleatorias"** está desactivado para esa red en Windows (si no, la MAC cambia y la reserva no aplica).

### Opción B — IP estática en Windows (si el router no permite reservas)
Elegir una IP **fuera del rango DHCP** del router (p. ej. si el DHCP reparte `.100–.199`, usar `.50`):

```powershell
New-NetIPAddress -InterfaceAlias "Wi-Fi" -IPAddress 192.168.1.50 -PrefixLength 24 -DefaultGateway 192.168.1.1
Set-DnsClientServerAddress -InterfaceAlias "Wi-Fi" -ServerAddresses 192.168.1.1
```

> Riesgo: si se cambia el router o su rango, el POS puede quedarse sin red (incluida AxisPOS si la usa). Documentar el cambio y dejar constancia en el router.

### ¿Por qué no un nombre (`menu.local`)?
mDNS (`.local`) no es fiable en Android ni en todos los routers; DNS local requiere configurar el router. Se descarta en la Fase 1 (ADR-15).

### Puerto 80 (opcional)
Con el puerto 80 la URL queda `http://192.168.1.50/`. En Windows no hace falta ser administrador para escuchar en el 80, pero puede estar ocupado por IIS u otro servicio (`netstat -ano | findstr ":80 "`). Si se cambia: actualizar `config.json`, regla de firewall y **reimprimir QR**.

## 7. Actualizaciones

### 7.1 Procedimiento (`update.ps1`)

```powershell
#Requires -RunAsAdministrator
param([string]$InstallDir = "C:\MenuDigital", [int]$Port = 8080)
$ErrorActionPreference = "Stop"

# 0. Recomendado: exportar copia completa desde el Admin antes de actualizar
Stop-ScheduledTask -TaskName "MenuDigital" -ErrorAction SilentlyContinue
Get-Process -Name "MenuDigital" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2

Copy-Item "$InstallDir\MenuDigital.exe" "$InstallDir\MenuDigital.prev.exe" -Force
Copy-Item "$PSScriptRoot\MenuDigital.exe" "$InstallDir\MenuDigital.exe" -Force
Copy-Item "$PSScriptRoot\MenuDigital-debug.exe" "$InstallDir\MenuDigital-debug.exe" -Force
Unblock-File "$InstallDir\MenuDigital.exe"

Start-ScheduledTask -TaskName "MenuDigital"
Start-Sleep -Seconds 3
Invoke-RestMethod "http://127.0.0.1:$Port/api/health"   # debe mostrar la nueva versión
```

- Las migraciones se aplican solas al arrancar (con copia previa automática).
- Detener el proceso con `Stop-Process -Force` es seguro gracias a WAL. *Should:* endpoint local `POST /api/admin/shutdown` para una parada ordenada.

### 7.2 Vuelta atrás (rollback)
1. Detener el proceso.
2. `Copy-Item MenuDigital.prev.exe MenuDigital.exe -Force`.
3. **Si la nueva versión aplicó migraciones**, restaurar `data\backups\pre-migracion-…db` como `menu.db` (la versión anterior no entiende el esquema nuevo).
4. Arrancar la tarea.

### 7.3 Política
- Actualizar fuera del horario de servicio.
- Probar cada versión primero en la máquina de desarrollo con una **copia de los datos reales** del restaurante.
- Probar el `.exe` en el POS con `MenuDigital-debug.exe --port 8099 --data C:\MenuDigital\data-prueba` antes de reemplazar (*Supuesto*: aceptable usar un puerto temporal).

## 8. Operación diaria

| Tarea | Quién | Dónde |
|-------|-------|-------|
| Actualizar tasa del día | Encargado | Admin → Inicio |
| Marcar agotados | Personal | Admin → Inicio |
| Cerrar el Admin tras usarlo | Personal | — |
| Exportar copia completa a USB | Encargado | Semanal |
| Revisar banner de avisos (IP) | Encargado | Admin |

## 9. Diagnóstico y resolución de problemas

| Síntoma | Causa probable | Solución |
|---------|----------------|----------|
| Los teléfonos no abren la carta | IP cambiada | Ver banner del Admin; reserva DHCP; reimprimir QR |
| | Firewall / red Pública | `Get-NetConnectionProfile`; regla de firewall en perfil Privado |
| | Aislamiento de clientes en el router / red de invitados | Desactivar *AP isolation* o poner el POS en la misma red que los clientes |
| | El teléfono usa datos móviles porque "el wifi no tiene internet" | Aceptar "mantener wifi"; desactivar datos móviles temporalmente |
| | Servidor detenido | `Get-Process MenuDigital`; `Start-ScheduledTask MenuDigital`; revisar `logs\` |
| El `.exe` se cierra al instante | Build sin `baseline` (AVX2) | Recompilar con `--target=bun-windows-x64-baseline` |
| | Puerto ocupado | Ver log; cambiar puerto en `config.json` |
| | Error de migración | Ver log; restaurar copia `pre-migracion` y avisar al desarrollador |
| Ver errores en vivo | — | Ejecutar `MenuDigital-debug.exe` (con consola) tras detener la tarea |
| SmartScreen/antivirus bloquea | Ejecutable sin firmar | `Unblock-File`; "Más información → Ejecutar de todas formas"; exclusión de `C:\MenuDigital` en Defender si es necesario |
| Admin dice 403 | Abierto con la IP en vez de `localhost` | Usar `http://localhost:8080/admin` o el acceso directo |
| RAM > 100 MB | Posible fuga | Anotar en diagnóstico, reiniciar la tarea, enviar logs al desarrollador |
| QR wifi no conecta en iPhone | Caracteres especiales sin escapar / seguridad incorrecta | Verificar tipo (`WPA`) y contraseña; regenerar QR |

## 10. Desinstalación (`uninstall.ps1`)

```powershell
#Requires -RunAsAdministrator
param([string]$InstallDir = "C:\MenuDigital", [switch]$RemoveData)
Unregister-ScheduledTask -TaskName "MenuDigital" -Confirm:$false -ErrorAction SilentlyContinue
Get-Process -Name "MenuDigital" -ErrorAction SilentlyContinue | Stop-Process -Force
Get-NetFirewallRule -DisplayName "MenuDigital*" -ErrorAction SilentlyContinue | Remove-NetFirewallRule
Remove-Item "$env:PUBLIC\Desktop\Menú Digital - Admin.lnk" -ErrorAction SilentlyContinue
Remove-Item "$InstallDir\*.exe" -ErrorAction SilentlyContinue
if ($RemoveData) { Remove-Item "$InstallDir" -Recurse -Force }
```

Por defecto **conserva** `data\` (la carta y las fotos del restaurante); usar `-RemoveData` para borrarlo todo.
