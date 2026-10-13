# 10 — Glosario y registro de decisiones (ADR)

## 1. Glosario

| Término | Definición |
|---------|------------|
| **Admin** | Panel de administración en `/admin`, accesible solo desde el PC del POS (localhost) |
| **ADR** | *Architecture Decision Record*: registro de una decisión técnica con contexto, alternativas y consecuencias |
| **Agotado** | Producto con `available = 0`: se muestra en la Carta marcado, no se oculta |
| **AP isolation / aislamiento de clientes** | Función del router que impide que los dispositivos wifi se vean entre sí; debe estar desactivada para que los teléfonos lleguen al POS |
| **Artículo** | Tipo de producto no alimenticio: cigarros, jabitas de nailon, etc. |
| **AVX2** | Extensión de instrucciones de CPU (Intel Haswell, 2013+). El i3-3110M (Ivy Bridge, 2012) **no** la tiene |
| **AxisPOS** | Software de punto de venta ya instalado en el PC del restaurante; DigitalMenu no interactúa con él |
| **Baseline (target)** | Variante del runtime de Bun compilada sin AVX2, para CPUs antiguas (`bun-windows-x64-baseline`) |
| **Bun** | Runtime de JavaScript/TypeScript con servidor HTTP, SQLite, test runner y compilador a ejecutable integrados |
| **Carta** | Menú público para los clientes en `/` |
| **Categoría** | Agrupación ordenable de productos (Entrantes, Plato Fuerte, Cócteles…) |
| **Combo / Oferta** | Conjunto de productos con precio especial |
| **CSRF** | Ataque en el que una página ajena provoca peticiones de escritura; se mitiga comprobando `Origin` |
| **DHCP / reserva DHCP** | Asignación automática de IPs por el router; la reserva fija siempre la misma IP a una MAC |
| **DNS rebinding** | Ataque que usa un dominio que resuelve a `127.0.0.1` para saltarse la política de mismo origen; se mitiga comprobando `Host` |
| **Edge modo app** | `msedge --app=URL`: ventana de Edge sin pestañas ni barra de direcciones, parece una aplicación |
| **ETag / 304** | Mecanismo HTTP para no reenviar contenido que no ha cambiado |
| **Fallback** | Uso del texto en español cuando falta la traducción |
| **Hono** | Micro-framework HTTP para TypeScript, compatible con `Bun.serve` |
| **Huérfana (imagen)** | Archivo de imagen no referenciado por ningún elemento |
| **LAN** | Red local del restaurante (wifi + cable) |
| **Moneda base** | Moneda en la que se introducen todos los precios (p. ej. CUP) |
| **POS** | *Point of Sale*: el PC de caja del restaurante |
| **QR WIFI** | Código QR con el formato `WIFI:T:<tipo>;S:<ssid>;P:<clave>;H:<oculta>;;` que los teléfonos usan para unirse a una red |
| **RSS / Working Set** | Memoria física usada por un proceso |
| **SQLite / WAL** | Base de datos en un archivo; WAL (*Write-Ahead Logging*) mejora concurrencia y resistencia a cortes |
| **Tasa (de cambio)** | `basePerUnit`: cuántas unidades de la moneda base vale 1 unidad de otra moneda |
| **Unidades menores** | Representación entera de un precio (céntimos); evita errores de coma flotante |
| **`VACUUM INTO`** | Comando SQLite que crea una copia consistente de la BD en caliente |
| **WebP** | Formato de imagen comprimido, soportado por todos los navegadores móviles actuales |

---

## 2. Registro de decisiones

Formato: **Estado** (Aceptada / Propuesta / Reemplazada) · **Contexto** · **Decisión** · **Alternativas** · **Consecuencias**.

| ADR | Título | Estado |
|-----|--------|--------|
| ADR-01 | Bun + TypeScript en lugar de Tauri, Electron o Go | Aceptada |
| ADR-02 | Compilar con target `bun-windows-x64-baseline` | Aceptada |
| ADR-03 | Admin en Edge modo aplicación | Aceptada |
| ADR-04 | `Bun.serve` + Hono como servidor | Aceptada (Hono revisable en F0) |
| ADR-05 | SQLite (`bun:sqlite`) con datos fuera del ejecutable | Aceptada |
| ADR-06 | Diseño único integrado, sin sistema de plantillas | Aceptada |
| ADR-07 | Compresión de imágenes en el navegador del Admin | Aceptada |
| ADR-08 | Admin restringido a localhost en el mismo proceso | Aceptada |
| ADR-09 | Sin frameworks pesados de frontend | Aceptada |
| ADR-10 | HTTP sin TLS en la LAN | Aceptada |
| ADR-11 | Precios enteros en moneda base; conversión en el cliente | Aceptada |
| ADR-12 | Tabla de traducciones genérica con fallback a español | Aceptada |
| ADR-13 | Un proceso, un puerto para Carta y Admin | Aceptada |
| ADR-14 | Autoarranque con el Programador de tareas | Aceptada |
| ADR-15 | IP fija (reserva DHCP) + detección de cambios, en lugar de mDNS | Aceptada |

---

### ADR-01 — Bun + TypeScript en lugar de Tauri, Electron o Go
**Estado:** Aceptada.

**Contexto:** se necesita un servidor HTTP local para la LAN, una UI de administración y una carta web, en un PC antiguo (4 GB, sin AVX2) donde corre AxisPOS, con distribución en un único ejecutable y sin internet. El desarrollador trabaja en TypeScript.

**Decisión:** TypeScript sobre **Bun**, compilado con `bun build --compile` a `MenuDigital.exe`. La UI del Admin la proporciona el **Edge ya instalado** (ADR-03).

**Alternativas evaluadas:**

| Opción | A favor | En contra | Veredicto |
|--------|---------|-----------|-----------|
| **Tauri** | Ejecutable pequeño, usa WebView2 | Requiere **Rust** y su toolchain (acordado: sin Rust); el servidor LAN para la carta habría que escribirlo igualmente en Rust; la ventana WebView2 consume RAM similar a Edge; más complejidad de build | Descartado |
| **Electron** | Ecosistema maduro | Empaqueta Chromium + Node: 150–300 MB de RAM y >100 MB de disco; excesivo para 4 GB con AxisPOS | Descartado |
| **Go** | Binario muy pequeño, RAM muy baja (~10–25 MB), compatibilidad amplia de CPU | Otro lenguaje distinto del frontend (no se comparte código de precios/i18n/tipos); menor productividad para el desarrollador | Descartado (alternativa de respaldo si Bun no cumpliera RNF-02/RNF-30) |
| **Node.js + SEA/pkg** | Muy estable | `pkg` abandonado; SEA más laborioso; SQLite requiere módulo nativo (`better-sqlite3`) o `node:sqlite` reciente | Descartado |
| **Bun** | Un solo lenguaje y repositorio; `Bun.serve`, `bun:sqlite`, `bun test` y `--compile` integrados; target baseline para CPUs sin AVX2; código compartido servidor/navegador | Ejecutable más grande (~60–110 MB en disco); RAM mayor que Go (estimado 35–70 MB) | **Elegido** |

**Consecuencias:**
- Se acepta un consumo de RAM mayor que Go a cambio de productividad y código compartido, **dentro** del objetivo de 50–80 MB (a confirmar en F0).
- Riesgo: compatibilidad de Bun en Windows/baseline → mitigado con la prueba F0.3 en el POS real.

### ADR-02 — Target `bun-windows-x64-baseline`
**Estado:** Aceptada.

**Contexto:** el i3-3110M (Ivy Bridge, 2012) soporta SSE4.2 y AVX, pero **no AVX2**. El build estándar de Bun para Windows x64 asume AVX2 y en esta CPU puede terminar con "instrucción ilegal".

**Decisión:** todo build de distribución usa `--target=bun-windows-x64-baseline`. El script de build lo fija y no hay otra forma documentada de generar el `.exe`.

**Alternativas:** build estándar (incompatible); cambiar el PC (fuera de alcance).

**Consecuencias:** rendimiento ligeramente inferior en algunas operaciones (irrelevante para esta carga); obligación de probar cada versión en el POS real o en un entorno sin AVX2.

### ADR-03 — Admin en Edge modo aplicación
**Estado:** Aceptada.

**Contexto:** el Admin necesita una interfaz rica (formularios, drag & drop, subida y compresión de imágenes) pero no se quiere empaquetar un motor web (Electron/Tauri). Edge ya está instalado en Windows 11.

**Decisión:** el Admin es una web servida por el propio servidor y se abre con `msedge.exe --app=http://localhost:PUERTO/admin`, mediante un acceso directo que ejecuta `MenuDigital.exe --open-admin`.

**Alternativas:** ventana nativa (WebView2 vía Tauri/C# → más dependencias); pestaña normal del navegador (funciona, pero menos "aplicación" y más riesgo de cerrar/confundir); UI de consola (inviable para usuarios).

**Consecuencias:**
- Coste cero de distribución; Edge se actualiza con Windows Update (cuando haya conexión) o permanece en su versión: se usan solo APIs estándar.
- Edge consume RAM solo mientras el Admin está abierto; se recomienda cerrarlo tras usarlo.
- El servidor es independiente de la ventana (cerrarla no detiene la carta).

### ADR-04 — `Bun.serve` + Hono
**Estado:** Aceptada (revisable en F0).

**Contexto:** se necesitan ~50 rutas, middlewares (guardia localhost, cabeceras, PIN, errores) y validación.

**Decisión:** `Bun.serve` como servidor y **Hono** como enrutador/middlewares (`fetch: app.fetch`, `getConnInfo` de `hono/bun` para la IP remota).

**Alternativas:** `Bun.serve` puro con su objeto `routes` (cero dependencias; menos estructura para middlewares — opción válida si Hono diera problemas al compilar); Express/Fastify (más pesados, pensados para Node).

**Consecuencias:** una dependencia pequeña y pura JS; los handlers son testeables con `app.request()` sin abrir puertos.

### ADR-05 — SQLite con `bun:sqlite`, datos fuera del ejecutable
**Estado:** Aceptada.

**Contexto:** datos pequeños (cientos de filas), un único escritor (Admin), muchos lectores; sin servidor de BD; necesidad de copias simples.

**Decisión:** SQLite mediante `bun:sqlite` (integrado, sin módulo nativo adicional), modo WAL, archivo `C:\MenuDigital\data\menu.db`; imágenes en `data\images`. Nada de datos dentro del `.exe`.

**Alternativas:** JSON en disco (sin transacciones ni integridad, riesgo con cortes de luz); PostgreSQL/MySQL (servicio extra, RAM, complejidad); `better-sqlite3` (módulo nativo, complica el ejecutable único).

**Consecuencias:** copias con `VACUUM INTO`; actualizar = reemplazar el `.exe`; migraciones versionadas obligatorias.

### ADR-06 — Diseño único integrado, sin sistema de plantillas
**Estado:** Aceptada.

**Contexto:** la carta tendrá un único diseño, creado una vez por Jhon Alex con una IA de diseño. Un sistema de plantillas/temas intercambiables añadiría motor de plantillas, almacenamiento de temas, validación y UI de selección.

**Decisión:** el HTML/CSS generado se integra **directamente** en `src/carta` y se compila en el `.exe`. Los datos se inyectan con `render.ts` sobre una API estable (`/api/menu`). Cambiar el diseño = nueva versión del `.exe`.

**Alternativas:** temas seleccionables desde el Admin; motor de plantillas (Handlebars/Liquid) con archivos editables en `data\`.

**Consecuencias:** menos código, menos superficie de errores y mejor rendimiento; los ajustes visuales menores (nombre, logo, textos) siguen editables vía `settings`; cualquier rediseño requiere al desarrollador.

### ADR-07 — Compresión de imágenes en el navegador del Admin
**Estado:** Aceptada.

**Contexto:** las fotos (de móvil, 3–8 MB) deben comprimirse automáticamente. Librerías de servidor como `sharp` dependen de binarios nativos (libvips), difíciles de incluir en un `.exe` único compilado con Bun, y el procesamiento consumiría RAM/CPU en el PC compartido con AxisPOS.

**Decisión:** el Admin (Edge) redimensiona y codifica a **WebP** con `createImageBitmap` + `canvas`/`OffscreenCanvas` (`toBlob('image/webp', 0.75)`), generando 1000 px y 400 px. El servidor solo **valida** (tamaño, bytes mágicos), calcula el hash y guarda.

**Alternativas:** `sharp` en el servidor (nativo, pesado); librería WASM de compresión en el servidor (más RAM y tamaño del `.exe`); sin compresión (carta lenta, RNF-07 incumplido).

**Consecuencias:** cero dependencias nativas; picos de CPU solo durante la edición, en el proceso de Edge. Limitación: la compresión depende de que el Admin se use desde Edge (que es el único caso, ADR-08). Los metadatos EXIF (ubicación) se eliminan automáticamente al re-codificar; la orientación EXIF la respeta `createImageBitmap` (`imageOrientation: "from-image"`).

### ADR-08 — Admin restringido a localhost en el mismo proceso
**Estado:** Aceptada.

**Contexto:** el Admin no debe ser accesible por los clientes del wifi. Se evaluó usar dos puertos (uno escuchando solo en `127.0.0.1`).

**Decisión:** un único servidor en `0.0.0.0:PUERTO` con guardia por **IP remota loopback + `Host` + `Origin`** (RNF-20). Respuesta **403** genérica (se prefiere 403 a 404 para facilitar el diagnóstico al instalador; no revela contenido).

**Alternativas:** segundo servidor en `127.0.0.1:PUERTO2` solo para Admin (aislamiento a nivel de socket, más robusto; pero dos puertos y configuración doble). Se mantiene como **alternativa** si una auditoría lo exige; el diseño de rutas lo permite sin cambios grandes.

**Consecuencias:** cualquiera con acceso físico al POS puede usar el Admin (mitigado con PIN opcional RF-07).

### ADR-09 — Sin frameworks pesados de frontend
**Estado:** Aceptada.

**Contexto:** la Carta debe pesar ≤ 60 KB y cargar en < 2 s en teléfonos variados; el Admin corre en un PC modesto.

**Decisión:** HTML + CSS + TypeScript con DOM nativo. Se permite, si el Admin lo necesita, una micro-librería ≤ 10 KB (p. ej. Preact o lit-html), nunca React/Angular/Vue completos ni librerías de UI. Validación de servidor con funciones propias o `zod` (evaluar peso; solo en servidor).

**Consecuencias:** más código manual en el Admin (componentes propios simples); máximo rendimiento y control.

### ADR-10 — HTTP sin TLS en la LAN
**Estado:** Aceptada.

**Contexto:** HTTPS en una IP local requiere un certificado autofirmado que los teléfonos de los clientes no confían (advertencias de seguridad). La Carta es pública y de solo lectura; el Admin solo se usa por loopback.

**Decisión:** HTTP plano. La contraseña del wifi nunca viaja por la LAN (solo en Admin/localhost).

**Consecuencias:** algunas APIs del navegador que exigen contexto seguro (Service Workers, portapapeles) no estarán disponibles en la Carta; no se necesitan en la Fase 1. `localhost` sí es contexto seguro para el Admin.

### ADR-11 — Precios enteros en moneda base; conversión en el cliente
**Estado:** Aceptada.

**Contexto:** precios en varias monedas cuyas tasas cambian con frecuencia (CUP/USD).

**Decisión:** cada producto/oferta tiene **un** precio base entero (`price_minor`). Las monedas tienen `base_per_unit`, decimales y regla de redondeo. `/api/menu` envía precios base + tasas; la Carta convierte con `src/shared/money.ts` (el mismo código que usa el Admin para la vista previa).

**Alternativas:** precio por moneda en cada producto (más trabajo de mantenimiento, desincronización); conversión en el servidor por petición (cambio de moneda requeriría nueva petición).

**Consecuencias:** cambiar la tasa del día = 1 campo; cambio de moneda instantáneo en el teléfono; cambiar la moneda base requiere revisar precios (RF-26).

### ADR-12 — Tabla de traducciones genérica con fallback a español
**Estado:** Aceptada.

**Contexto:** idiomas ampliables sin cambiar el esquema; varios tipos de elementos traducibles.

**Decisión:** tabla `translations(entity, entity_id, lang, name, description)`, con `es` obligatorio y fallback a `es` en la API (bandera `fallback`). Integridad con triggers de borrado.

**Alternativas:** columnas por idioma (`name_es`, `name_en`: requiere migración por idioma); JSON por fila (difícil de consultar/validar).

**Consecuencias:** añadir un idioma es un `INSERT` en `languages`; consultas con `LEFT JOIN` + `COALESCE`.

### ADR-13 — Un proceso, un puerto para Carta y Admin
**Estado:** Aceptada.

**Decisión:** un único `MenuDigital.exe` sirve todo. Simplifica instalación, firewall, actualizaciones y consumo (una sola instancia del runtime).

**Consecuencias:** un fallo del proceso afecta a ambas pantallas → mitigado con reinicio automático de la tarea programada.

### ADR-14 — Autoarranque con el Programador de tareas
**Estado:** Aceptada.

**Contexto:** el servidor debe arrancar con Windows, reiniciarse si falla y no competir con AxisPOS.

**Decisión:** tarea programada "al iniciar sesión" del usuario del POS, prioridad 7 (por debajo de lo normal), sin límite de tiempo de ejecución, reinicio cada minuto si falla (09 §3.2).

**Alternativas:** carpeta Inicio (sin reinicio); servicio de Windows con NSSM/WinSW (herramienta extra, sesión 0, permisos); clave `Run` del registro (sin reinicio).

**Consecuencias:** depende de que se inicie sesión en el POS (situación normal). Si en el futuro se necesita sin sesión, se cambiará a disparador "al iniciar el sistema".

### ADR-15 — IP fija por reserva DHCP + detección de cambios, en lugar de mDNS
**Estado:** Aceptada.

**Contexto:** los QR impresos codifican la URL. Un nombre `.local` (mDNS) no funciona de forma fiable en muchos Android y routers; DNS local requiere configurar el router.

**Decisión:** URL por IP; recomendar reserva DHCP (o IP estática); el servidor vigila la IP cada 60 s y avisa en el Admin si cambia (RF-37), ofreciendo reimprimir los QR.

**Consecuencias:** dependencia de una configuración del router durante la instalación (documentada en 09 §6); riesgo residual mitigado por el aviso.

---

## 3. Supuestos pendientes de validar (consolidado)

| # | Supuesto | Dónde se valida |
|---|----------|-----------------|
| S-01 | Puerto por defecto 8080 libre y no usado por AxisPOS | F0.9 |
| S-02 | El router permite reserva DHCP y desactivar aislamiento de clientes | F0.7 |
| S-03 | Moneda base inicial CUP; tasa expresada como "1 USD = X CUP" | Con el restaurante |
| S-04 | Bun 1.4.3 soporta `--target=bun-windows-x64-baseline`, `--windows-hide-console`, `--windows-icon` | F0.2 |
| S-05 | RSS de Bun en reposo ~35–60 MB en el POS | F0.4 |
| S-06 | Método de embebido de assets (`with { type: "file" }` o `Bun.embeddedFiles`) | F0.10 |
| S-07 | Edge del POS codifica WebP con `canvas.toBlob` | F0.11 |
| S-08 | No se distinguen roles en el Admin (PIN opcional) | Con el restaurante |
| S-09 | Tarjeta QR en A6/A5 | Con el restaurante |
| S-10 | Cambio de moneda base no convierte precios en Fase 1 | Con el restaurante |
| S-11 | El POS inicia sesión de usuario al encenderse | F6.3 |
| S-12 | Navegadores mínimos de clientes (iOS 15+, Chrome Android 100+) | F3.9 |
| S-13 | Biome como formateador/linter | F1.1 |
| S-14 | Calendario con inicio 19-oct-2026 | Planificación |
