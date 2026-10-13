# 03 — Requisitos no funcionales

Cada RNF incluye una **métrica** y un **método de verificación**. Los valores se miden en el **PC del POS real** (i3-3110M, 4 GB RAM, Windows 11 24H2) con AxisPOS abierto, salvo que se indique otra cosa.

## Resumen

| ID | Categoría | Requisito (resumen) | Prioridad |
|----|-----------|---------------------|-----------|
| RNF-01 | Rendimiento | Carta lista en < 2 s en teléfono gama media | Must |
| RNF-02 | Memoria | RSS de `MenuDigital.exe` ~50–80 MB (máx. 100 MB) | Must |
| RNF-03 | CPU | < 2 % CPU en reposo; picos breves | Must |
| RNF-04 | Concurrencia | 50 clientes simultáneos sin degradación visible | Must |
| RNF-05 | Arranque | Servidor listo en < 3 s | Should |
| RNF-06 | Peso de la carta | HTML+CSS+JS ≤ 60 KB comprimido (sin imágenes) | Must |
| RNF-07 | Peso de imágenes | Miniatura ≤ 40 KB, grande ≤ 150 KB (típico) | Must |
| RNF-08 | Disco | Instalación + datos típicos < 300 MB | Should |
| RNF-10 | Offline | Cero dependencias de internet | Must |
| RNF-11 | Offline | Recursos (fuentes, iconos, JS) empaquetados localmente | Must |
| RNF-12 | Resiliencia | Sobrevive a cortes de luz sin corrupción de datos | Must |
| RNF-20 | Seguridad | Admin solo localhost (IP + Host + Origin) | Must |
| RNF-21 | Seguridad | Carta solo lectura, superficie mínima | Must |
| RNF-22 | Seguridad | Validación de entradas y subidas | Must |
| RNF-23 | Seguridad | Cabeceras de seguridad HTTP | Should |
| RNF-24 | Seguridad | Sin secretos expuestos en la Carta | Must |
| RNF-30 | Compatibilidad | CPU sin AVX2 (target baseline) | Must |
| RNF-31 | Compatibilidad | Windows 11 Pro 24H2 x64 | Must |
| RNF-32 | Compatibilidad | Edge Chromium para Admin | Must |
| RNF-33 | Compatibilidad | Navegadores móviles de los clientes | Must |
| RNF-34 | Convivencia | No interferir con AxisPOS | Must |
| RNF-40 | Usabilidad | Admin usable sin formación en < 15 min | Must |
| RNF-41 | Usabilidad | Carta usable con una mano, táctil | Must |
| RNF-42 | Usabilidad | Accesibilidad básica (contraste, tamaños) | Should |
| RNF-43 | Usabilidad | Mensajes de error claros en español | Must |
| RNF-50 | Mantenibilidad | TypeScript estricto, estructura modular | Must |
| RNF-51 | Mantenibilidad | Pruebas automatizadas de lógica crítica | Must |
| RNF-52 | Mantenibilidad | Migraciones de BD versionadas | Must |
| RNF-53 | Mantenibilidad | Dependencias mínimas y puras JS | Must |
| RNF-54 | Mantenibilidad | Build reproducible con un comando | Must |
| RNF-55 | Mantenibilidad | Logs y diagnóstico | Must |

---

## 1. Rendimiento

### RNF-01 — Tiempo de carga de la Carta
- **Métrica:** primera carga completa (HTML + CSS + JS + `/api/menu` + miniaturas visibles) < **2 s**; cambio de idioma < **500 ms**; cambio de moneda < **100 ms** (cálculo local).
- **Condiciones:** teléfono Android gama media (*Supuesto*: ~2020, Chrome actual) en el wifi del local, 60 productos con foto.
- **Verificación:** Chrome DevTools remoto / Lighthouse en modo móvil contra el POS; `curl -w "%{time_total}"` para la API (< 100 ms en servidor).

### RNF-03 — Uso de CPU
- **Métrica:** < 2 % de CPU media en reposo; < 25 % durante una ráfaga de 50 peticiones de carta; procesos de mantenimiento (backup, limpieza) < 5 s.
- **Diseño:** sin sondeos agresivos (detección de IP cada 60 s), sin trabajo de imágenes en el servidor (ADR-07), respuestas de `/api/menu` cacheadas en memoria e invalidadas al editar.
- **Verificación:** Monitor de rendimiento de Windows (`perfmon`) durante 30 min.

### RNF-04 — Concurrencia
- **Métrica:** 50 clientes abriendo la carta en el mismo minuto, p95 de `/api/menu` < 200 ms en el servidor.
- **Verificación:** `bombardier`/`oha` o script `bun scripts/load.ts` desde otro PC en la LAN: 50 conexiones, 500 peticiones.

### RNF-05 — Tiempo de arranque
- **Métrica:** desde ejecución del `.exe` hasta `GET /api/health` = 200 en < **3 s** (con disco HDD *Supuesto*; probable < 1 s en SSD).

### RNF-06 — Peso de la Carta
- **Métrica:** HTML + CSS + JS de la Carta ≤ **60 KB** comprimido (gzip/brotli), ≤ 200 KB sin comprimir; sin frameworks (React/Vue/Angular). Fuentes: máximo 2 archivos WOFF2 de subset latino (≤ 60 KB en total) o fuentes del sistema.
- **Verificación:** script de build que falla si se supera el presupuesto (`scripts/check-budget.ts`).

### RNF-07 — Peso de imágenes
- **Métrica:** variantes WebP: miniatura 400 px ≤ 40 KB, grande 1000 px ≤ 150 KB en el caso típico. Las imágenes se sirven con `Cache-Control: public, max-age=31536000, immutable` (nombre por hash).

### RNF-08 — Disco
- **Métrica:** `MenuDigital.exe` ≈ 60–110 MB (*Supuesto*: tamaño habitual de un ejecutable compilado con Bun); datos con 150 productos ≈ 20–40 MB; copias de BD de pocos MB cada una.

## 2. Memoria

### RNF-02 — Consumo de RAM
- **Métrica:** RSS (*Working Set* en el Administrador de tareas) de `MenuDigital.exe`: objetivo **50–80 MB** en régimen normal; **límite duro 100 MB**; sin crecimiento sostenido (fuga) tras 7 días encendido (< 10 % de crecimiento).
- **Fuera del presupuesto:** la ventana de Edge del Admin (≈ 100–250 MB) **no** se cuenta, porque solo está abierta mientras se administra. Debe cerrarse tras usarla; el servidor no depende de ella.
- **Medidas de diseño:**
  - Una sola conexión `bun:sqlite`, `PRAGMA cache_size = -4000` (≈ 4 MB).
  - Imágenes servidas en streaming desde disco con `Bun.file()` (no se cargan en memoria).
  - Caché en memoria solo del JSON de `/api/menu` por idioma (decenas de KB).
  - Sin procesamiento de imágenes en el servidor.
  - Assets de la Carta/Admin embebidos y servidos con `Bun.file()` desde el ejecutable.
- **Verificación:** endpoint de diagnóstico (`process.memoryUsage()`), `Get-Process MenuDigital | Select WorkingSet64` cada hora durante una prueba de 72 h (`scripts/soak.ps1`).

> **Supuesto:** un proceso Bun en reposo con SQLite ocupa ~35–60 MB de RSS en Windows. Debe medirse en la Fase 0; si supera 80 MB, se evaluará `--smol` (modo de menor memoria de Bun) y ajustes del GC (ver ADR-01).

## 3. Funcionamiento sin internet

### RNF-10 — Cero dependencias de internet
- Ninguna petición a CDN, Google Fonts, APIs externas, telemetría ni comprobación de actualizaciones.
- **Verificación:** prueba con el cable/wifi de salida desconectado; DevTools → pestaña Red sin peticiones fuera de `localhost`/IP local; `rg "https?://" src/carta src/admin` no muestra URLs externas (salvo comentarios).

### RNF-11 — Recursos locales
- Fuentes, iconos (SVG en línea), librería QR y CSS se empaquetan en el `.exe`.
- La generación de QR se hace localmente (librería JS pura).

### RNF-12 — Resiliencia ante cortes
- SQLite en modo **WAL** con `synchronous = NORMAL` (o `FULL` para máxima seguridad, *Supuesto*: `NORMAL` es suficiente con copias diarias), escrituras dentro de transacciones.
- Las imágenes se escriben en un archivo temporal y se renombran (escritura atómica).
- Tras un corte de luz el servidor arranca automáticamente (autoarranque) y la BD es consistente (`PRAGMA integrity_check` al arrancar si hubo cierre no limpio, *Should*).

## 4. Seguridad

### RNF-20 — Aislamiento del Admin
- Triple control en `/admin*` y `/api/admin/*`:
  1. **IP remota** (`server.requestIP(req)`) ∈ {`127.0.0.1`, `::1`, `::ffff:127.0.0.1`}.
  2. **Host** ∈ {`localhost:PUERTO`, `127.0.0.1:PUERTO`} (defensa contra DNS rebinding).
  3. **Origin** (en métodos de escritura) = `http://localhost:PUERTO` o `http://127.0.0.1:PUERTO`.
- Respuesta ante rechazo: 403 genérico, sin detalle; se registra en el log (limitado a 1 línea/min por IP para no inflar logs).
- **Verificación:** pruebas automatizadas con IP simulada + prueba manual desde un teléfono.

### RNF-21 — Carta de solo lectura
- Las rutas públicas solo aceptan `GET`/`HEAD`. Cualquier otro método → 405.
- Rutas públicas permitidas: `/`, `/assets/*`, `/img/*`, `/api/menu`, `/api/health`.

### RNF-22 — Validación de entradas
- Todas las entradas del Admin se validan en el servidor (esquemas con `zod` o validadores propios ligeros, ver ADR-09): longitudes máximas (nombre ≤ 80, descripción ≤ 500), precios enteros ≥ 0 y ≤ 10⁹, tasas > 0.
- Consultas SQL siempre con parámetros (`db.query("... WHERE id = ?")`); nunca concatenación.
- Subidas: tamaño máximo 2 MB por archivo, verificación de bytes mágicos (WebP `RIFF....WEBP`, JPEG `FF D8 FF`, PNG `89 50 4E 47`), nombre generado por hash.
- `/img/:name` solo acepta `^[a-f0-9]{16,64}(_t)?\.(webp|jpg|png)$` (evita path traversal).
- Salida HTML escapada (los textos del menú se insertan con `textContent`, no `innerHTML`).

### RNF-23 — Cabeceras HTTP
- `Content-Security-Policy: default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-ancestors 'self'` (ajustable al diseño final).
- `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: SAMEORIGIN`.

### RNF-24 — Sin secretos en la Carta
- `/api/menu` **no** expone la contraseña del wifi, el PIN, rutas del disco ni ajustes internos. Solo se exponen claves de `settings` con prefijo `carta.` o explícitamente públicas.
- El QR de wifi solo se genera en el Admin.

> **Nota:** la Carta funciona por HTTP (sin TLS) dentro de la LAN. Es aceptable porque el contenido es público y de solo lectura. HTTPS local requeriría certificados no confiables en los teléfonos (ver ADR-10).

## 5. Compatibilidad

### RNF-30 — CPU sin AVX2
- El ejecutable se compila **siempre** con `--target=bun-windows-x64-baseline`. El build normal (`bun-windows-x64`) requiere AVX2 y fallaría en el i3-3110M (Ivy Bridge).
- **Verificación:** prueba de humo en el POS real con cada versión (Fase 0 y antes de cada actualización). Opcional: probar en una VM/emulador con `-cpu` sin AVX2 (p. ej. Intel SDE).

### RNF-31 — Sistema operativo
- Windows 11 Pro 24H2 x64. Sin instalador MSI obligatorio; sin requerir privilegios de administrador para ejecutarse (sí para crear la regla de firewall y la tarea programada durante la instalación).

### RNF-32 — Navegador del Admin
- Microsoft Edge (Chromium) en la versión instalada en el POS. Uso de APIs estándar: `fetch`, `FormData`, `canvas.toBlob('image/webp')`, `createImageBitmap`, drag & drop HTML5. Sin dependencia de internet para actualizar Edge.

### RNF-33 — Navegadores de los clientes
- iOS Safari ≥ 15, Chrome Android ≥ 100, Samsung Internet ≥ 18, Firefox Android reciente (*Supuesto* razonable para 2026).
- Imágenes WebP (soportadas por todos los anteriores).
- Diseño responsive de 320 px a 1024 px de ancho.
- La Carta debe funcionar aunque JavaScript falle parcialmente: *Could* — renderizado inicial en el servidor (HTML con el menú en español) con mejora progresiva.

### RNF-34 — Convivencia con AxisPOS
- No usar puertos que use AxisPOS (comprobar en instalación con `netstat -ano | findstr LISTENING`).
- No acceder a archivos, bases de datos ni registros de AxisPOS.
- Proceso con prioridad **por debajo de lo normal** (`BelowNormal`) configurada en la tarea programada / al arrancar.
- Sin ventanas emergentes ni robo de foco: el `.exe` se ejecuta sin consola visible (`--windows-hide-console`) y nunca abre ventanas automáticamente salvo `--open-admin`.
- Escrituras en disco mínimas (logs con buffer, sin escritura continua).
- **Verificación:** jornada de prueba con AxisPOS en uso normal; el cajero no debe notar diferencias.

## 6. Usabilidad

### RNF-40 — Admin sin formación
- Interfaz en español, lenguaje del negocio ("Agotado", "Plato fuerte", "Tasa del día").
- Acciones frecuentes (agotado, tasa del día) accesibles desde la pantalla de inicio del Admin.
- Confirmación en acciones destructivas; "deshacer" en cambios de disponibilidad (*Could*).
- Objetivo: un encargado sin experiencia crea una categoría, un producto con foto y cambia una tasa en < 15 min con la guía rápida.

### RNF-41 — Carta táctil
- Objetivos táctiles ≥ 44×44 px, texto base ≥ 16 px, navegación de categorías al alcance del pulgar, sin zoom necesario.

### RNF-42 — Accesibilidad básica
- Contraste mínimo WCAG AA (4.5:1 en texto), `alt` en imágenes (nombre del producto), `lang` correcto en `<html>`, compatible con lectores de pantalla en lo básico.

### RNF-43 — Mensajes de error
- Errores del Admin en español claro con acción sugerida ("La tasa debe ser mayor que 0"). Errores técnicos solo en el log.

## 7. Mantenibilidad

### RNF-50 — Código
- TypeScript con `"strict": true`; ESM; formato con Prettier/Biome (*Supuesto*: Biome por ser un único binario rápido).
- Separación por capas: rutas → servicios → repositorios (DB). Lógica de dinero e i18n en `src/shared` con funciones puras.

### RNF-51 — Pruebas
- `bun test` con cobertura de: cálculo de precios y redondeo, fallback de idiomas, escape de cadena WIFI, control de acceso del Admin, migraciones, validaciones. Objetivo: ≥ 80 % de líneas en `src/shared` y `src/server/services`.

### RNF-52 — Migraciones
- Archivos SQL numerados (`src/server/db/migrations/001_init.sql`, …) embebidos en el `.exe`; tabla `schema_migrations`; se aplican en transacción al arrancar; copia de seguridad automática **antes** de migrar.

### RNF-53 — Dependencias mínimas
- Solo dependencias JavaScript puras (sin módulos nativos `.node`), para compilar en un único `.exe` sin problemas. Lista prevista: `hono` (opcional), `qrcode-generator` o `qrcode` (QR), `fflate` (zip de copias), `zod` (opcional).

### RNF-54 — Build reproducible
- `bun run build` produce `dist/MenuDigital.exe` en la máquina de desarrollo Windows; versión inyectada (`--define`) desde `package.json`; `bun.lock` versionado.

### RNF-55 — Diagnóstico
- Ver RF-55: logs rotados, pantalla de diagnóstico, `GET /api/health` con versión y uptime.
