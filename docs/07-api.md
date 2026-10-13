# 07 — API HTTP

## 1. Convenciones

| Aspecto | Regla |
|---------|-------|
| Base | `http://<host>:PUERTO` (por defecto `8080`) |
| Formato | JSON UTF-8 (`Content-Type: application/json; charset=utf-8`), salvo subida de imágenes (`multipart/form-data`) y QR (`image/svg+xml`) |
| Ámbitos | **Público** (`/api/menu`, `/api/health`): LAN, solo `GET/HEAD`. **Admin** (`/api/admin/*`): solo localhost (IP + `Host` + `Origin`, RNF-20) |
| Nombres | Campos en `camelCase` en JSON; columnas en `snake_case` en BD |
| Precios | Enteros en **unidades menores de la moneda base** (`priceMinor`). La conversión a otras monedas se hace con `src/shared/money.ts` |
| Ids | Enteros (`id`) salvo monedas (`code`) e idiomas (`code`) |
| Traducciones | Objeto por idioma: `"i18n": { "es": { "name": "…", "description": "…" }, "en": { … } }`. `es.name` obligatorio |
| Fechas | ISO-8601 UTC |
| Caché | `/api/menu` con `ETag` + `Cache-Control: no-cache`; `/api/admin/*` con `Cache-Control: no-store` |
| Versionado | Sin prefijo de versión en la Fase 1 (cliente y servidor se distribuyen juntos en el mismo `.exe`) |

### Formato de error

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "El nombre en español es obligatorio",
    "details": [{ "field": "i18n.es.name", "issue": "required" }]
  }
}
```

| HTTP | `code` | Cuándo |
|------|--------|--------|
| 400 | `VALIDATION_ERROR` | Datos inválidos |
| 401 | `PIN_REQUIRED` | PIN activo y sin sesión (RF-07) |
| 403 | `FORBIDDEN` | No es localhost / Origin inválido (cuerpo mínimo, sin detalles) |
| 404 | `NOT_FOUND` | Recurso inexistente |
| 405 | `METHOD_NOT_ALLOWED` | Método no permitido en ruta pública |
| 409 | `CONFLICT` | Categoría con productos, producto en oferta, moneda base, etc. |
| 413 | `PAYLOAD_TOO_LARGE` | Imagen > 2 MB |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | Archivo no es imagen válida |
| 429 | `TOO_MANY_ATTEMPTS` | PIN bloqueado temporalmente |
| 500 | `INTERNAL_ERROR` | Error inesperado (detalle solo en el log) |

## 2. Resumen de endpoints

### Público (LAN)

| Método | Ruta | Descripción | RF |
|--------|------|-------------|----|
| GET | `/` | HTML de la Carta | RF-40 |
| GET | `/assets/*` | JS/CSS/fuentes de la Carta (embebidos) | RNF-06 |
| GET | `/img/:name` | Imagen (`<hash>.webp` o `<hash>_t.webp`) | RF-20 |
| GET | `/api/menu?lang=es` | Menú completo traducido + monedas | RF-40–45 |
| GET | `/api/health` | Estado del servicio | RF-04 |

### Admin (solo localhost)

> Nota de implementación: las rutas literales (`/categories/order`, `/offers/order`, `/products/reset-availability`) se registran **antes** que las rutas con parámetro (`/:id`) para que el enrutador no las confunda.

| Método | Ruta | Descripción | RF |
|--------|------|-------------|----|
| GET | `/admin`, `/admin/*` | SPA del Admin | — |
| GET | `/admin/qr/card` | Tarjeta QR imprimible (HTML) | RF-38 |
| POST | `/api/admin/session` | Iniciar sesión con PIN (si activo) | RF-07 |
| GET | `/api/admin/categories` | Listar categorías (todas, con traducciones) | RF-10 |
| POST | `/api/admin/categories` | Crear | RF-10 |
| GET | `/api/admin/categories/:id` | Detalle | RF-10 |
| PUT | `/api/admin/categories/:id` | Reemplazar | RF-10 |
| PATCH | `/api/admin/categories/:id` | Cambio parcial (`visible`) | RF-12 |
| DELETE | `/api/admin/categories/:id` | Eliminar (409 si tiene productos) | RF-13 |
| PUT | `/api/admin/categories/order` | Reordenar | RF-11 |
| GET | `/api/admin/products?categoryId=&type=&status=&q=&untranslated=en` | Listar/filtrar | RF-19 |
| POST | `/api/admin/products` | Crear | RF-14 |
| GET | `/api/admin/products/:id` | Detalle | RF-14 |
| PUT | `/api/admin/products/:id` | Reemplazar | RF-14 |
| PATCH | `/api/admin/products/:id` | Parcial (`available`, `visible`, `priceMinor`) | RF-16 |
| DELETE | `/api/admin/products/:id` | Eliminar (409 si está en ofertas) | RF-14 |
| PUT | `/api/admin/categories/:id/products/order` | Reordenar productos de una categoría | RF-17 |
| POST | `/api/admin/products/reset-availability` | Marcar todo disponible | RF-16 |
| GET/POST | `/api/admin/offers` | Listar / crear ofertas | RF-22 |
| GET/PUT/PATCH/DELETE | `/api/admin/offers/:id` | Detalle / editar / parcial / eliminar | RF-22–24 |
| PUT | `/api/admin/offers/order` | Reordenar ofertas | RF-22 |
| POST | `/api/admin/images` | Subir imagen (multipart) | RF-20 |
| GET | `/api/admin/images/orphans` | Listar huérfanas | RF-21 |
| DELETE | `/api/admin/images/orphans` | Borrar huérfanas | RF-21 |
| GET/POST | `/api/admin/currencies` | Listar / crear moneda | RF-27 |
| PUT/PATCH/DELETE | `/api/admin/currencies/:code` | Editar / tasa / eliminar | RF-27–29 |
| POST | `/api/admin/currencies/:code/make-base` | Cambiar moneda base | RF-26 |
| GET/POST | `/api/admin/languages` | Listar / añadir idioma | RF-30 |
| PATCH/DELETE | `/api/admin/languages/:code` | Activar/desactivar / eliminar | RF-30 |
| GET | `/api/admin/translations/status` | Progreso por idioma | RF-34 |
| GET | `/api/admin/translations?lang=en&entity=product` | Tabla para traducción masiva | RF-31 |
| PUT | `/api/admin/translations` | Guardado masivo | RF-31 |
| GET/PUT | `/api/admin/ui-strings?lang=fr` | Textos fijos de la Carta | RF-33 |
| GET/PUT | `/api/admin/settings` | Ajustes generales | RF-53 |
| GET | `/api/admin/network` | IPs, IP guardada, estado de cambio | RF-36–37 |
| PUT | `/api/admin/network` | Elegir IP para la carta | RF-36–37 |
| GET/PUT | `/api/admin/wifi` | Datos del wifi | RF-35 |
| GET | `/api/admin/qr/wifi.svg` | QR del wifi | RF-38–39 |
| GET | `/api/admin/qr/carta.svg` | QR de la URL de la carta | RF-38–39 |
| GET | `/api/admin/backups` | Listar copias | RF-50 |
| POST | `/api/admin/backups` | Crear copia (`{"kind":"db"\|"full"}`) | RF-50–51 |
| GET | `/api/admin/backups/:file` | Descargar copia | RF-51 |
| POST | `/api/admin/backups/restore` | Restaurar (archivo existente o subido) | RF-52 |
| GET | `/api/admin/diagnostics` | Versión, RAM, uptime, rutas, log | RF-55 |

---

## 3. API pública

### 3.1 `GET /api/health`

```json
{ "app": "DigitalMenu", "version": "0.1.0", "uptimeSec": 3612, "time": "2026-10-13T16:46:00Z" }
```

### 3.2 `GET /api/menu?lang=en`

Parámetros:

| Parámetro | Obligatorio | Descripción |
|-----------|-------------|-------------|
| `lang` | No | Código de idioma. Si falta, es inválido o está inactivo → `carta.default_lang` → `es` |

Cabeceras de respuesta: `ETag: "m-42-en"`, `Cache-Control: no-cache`, `Content-Language: en`. Con `If-None-Match` coincidente → **304** sin cuerpo.

Respuesta 200 (ejemplo, tasas ilustrativas):

```json
{
  "version": 42,
  "lang": "en",
  "requestedLang": "en",
  "languages": [
    { "code": "es", "nativeName": "Español" },
    { "code": "en", "nativeName": "English" }
  ],
  "currency": {
    "base": "CUP",
    "default": "CUP",
    "second": "USD",
    "showRate": true,
    "list": [
      { "code": "CUP", "symbol": "CUP", "decimals": 0, "basePerUnit": 1,   "rounding": "nearest", "roundStep": 5,   "symbolPosition": "after",  "isBase": true },
      { "code": "USD", "symbol": "$",   "decimals": 2, "basePerUnit": 400, "rounding": "up",      "roundStep": 0.5, "symbolPosition": "before", "isBase": false, "rateUpdatedAt": "2026-10-13T13:32:00Z" }
    ]
  },
  "restaurant": {
    "name": "Paladar La Esquina",
    "logo": "/img/ab12cd34ef56ab78.webp",
    "welcome": "Welcome",
    "footer": "Prices include taxes"
  },
  "ui": { "offers": "Offers", "soldOut": "Sold out", "language": "Language", "currency": "Currency", "rateOfDay": "Today's rate", "save": "Save" },
  "offers": [
    {
      "id": 3,
      "name": "Cuba Libre Combo",
      "description": "Perfect for two",
      "priceMinor": 2400,
      "regularMinor": 2900,
      "showSavings": true,
      "available": true,
      "image": { "thumb": "/img/1c2d3e4f5a6b7c8d_t.webp", "large": "/img/1c2d3e4f5a6b7c8d.webp" },
      "items": [
        { "productId": 21, "name": "Cuba Libre", "quantity": 2 },
        { "productId": 5,  "name": "Stuffed tostones", "quantity": 1 }
      ],
      "fallback": false
    }
  ],
  "categories": [
    {
      "id": 1,
      "name": "Starters",
      "description": null,
      "fallback": false,
      "products": [
        {
          "id": 5,
          "type": "comida",
          "name": "Stuffed tostones",
          "description": "Green plantain filled with…",
          "priceMinor": 850,
          "available": true,
          "image": { "thumb": "/img/9f2c1e7ab34d5e61_t.webp", "large": "/img/9f2c1e7ab34d5e61.webp" },
          "fallback": false
        },
        {
          "id": 6,
          "type": "comida",
          "name": "Croquetas de jamón",
          "description": "Croquetas caseras",
          "priceMinor": 600,
          "available": false,
          "image": null,
          "fallback": true
        }
      ]
    },
    {
      "id": 6,
      "name": "Items",
      "description": null,
      "fallback": false,
      "products": [
        { "id": 40, "type": "articulo", "name": "Nylon bag", "description": null, "priceMinor": 50, "available": true, "image": null, "fallback": false }
      ]
    }
  ]
}
```

Notas:
- `fallback: true` indica que ese elemento se muestra en español por falta de traducción (RF-32).
- Solo se incluyen categorías visibles con al menos un producto visible; productos visibles; ofertas visibles. `available` de ofertas es la disponibilidad **efectiva** (RF-24).
- Nunca incluye datos de wifi, IP, PIN ni rutas de disco (RNF-24).
- Conversión en el cliente: `USD = 850 / 400 = 2.125 → redondeo "up" a 0.5 → $2.50`.

### 3.3 `GET /img/:name`
- `name` debe cumplir `^[a-f0-9]{16}(_t)?\.webp$` (y `jpg|png` si se aceptaran originales). Si no → 404.
- `Content-Type: image/webp`, `Cache-Control: public, max-age=31536000, immutable`, `X-Content-Type-Options: nosniff`.

---

## 4. API de administración (ejemplos)

> Todas las peticiones de escritura deben llevar `Origin: http://localhost:PUERTO` (el navegador lo añade automáticamente desde el Admin).

### 4.1 Categorías

**Crear** — `POST /api/admin/categories`

```json
{
  "visible": true,
  "image": null,
  "i18n": {
    "es": { "name": "Cócteles", "description": "Clásicos cubanos" },
    "en": { "name": "Cocktails", "description": "Cuban classics" }
  }
}
```

Respuesta **201**:

```json
{
  "id": 4,
  "sortOrder": 40,
  "visible": true,
  "image": null,
  "productCount": 0,
  "i18n": {
    "es": { "name": "Cócteles", "description": "Clásicos cubanos" },
    "en": { "name": "Cocktails", "description": "Cuban classics" }
  },
  "createdAt": "2026-10-13T16:50:00.000Z",
  "updatedAt": "2026-10-13T16:50:00.000Z"
}
```

**Reordenar** — `PUT /api/admin/categories/order`

```json
{ "ids": [2, 1, 4, 3] }
```

Respuesta **200**: `{ "ok": true }`. Valida que `ids` contenga **todas** las categorías exactamente una vez; si no → 400.

**Eliminar con productos** — `DELETE /api/admin/categories/1` → **409**:

```json
{ "error": { "code": "CONFLICT", "message": "La categoría tiene 8 productos. Muévalos u oculte la categoría.", "details": [{ "productCount": 8 }] } }
```

### 4.2 Productos

**Crear** — `POST /api/admin/products`

```json
{
  "categoryId": 4,
  "type": "bebida",
  "priceMinor": 1200,
  "image": "3a4b5c6d7e8f9a0b",
  "available": true,
  "visible": true,
  "i18n": {
    "es": { "name": "Mojito", "description": "Ron blanco, hierbabuena, lima y soda" },
    "en": { "name": "Mojito", "description": "White rum, mint, lime and soda" }
  }
}
```

Respuesta **201**: el producto completo con `id`, `sortOrder` (al final de su categoría), `createdAt`, `updatedAt`.

Validaciones:

| Campo | Regla |
|-------|-------|
| `categoryId` | Existe |
| `type` | `comida` \| `bebida` \| `articulo` |
| `priceMinor` | Entero 0 … 1.000.000.000 |
| `image` | `null` o hash existente en `data\images` |
| `i18n.es.name` | 1–80 caracteres (obligatorio) |
| `i18n.*.description` | ≤ 500 |
| `i18n.<lang>` | Solo idiomas existentes |

**Cambiar disponibilidad** — `PATCH /api/admin/products/21`

```json
{ "available": false }
```

Respuesta **200**: `{ "id": 21, "available": false, "updatedAt": "2026-10-13T17:02:11.120Z" }`

**Listar con filtros** — `GET /api/admin/products?categoryId=4&status=soldout&untranslated=en`

```json
{
  "items": [
    {
      "id": 21, "categoryId": 4, "type": "bebida", "priceMinor": 1200,
      "image": "3a4b5c6d7e8f9a0b", "available": false, "visible": true, "sortOrder": 10,
      "i18n": { "es": { "name": "Mojito", "description": "…" } },
      "missingLangs": ["en"],
      "inOffers": [3]
    }
  ],
  "total": 1
}
```

**Eliminar producto en oferta** — `DELETE /api/admin/products/21` → **409** con `details: [{ "offers": [3] }]`.

### 4.3 Imágenes

**Subir** — `POST /api/admin/images` (`multipart/form-data`)

| Parte | Tipo | Descripción |
|-------|------|-------------|
| `large` | archivo `image/webp` | Variante 1000 px (comprimida en el navegador) |
| `thumb` | archivo `image/webp` | Variante 400 px |

Respuesta **201**:

```json
{ "image": "3a4b5c6d7e8f9a0b", "large": "/img/3a4b5c6d7e8f9a0b.webp", "thumb": "/img/3a4b5c6d7e8f9a0b_t.webp", "bytes": { "large": 98213, "thumb": 27110 }, "deduplicated": false }
```

Errores: 413 (> 2 MB), 415 (no es WebP/JPEG/PNG válido).

> El hash se calcula sobre la variante `large`. La imagen no queda asociada a nada hasta que se guarda el producto/oferta/categoría; si nunca se asocia, la limpieza de huérfanas la elimina (RF-21).

**Huérfanas** — `GET /api/admin/images/orphans` → `{ "items": ["aa11bb22cc33dd44"], "bytes": 125301 }`; `DELETE` → `{ "deleted": 1 }`.

### 4.4 Ofertas

**Crear** — `POST /api/admin/offers`

```json
{
  "priceMinor": 2400,
  "image": "1c2d3e4f5a6b7c8d",
  "available": true,
  "visible": true,
  "showSavings": true,
  "items": [
    { "productId": 21, "quantity": 2 },
    { "productId": 5,  "quantity": 1 }
  ],
  "i18n": {
    "es": { "name": "Combo Cuba Libre", "description": "Ideal para dos" },
    "en": { "name": "Cuba Libre Combo", "description": "Perfect for two" }
  }
}
```

Respuesta **201**:

```json
{
  "id": 3, "priceMinor": 2400, "regularMinor": 2900, "savingsMinor": 500,
  "available": true, "effectiveAvailable": true, "visible": true, "showSavings": true, "sortOrder": 30,
  "items": [ { "productId": 21, "quantity": 2, "sortOrder": 0 }, { "productId": 5, "quantity": 1, "sortOrder": 1 } ],
  "i18n": { "es": { "name": "Combo Cuba Libre", "description": "Ideal para dos" }, "en": { "name": "Cuba Libre Combo", "description": "Perfect for two" } }
}
```

Validación: `productId` sin duplicados, existentes; `quantity` 1–99.

### 4.5 Monedas

**Listar** — `GET /api/admin/currencies`

```json
{
  "items": [
    { "code": "CUP", "name": "Peso cubano", "symbol": "CUP", "decimals": 0, "isBase": true, "basePerUnit": 1, "rounding": "nearest", "roundStep": 5, "symbolPosition": "after", "active": true, "sortOrder": 0, "rateUpdatedAt": null },
    { "code": "USD", "name": "Dólar EE. UU.", "symbol": "$", "decimals": 2, "isBase": false, "basePerUnit": 400, "rounding": "up", "roundStep": 0.5, "symbolPosition": "before", "active": true, "sortOrder": 1, "rateUpdatedAt": "2026-10-13T13:32:00Z" }
  ]
}
```

**Actualizar tasa del día** — `PATCH /api/admin/currencies/USD`

```json
{ "basePerUnit": 410 }
```

Respuesta **200**: `{ "code": "USD", "basePerUnit": 410, "rateUpdatedAt": "2026-10-13T17:10:00Z" }` — `rateUpdatedAt` se fija automáticamente.

**Crear** — `POST /api/admin/currencies`

```json
{ "code": "EUR", "name": "Euro", "symbol": "€", "decimals": 2, "basePerUnit": 430, "rounding": "nearest", "roundStep": 0.1, "symbolPosition": "before", "active": true }
```

**Cambiar base** — `POST /api/admin/currencies/USD/make-base`

```json
{ "confirm": true }
```

Respuesta **200** con advertencia: `{ "ok": true, "warning": "Los precios NO se han convertido. Revise los precios de todos los productos." }` (RF-26). Sin `confirm: true` → 400. La tasa de la nueva base pasa a 1; *Supuesto:* las demás tasas se recalculan relativas a la nueva base (`basePerUnit_nueva = basePerUnit_vieja / basePerUnit_de_la_nueva_base`).

Eliminar la moneda base → **409**.

### 4.6 Idiomas y traducciones

**Añadir idioma** — `POST /api/admin/languages`

```json
{ "code": "fr", "nativeName": "Français", "active": true }
```

**Estado de traducción** — `GET /api/admin/translations/status`

```json
{
  "items": [
    { "lang": "es", "total": 45, "translated": 45 },
    { "lang": "en", "total": 45, "translated": 42, "missing": { "category": 0, "product": 3, "offer": 0 } },
    { "lang": "fr", "total": 45, "translated": 0 }
  ]
}
```

**Guardado masivo** — `PUT /api/admin/translations`

```json
{
  "lang": "en",
  "items": [
    { "entity": "product", "entityId": 6, "name": "Ham croquettes", "description": "Homemade croquettes" },
    { "entity": "product", "entityId": 7, "name": "", "description": null }
  ]
}
```

Un `name` vacío **elimina** la traducción de ese idioma (vuelve a fallback). Para `lang = "es"` no se permite `name` vacío.

### 4.7 Ajustes

`GET /api/admin/settings` → objeto con todas las claves editables (excepto `admin.pin_hash`, que nunca se devuelve; se expone `"admin.pinEnabled": true|false`).

`PUT /api/admin/settings`

```json
{
  "carta.restaurant_name": "Paladar La Esquina",
  "carta.welcome": { "es": "¡Bienvenidos!", "en": "Welcome!" },
  "carta.default_currency": "CUP",
  "carta.second_currency": "USD",
  "carta.show_rate": true,
  "admin.pin": "4821"
}
```

`admin.pin` (texto) se convierte en `admin.pin_hash` con `Bun.password.hash`; `"admin.pin": null` lo desactiva. Claves desconocidas → 400.

### 4.8 Red, wifi y QR

**Estado de red** — `GET /api/admin/network`

```json
{
  "port": 8080,
  "savedIp": "192.168.1.50",
  "ipChanged": false,
  "candidates": [
    { "interface": "Wi-Fi", "address": "192.168.1.50", "mac": "00-1a-2b-3c-4d-5e", "recommended": true },
    { "interface": "Ethernet 2", "address": "192.168.56.1", "mac": "0a-00-27-00-00-0c", "recommended": false }
  ],
  "cartaUrl": "http://192.168.1.50:8080/",
  "checkedAt": "2026-10-13T16:59:00Z"
}
```

Con cambio detectado: `"ipChanged": true, "previousIp": "192.168.1.50", "currentIp": "192.168.1.73"`.

**Elegir IP** — `PUT /api/admin/network` → `{ "cartaIp": "192.168.1.73" }` → 200 y `ipChanged = false`.

**Wifi** — `PUT /api/admin/wifi`

```json
{ "ssid": "Restaurante-Clientes", "password": "Mojito2026!", "security": "WPA", "hidden": false }
```

Validación: `ssid` 1–32 bytes; `password` 8–63 caracteres para WPA, vacío si `nopass`.

**QR** — `GET /api/admin/qr/wifi.svg?size=300` → `image/svg+xml` que codifica `WIFI:T:WPA;S:Restaurante-Clientes;P:Mojito2026!;H:false;;`.
`GET /api/admin/qr/carta.svg?size=300` → codifica `http://192.168.1.50:8080/`.
Si falta configurar el wifi → 409 `{"error":{"code":"CONFLICT","message":"Configure el wifi primero"}}`.

### 4.9 Copias de seguridad

`GET /api/admin/backups`

```json
{
  "items": [
    { "file": "menu-20261013-0400.db", "kind": "db", "bytes": 512000, "createdAt": "2026-10-13T08:00:00Z" },
    { "file": "full-20261012-1830.zip", "kind": "full", "bytes": 28311552, "createdAt": "2026-10-12T22:30:00Z" }
  ],
  "lastAutoAt": "2026-10-13T08:00:00Z",
  "keepDaily": 14
}
```

`POST /api/admin/backups` `{ "kind": "full" }` → **201** `{ "file": "full-20261013-1712.zip", "bytes": 29001234 }`.

`GET /api/admin/backups/full-20261013-1712.zip` → descarga (`Content-Disposition: attachment`). El nombre debe cumplir `^(menu|full|pre-[a-z0-9-]+)-\d{8}-\d{4}\.(db|zip)$`.

`POST /api/admin/backups/restore` — JSON `{ "file": "menu-20261013-0400.db", "confirm": true }` o `multipart` con `file` (.zip/.db). Respuesta `{ "ok": true, "safetyBackup": "pre-restore-20261013-1715.db" }`.

### 4.10 Diagnóstico

`GET /api/admin/diagnostics`

```json
{
  "version": "0.1.0",
  "bunVersion": "1.4.3",
  "dataDir": "C:\\MenuDigital\\data",
  "port": 8080,
  "uptimeSec": 86400,
  "memory": { "rssMB": 58.2, "heapUsedMB": 12.4 },
  "dbBytes": 512000,
  "imagesBytes": 23400000,
  "schemaVersion": 2,
  "logTail": ["2026-10-13T08:00:00Z INFO backup created menu-20261013-0400.db"]
}
```

---

## 5. Contratos TypeScript (extracto de `src/shared/api-types.ts`)

```ts
export type Lang = string; // "es", "en", ...
export type ProductType = "comida" | "bebida" | "articulo";
export interface I18nText { name: string; description?: string | null }
export type I18nMap = Record<Lang, I18nText>; // "es" obligatorio

export interface CurrencyDTO {
  code: string; symbol: string; decimals: number; basePerUnit: number;
  rounding: "none" | "up" | "nearest"; roundStep: number | null;
  symbolPosition: "before" | "after"; isBase: boolean; rateUpdatedAt?: string | null;
}

export interface MenuProduct {
  id: number; type: ProductType; name: string; description: string | null;
  priceMinor: number; available: boolean;
  image: { thumb: string; large: string } | null; fallback: boolean;
}

export interface MenuOffer {
  id: number; name: string; description: string | null;
  priceMinor: number; regularMinor: number | null; showSavings: boolean; available: boolean;
  image: { thumb: string; large: string } | null;
  items: { productId: number; name: string; quantity: number }[]; fallback: boolean;
}

export interface MenuResponse {
  version: number; lang: Lang; requestedLang: Lang | null;
  languages: { code: Lang; nativeName: string }[];
  currency: { base: string; default: string; second: string | null; showRate: boolean; list: CurrencyDTO[] };
  restaurant: { name: string; logo: string | null; welcome: string | null; footer: string | null };
  ui: Record<string, string>;
  offers: MenuOffer[];
  categories: { id: number; name: string; description: string | null; fallback: boolean; products: MenuProduct[] }[];
}
```
