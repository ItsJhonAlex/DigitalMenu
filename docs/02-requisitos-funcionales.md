# 02 — Requisitos funcionales

Formato: cada requisito tiene **ID**, **prioridad** (*Must / Should / Could / Won't*), **descripción** y **criterios de aceptación (CA)** verificables. Los criterios se redactan para poder convertirse en pruebas (`bun test` o pruebas manuales en el POS).

Índice por grupos:

| Rango | Grupo |
|-------|-------|
| RF-01 – RF-07 | Aplicación y acceso |
| RF-10 – RF-19 | Categorías y productos |
| RF-20 – RF-21 | Imágenes |
| RF-22 – RF-25 | Ofertas / combos |
| RF-26 – RF-29 | Monedas |
| RF-30 – RF-34 | Idiomas |
| RF-35 – RF-39 | Red y QR |
| RF-40 – RF-48 | Carta (cliente) |
| RF-50 – RF-55 | Copias, ajustes y operación |

---

## A. Aplicación y acceso

### RF-01 — Proceso único para Carta y Admin · *Must*
Un único ejecutable `MenuDigital.exe` sirve la Carta (`/`), el Admin (`/admin`), la API (`/api/*`) y las imágenes (`/img/*`) en un único puerto.

**CA:**
1. Al ejecutar `MenuDigital.exe` aparece **un solo** proceso `MenuDigital.exe` en el Administrador de tareas.
2. `GET http://<IP-LAN>:PUERTO/` devuelve la Carta (HTTP 200, `text/html`).
3. `GET http://localhost:PUERTO/admin` devuelve el Admin (HTTP 200).
4. No requiere instalar Node, Bun, .NET ni ningún runtime adicional en el POS.

### RF-02 — Admin restringido a localhost · *Must*
`/admin`, `/admin/*` y `/api/admin/*` solo responden a peticiones cuyo origen TCP sea la propia máquina (`127.0.0.1`, `::1`, `::ffff:127.0.0.1`) **y** cuyo encabezado `Host` sea `localhost:PUERTO` o `127.0.0.1:PUERTO`.

**CA:**
1. Desde un teléfono en la LAN, `GET http://<IP-LAN>:PUERTO/admin` devuelve **403** (o 404, ver ADR-08) sin revelar contenido del Admin.
2. Desde un teléfono, `POST http://<IP-LAN>:PUERTO/api/admin/products` devuelve 403 y no modifica la base de datos.
3. Desde el POS, `http://<IP-LAN>:PUERTO/admin` (usando la IP en vez de localhost) también es rechazado (control de `Host`).
4. Las peticiones de escritura (`POST/PUT/PATCH/DELETE`) con encabezado `Origin` distinto de `http://localhost:PUERTO` son rechazadas con 403 (protección CSRF / DNS rebinding).

### RF-03 — Apertura del Admin en Edge modo aplicación · *Must*
El Admin se abre con `msedge.exe --app=http://localhost:PUERTO/admin`, en una ventana sin barra de direcciones. Se proporciona un acceso directo "Menú Digital — Admin" en el escritorio. Además, `MenuDigital.exe --open-admin` lanza Edge con esos parámetros.

**CA:**
1. Doble clic en el acceso directo abre el Admin en ventana propia de Edge sin pestañas ni barra de direcciones.
2. Si el servidor no está corriendo, `MenuDigital.exe --open-admin` lo inicia y luego abre Edge.
3. Cerrar la ventana del Admin **no** detiene el servidor ni la Carta.

### RF-04 — Instancia única · *Must*
Solo puede haber un servidor escuchando en el puerto configurado.

**CA:**
1. Si se ejecuta `MenuDigital.exe` con el servidor ya activo, la segunda instancia detecta el puerto ocupado por DigitalMenu (vía `GET /api/health`), abre el Admin (si se pidió `--open-admin`) y termina con código 0.
2. Si el puerto está ocupado por **otro** programa, se registra el error en el log, se muestra un mensaje claro (`MessageBox` o log) y termina con código ≠ 0.

### RF-05 — Inicialización de la carpeta de datos · *Must*
En el primer arranque se crea la carpeta de datos (por defecto `C:\MenuDigital\data`) con `menu.db`, `images\`, `backups\` y `logs\`, se aplican las migraciones y se cargan datos iniciales (idiomas es/en, moneda base, categorías de ejemplo opcionales).

**CA:**
1. Con la carpeta inexistente, el primer arranque la crea y el Admin muestra la base vacía lista para usar.
2. Reemplazar el `.exe` por una versión nueva no borra ni altera los datos salvo por migraciones versionadas.
3. La ruta puede cambiarse con `--data <ruta>` o la variable de entorno `MENUDIGITAL_DATA`.

### RF-06 — Puerto configurable · *Must*
El puerto se define en `C:\MenuDigital\data\config.json` (`"port": 8080`) o con `--port`.

**CA:**
1. Cambiar el puerto y reiniciar hace que Carta y Admin escuchen en el nuevo puerto.
2. El Admin muestra el puerto actual y avisa que los QR deben reimprimirse si cambia.

### RF-07 — PIN opcional del Admin · *Should*
El Admin puede protegerse con un PIN numérico (4–8 dígitos), además de la restricción localhost.

**CA:**
1. Con PIN desactivado (valor por defecto) el Admin abre directamente.
2. Con PIN activado, el Admin pide el PIN; la sesión dura hasta cerrar Edge o 12 h.
3. El PIN se almacena con hash (`Bun.password.hash`, argon2id/bcrypt), nunca en claro.
4. Tras 5 intentos fallidos se bloquea 60 s.

---

## B. Categorías y productos

### RF-10 — Gestión de categorías · *Must*
Crear, editar y eliminar categorías (p. ej. Entrantes, Plato Fuerte, Postres, Cócteles, Bebidas, Artículos). Campos: nombre y descripción por idioma, icono/imagen opcional, visible.

**CA:**
1. Crear "Entrantes" con nombre en español es obligatorio; en inglés es opcional.
2. La categoría aparece en la Carta al guardar (sin reiniciar).
3. No se permiten dos categorías con el mismo nombre en español (comparación sin mayúsculas/acentos opcional → *Supuesto*: comparación exacta sin distinguir mayúsculas).

### RF-11 — Ordenar categorías · *Must*
El orden de las categorías se cambia arrastrando (drag & drop) o con botones ↑/↓.

**CA:**
1. Tras reordenar, la Carta muestra las categorías en el nuevo orden.
2. El orden persiste tras reiniciar (`sort_order`).
3. La reordenación se guarda en una sola petición (`PUT /api/admin/categories/order`) de forma transaccional.

### RF-12 — Visibilidad de categorías · *Should*
Una categoría puede ocultarse sin borrarse.

**CA:** Una categoría oculta y todos sus productos dejan de aparecer en la Carta, pero siguen en el Admin marcados como "Oculta".

### RF-13 — Eliminación segura de categorías · *Must*
**CA:**
1. No se puede eliminar una categoría con productos; el Admin ofrece mover los productos a otra categoría u ocultar la categoría.
2. La eliminación pide confirmación.

### RF-14 — Gestión de productos · *Must*
Campos: categoría, tipo, nombre y descripción por idioma, precio base, foto, disponible/agotado, visible, orden, etiquetas opcionales (p. ej. "picante", "vegetariano" — *Could*).

**CA:**
1. Crear un producto con categoría, tipo, nombre en español y precio base ≥ 0 es suficiente para guardarlo.
2. El precio base se introduce en la moneda base con hasta los decimales de dicha moneda y se guarda como entero en unidades menores (ver 06).
3. Editar un producto se refleja en la Carta en la siguiente carga/recarga.
4. Eliminar un producto que forma parte de una oferta muestra advertencia y lista las ofertas afectadas; no se permite eliminar mientras esté en una oferta activa (se puede ocultar).

### RF-15 — Tipos de producto · *Must*
Tipos: `comida`, `bebida`, `articulo` (cigarros, jabitas de nailon, etc.).

**CA:**
1. El tipo es obligatorio y se elige de una lista cerrada.
2. El Admin permite filtrar por tipo.
3. La Carta puede usar el tipo para el diseño (p. ej. icono) pero la agrupación principal es por categoría.

### RF-16 — Disponible / agotado rápido · *Must*
Cambiar el estado con un interruptor directamente en la lista de productos.

**CA:**
1. Un clic en el interruptor cambia el estado y se guarda sin abrir el formulario (`PATCH /api/admin/products/:id`).
2. En la Carta el producto agotado aparece marcado "Agotado" / "Sold out" (no se oculta) — ver RF-44.
3. Acción "Restablecer todo a disponible" para el inicio de la jornada (*Should*).

### RF-17 — Ordenar productos · *Must*
**CA:** Los productos se ordenan dentro de su categoría arrastrando o con ↑/↓; el orden persiste y se refleja en la Carta.

### RF-18 — Ocultar producto · *Should*
**CA:** Un producto con `visible = 0` no aparece en la Carta ni en `/api/menu`, pero sí en el Admin.

### RF-19 — Búsqueda y filtros en el Admin · *Should*
**CA:** Filtro por texto (nombre en español), categoría, tipo y estado (disponible/agotado/oculto); los resultados se actualizan al escribir (sin recargar).

---

## C. Imágenes

### RF-20 — Subida de imagen con compresión automática · *Must*
Al subir una foto (producto, oferta, categoría, logo), se comprime y redimensiona automáticamente.

**CA:**
1. Formatos aceptados: JPEG, PNG, WebP (y HEIC si Edge lo decodifica — *Could*).
2. Se generan dos variantes: **grande** (lado mayor 1000 px) y **miniatura** (lado mayor 400 px), en WebP con calidad ~0.75 (*Supuesto*: valores ajustables en ajustes).
3. Una foto de cámara de 4 MB queda en ≤ 150 KB (grande) y ≤ 40 KB (miniatura) en el caso típico.
4. El servidor rechaza archivos > 2 MB **después** de la compresión, o cuyo contenido (bytes mágicos) no sea una imagen válida → HTTP 413/415.
5. El nombre del archivo guardado es un hash de contenido (p. ej. `a1b2c3d4e5f6.webp`), nunca el nombre original.

> Implementación: la compresión se hace **en el Admin (Edge)** con `canvas`/`OffscreenCanvas` antes de subir, para no incluir librerías nativas en el `.exe` (ver ADR-07).

### RF-21 — Reemplazo y limpieza de imágenes · *Should*
**CA:**
1. Reemplazar la foto de un producto sustituye la referencia; la imagen anterior se borra si ya no la usa nadie.
2. Tarea de mantenimiento "Limpiar imágenes huérfanas" en Ajustes, que lista y borra archivos no referenciados.

---

## D. Ofertas / combos

### RF-22 — Gestión de ofertas · *Must*
Una oferta tiene nombre y descripción por idioma, foto, **precio especial** (en moneda base), visible, disponible, orden.

**CA:**
1. Crear la oferta "Combo Cuba Libre + Tostones" con precio especial guardado.
2. Las ofertas aparecen en una sección propia de la Carta ("Ofertas"), al inicio (posición definida por el diseño).
3. Las ofertas se ordenan como las categorías.

### RF-23 — Componentes de la oferta · *Must*
Una oferta incluye uno o más productos con cantidad.

**CA:**
1. Se pueden añadir productos existentes con cantidad ≥ 1; no se repite el mismo producto (se aumenta la cantidad).
2. La Carta muestra la lista de componentes traducidos ("2 × Cuba Libre, 1 × Tostones").
3. Una oferta sin componentes es válida solo si se marca como "oferta libre" (texto descriptivo). *Supuesto:* se permite, para promociones tipo "2x1 en cervezas" descritas en texto.

### RF-24 — Disponibilidad de la oferta · *Must*
**CA:**
1. Si cualquier producto componente está agotado u oculto, la oferta se muestra automáticamente como "Agotada".
2. El Admin puede marcar la oferta como agotada manualmente aunque sus componentes estén disponibles.

### RF-25 — Ahorro de la oferta · *Could*
**CA:** Si la suma de precios base de los componentes × cantidad es mayor que el precio especial, la Carta puede mostrar "Ahorra X" calculado en la moneda elegida. Activable por oferta.

---

## E. Monedas

### RF-26 — Moneda base · *Must*
Existe exactamente una moneda base (p. ej. CUP). Todos los precios se introducen en la moneda base.

**CA:**
1. Solo una moneda puede tener `is_base = 1` (restricción en BD).
2. Cambiar la moneda base exige confirmación y **no** convierte los precios automáticamente en la Fase 1 (*Supuesto*); se advierte claramente.

### RF-27 — Monedas y tasas de cambio · *Must*
El Admin permite añadir monedas (código ISO o propio, nombre, símbolo, decimales) y editar su tasa respecto a la moneda base.

**CA:**
1. Tasa expresada como "1 USD = 400 CUP" (`base_per_unit = 400`). *Ejemplo ilustrativo, no tasa real*.
2. Precio en USD = precio base / 400, redondeado según RF-28.
3. Cambiar la tasa actualiza los precios en la Carta en la siguiente carga, sin tocar los productos.
4. Una moneda puede desactivarse (no aparece en el selector de la Carta).
5. La tasa debe ser > 0; valores inválidos se rechazan con mensaje.

### RF-28 — Redondeo y formato · *Must*
**CA:**
1. Cada moneda define `decimals` (CUP: 0, USD: 2) y `rounding` (`none`, `up`, `nearest`) con un paso opcional (`round_step`, p. ej. 5 CUP o 0.50 USD).
2. El formato muestra el símbolo y separadores según la configuración (ej.: `1.250 CUP`, `$3.13`).
3. El cálculo se hace en un único módulo (`src/shared/money.ts`) compartido y probado por tests.

### RF-29 — Fecha de actualización de tasas · *Should*
**CA:** El Admin muestra "Tasa actualizada: hoy 10:32"; opcionalmente la Carta muestra "Tasa del día: 1 USD = 400 CUP" (configurable).

---

## F. Idiomas

### RF-30 — Gestión de idiomas · *Must*
Idiomas iniciales: español (`es`, obligatorio, no eliminable) e inglés (`en`). Se pueden añadir más (`fr`, `de`, `it`, `ru`, `zh`…).

**CA:**
1. Añadir un idioma con código BCP-47 corto y nombre nativo ("Français").
2. Un idioma puede activarse/desactivarse; solo los activos aparecen en la Carta.
3. `es` no puede desactivarse ni eliminarse.

### RF-31 — Traducciones de contenido · *Must*
Nombre y descripción de categorías, productos y ofertas se traducen por idioma.

**CA:**
1. El formulario de edición muestra pestañas por idioma (ES | EN | …).
2. Guardar con traducción vacía en un idioma no español es válido (se usará fallback).

### RF-32 — Fallback a español · *Must*
**CA:**
1. Si un elemento no tiene traducción en el idioma pedido, la API devuelve el texto en español y marca `"fallback": true` para ese campo/elemento.
2. Si se pide un idioma inexistente o inactivo, la API responde con el contenido en español (`"lang": "es"`).
3. La Carta nunca muestra campos vacíos por falta de traducción.

### RF-33 — Textos fijos de la interfaz de la Carta · *Must*
Textos como "Ofertas", "Agotado", "Idioma", "Moneda" se gestionan en diccionarios por idioma (`src/carta/i18n/es.json`, `en.json`) y, para idiomas añadidos desde el Admin, en la tabla `ui_strings` (*Should*).

**CA:** Al cambiar a inglés, todos los textos fijos aparecen en inglés; los que falten, en español.

### RF-34 — Indicador de traducciones faltantes · *Should*
**CA:** El Admin muestra, por idioma, el número de elementos sin traducir y un filtro "Sin traducir" en la lista de productos.

---

## G. Red y QR

### RF-35 — Configuración del wifi · *Must*
El Admin guarda SSID, contraseña, tipo de seguridad (`WPA` (incluye WPA2/WPA3-personal), `WEP`, `nopass`) y si la red es oculta.

**CA:**
1. Los datos se guardan en `settings` y se usan solo para generar el QR del wifi.
2. La contraseña se muestra oculta con botón "mostrar".

### RF-36 — Detección de IP · *Must*
El servidor detecta las IPv4 privadas de las interfaces activas (`os.networkInterfaces()`), descartando loopback, APIPA (169.254.x.x) y adaptadores virtuales conocidos.

**CA:**
1. El Admin muestra la IP detectada y la URL de la Carta (`http://192.168.1.50:8080/`).
2. Si hay varias IP candidatas, el administrador elige cuál usar para el QR y se guarda como `network.carta_ip`.

### RF-37 — Aviso de cambio de IP · *Must*
**CA:**
1. Al arrancar y cada 60 s, el servidor compara la IP actual con `network.carta_ip`.
2. Si la IP guardada ya no está presente en ninguna interfaz, el Admin muestra un **banner rojo** permanente: "La IP del equipo cambió de 192.168.1.50 a 192.168.1.73. Los QR impresos ya no funcionan. Configure la reserva de IP en el router o reimprima los QR."
3. El banner ofrece "Usar nueva IP y reimprimir QR" y un enlace a la guía de IP fija (ver 09).
4. El evento se registra en el log.

### RF-38 — Tarjeta QR imprimible · *Must*
Página `/admin/qr/card` con diseño de impresión (A6 o A5, *Supuesto*) que contiene:
- **QR 1 — Wifi**: cadena `WIFI:T:WPA;S:<ssid>;P:<password>;H:false;;` con escape de `\ ; , : "`.
- **QR 2 — Carta**: `http://<carta_ip>:<puerto>/`.
- Textos: nombre del restaurante, "1. Conéctate al wifi", "2. Abre la carta", SSID y contraseña en texto (opcional), versión en inglés.

**CA:**
1. Escanear QR 1 con Android (cámara/Google Lens) e iPhone (cámara iOS) ofrece unirse a la red.
2. Escanear QR 2 abre la Carta.
3. `Ctrl+P` imprime la tarjeta sin cabeceras del Admin (CSS `@media print`).
4. Los QR se generan localmente (sin internet), en SVG, con corrección de errores nivel M.

### RF-39 — Descarga de QR · *Should*
**CA:** Botones para descargar cada QR como SVG y PNG (PNG generado en el navegador desde el SVG).

---

## H. Carta (cliente)

### RF-40 — Visualización de la carta · *Must*
**CA:**
1. Muestra el nombre/logo del restaurante, la sección de ofertas (si hay) y las categorías visibles con sus productos visibles, en el orden configurado.
2. Cada producto muestra: foto (miniatura, carga diferida `loading="lazy"`), nombre, descripción, precio en la moneda seleccionada, estado agotado.
3. Las categorías sin productos visibles no se muestran.

### RF-41 — Navegación por categorías · *Must*
**CA:** Barra de categorías fija (sticky) con desplazamiento horizontal; tocar una categoría desplaza a su sección; la categoría actual se resalta al hacer scroll (*Should*).

### RF-42 — Selector de idioma · *Must*
**CA:**
1. El idioma inicial se elige así: parámetro `?lang=` → preferencia guardada (`localStorage`) → `navigator.language` si está activo → `es`.
2. Cambiar el idioma re-renderiza sin recargar la página completa (petición a `/api/menu?lang=xx`).
3. La preferencia se guarda en `localStorage`.

### RF-43 — Selector de moneda · *Must*
**CA:**
1. El selector lista las monedas activas; por defecto la moneda base (o la configurada como `carta.default_currency`).
2. Cambiar la moneda recalcula precios en el cliente con las tasas recibidas en `/api/menu` (sin nueva petición).
3. La preferencia se guarda en `localStorage`.
4. *Should:* opción de mostrar dos monedas a la vez (p. ej. `1.200 CUP · $3.00`).

### RF-44 — Productos agotados · *Must*
**CA:** Se muestran con indicador "Agotado" y estilo atenuado, al final de su categoría o en su posición (configurable, por defecto: en su posición).

### RF-45 — Sección de ofertas · *Must*
**CA:** Muestra precio especial, componentes y estado; si RF-25 está activo, el ahorro.

### RF-46 — Detalle de producto · *Should*
**CA:** Tocar un producto abre una vista ampliada con la imagen grande y la descripción completa; se cierra con botón o gesto atrás (History API).

### RF-47 — Contenido actualizado · *Must*
**CA:**
1. Una recarga de la Carta siempre muestra el contenido actual (respuesta de `/api/menu` con `Cache-Control: no-cache` y `ETag`).
2. *Could:* la Carta comprueba cada 5 min (`If-None-Match`) y actualiza si cambió.

### RF-48 — Búsqueda en la carta · *Could*
**CA:** Campo de búsqueda que filtra productos por nombre en el idioma actual, sin peticiones al servidor.

---

## I. Copias, ajustes y operación

### RF-50 — Copia de seguridad automática · *Must*
**CA:**
1. Al arrancar (si la última copia tiene > 24 h) y cada día a las 04:00 (si el equipo está encendido) se crea `backups\menu-AAAAMMDD-HHMM.db` mediante `VACUUM INTO`.
2. Se conservan las últimas 14 copias (configurable); las antiguas se borran.
3. Las imágenes no se duplican en cada copia diaria (se respaldan en la copia manual completa, RF-51).

### RF-51 — Copia manual / exportación · *Must*
**CA:** Botón "Exportar copia completa" que genera un `.zip` con `menu.db` + `images\` + `config.json` en `backups\` y lo ofrece para descargar (p. ej. a un USB).

### RF-52 — Restauración · *Should*
**CA:**
1. El Admin permite elegir una copia de `backups\` o subir un `.zip` exportado.
2. Antes de restaurar se crea una copia de seguridad del estado actual.
3. Tras restaurar, el servidor recarga la conexión a la BD sin reiniciar el proceso (o se reinicia solo).

### RF-53 — Ajustes generales · *Must*
Nombre del restaurante, logo, mensaje de bienvenida/pie (por idioma), moneda por defecto de la Carta, idioma por defecto, mostrar tasa en la Carta (sí/no), posición de agotados.

**CA:** Cada ajuste se guarda en `settings` y se refleja en la Carta en la siguiente carga.

### RF-54 — Vista previa de la carta · *Should*
**CA:** Botón "Ver carta" en el Admin abre `http://localhost:PUERTO/` en un marco con tamaño de móvil (≈ 390×844).

### RF-55 — Registro de eventos (logs) · *Must*
**CA:**
1. Errores y eventos clave (arranque, parada, cambio de IP, copias, restauraciones) se escriben en `logs\menudigital-AAAAMMDD.log`.
2. Rotación diaria; se conservan 30 días.
3. El Admin muestra las últimas 200 líneas en Ajustes → Diagnóstico, junto con versión, RAM del proceso (`process.memoryUsage().rss`), uptime, ruta de datos.

---

## Matriz de trazabilidad (resumen)

| Objetivo | Requisitos |
|----------|-----------|
| OBJ-1 (QR → carta) | RF-35–RF-39, RF-40–RF-47 |
| OBJ-2 (edición fácil) | RF-10–RF-29, RF-16 |
| OBJ-3 (no afectar AxisPOS) | RF-01, RF-04, RF-06, RNF-01–RNF-05 |
| OBJ-4 (offline) | RF-38 (QR local), RNF-10–RNF-12 |
| OBJ-5 (moneda/idioma) | RF-26–RF-34, RF-42, RF-43 |
| OBJ-6 (instalación simple) | RF-05, RF-50–RF-52, documento 09 |
