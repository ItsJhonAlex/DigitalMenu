# DigitalMenu (Menú Digital) — Documentación de desarrollo

**Proyecto:** DigitalMenu / Menú Digital para restaurante
**Autor:** Jhon Alex — AvanzaInTime
**Estado del documento:** Borrador v1.0 (13-oct-2026)
**Idioma de la documentación:** Español

## ¿Qué es DigitalMenu?

DigitalMenu es una aplicación **local** (sin internet) que se ejecuta en el PC del punto de venta (POS) del restaurante y ofrece:

- **Carta** (`/`): menú digital de solo lectura que los clientes abren en su teléfono escaneando un QR, conectados al **wifi local** del restaurante.
- **Admin** (`/admin`): panel de administración accesible **solo desde el propio PC del POS** (localhost), abierto en Microsoft Edge en modo aplicación.

Todo corre en **un único proceso**: `MenuDigital.exe`, compilado con Bun (TypeScript) para CPUs sin AVX2, con base de datos SQLite y las imágenes guardadas fuera del ejecutable (`C:\MenuDigital\data`).

## Índice

| # | Documento | Contenido |
|---|-----------|-----------|
| 01 | [Visión y alcance](01-vision-y-alcance.md) | Problema, objetivos, usuarios, alcance de la Fase 1 y exclusiones |
| 02 | [Requisitos funcionales](02-requisitos-funcionales.md) | RF-xx con criterios de aceptación |
| 03 | [Requisitos no funcionales](03-requisitos-no-funcionales.md) | RNF-xx: rendimiento, memoria, offline, seguridad, compatibilidad, usabilidad, mantenibilidad |
| 04 | [Funciones y pantallas](04-funciones-y-pantallas.md) | Pantallas de Admin y Carta en detalle, flujos de usuario |
| 05 | [Arquitectura](05-arquitectura.md) | Diagramas, modelo de procesos, estructura de carpetas, carpeta de datos |
| 06 | [Modelo de datos](06-modelo-de-datos.md) | Tablas SQLite, columnas, tipos, restricciones, diagrama ER |
| 07 | [API](07-api.md) | Endpoints, ejemplos JSON de petición/respuesta |
| 08 | [Hoja de ruta](08-roadmap.md) | Fases, hitos y tareas |
| 09 | [Despliegue y operación](09-despliegue-y-operacion.md) | Build, instalación en el POS, autoarranque, copias de seguridad, actualizaciones, IP fija |
| 10 | [Glosario y decisiones](10-glosario-y-decisiones.md) | Glosario y registro de decisiones (ADR) |

## Datos clave (resumen)

| Aspecto | Decisión |
|---------|----------|
| Red | Solo wifi local del restaurante. El PC del POS **no tiene internet**. |
| PC objetivo | Windows 11 Pro 24H2 64 bits, Intel i3-3110M (2012, **sin AVX2**), 4 GB RAM, Edge instalado, AxisPOS en paralelo |
| Consumo objetivo | ~50–80 MB de RAM para `MenuDigital.exe` |
| Lenguaje / runtime | TypeScript + Bun (sin Tauri, sin Rust, sin Electron) |
| Build | `bun build --compile --target=bun-windows-x64-baseline` → `MenuDigital.exe` |
| Servidor HTTP | `Bun.serve` (con Hono como opción para el enrutado) |
| Base de datos | `bun:sqlite` → `C:\MenuDigital\data\menu.db` |
| Admin | `msedge --app=http://localhost:PUERTO/admin`, restringido a localhost |
| Carta | HTML/CSS ligero, sin frameworks pesados, abierta a la LAN, solo lectura |
| Idiomas | es + en al inicio, ampliable; respaldo (fallback) a español |
| Monedas | Precio base por producto; otras monedas calculadas por tasas editables (p. ej. CUP, USD) |
| Diseño | Diseño único hecho con IA de diseño e integrado en el código. **Sin sistema de plantillas** |
| QR | Tarjeta imprimible con 2 QR: unirse al wifi (`WIFI:`) y URL de la carta |

## Convenciones de esta documentación

- **RF-xx**: requisito funcional. **RNF-xx**: requisito no funcional. **ADR-xx**: registro de decisión de arquitectura.
- **Supuesto** (marcado como `> **Supuesto:**`): algo que no fue acordado explícitamente y debe validarse.
- **Prioridad** en requisitos: *Must* (imprescindible Fase 1), *Should* (deseable Fase 1), *Could* (si hay tiempo), *Won't* (fuera de Fase 1).
- `PUERTO` = puerto HTTP configurado (por defecto `8080`, ver supuesto en [09](09-despliegue-y-operacion.md)).
- Rutas Windows con `\`; rutas del repositorio con `/`.

## Inicio rápido para desarrolladores

```powershell
git clone <repo> DigitalMenu
cd DigitalMenu
bun install
bun run dev          # servidor en http://localhost:8080 (carta) y /admin
bun test             # pruebas
bun run build        # genera dist\MenuDigital.exe (target baseline)
```

Ver detalles en [05-arquitectura.md](05-arquitectura.md) y [09-despliegue-y-operacion.md](09-despliegue-y-operacion.md).

## Supuestos globales

> **Supuesto:** El puerto por defecto será `8080` y será configurable. Se debe verificar que AxisPOS no lo usa (`netstat -ano`).
>
> **Supuesto:** El router del restaurante permite reservar una IP por MAC (reserva DHCP) para el PC del POS.
>
> **Supuesto:** La moneda base inicial es **CUP** y las tasas se expresan como "cuántos CUP vale 1 unidad de la otra moneda". Es configurable.
>
> **Supuesto:** Bun 1.4.3 (instalado en la máquina de desarrollo) mantiene el soporte de `--target=bun-windows-x64-baseline`, `--windows-hide-console` y `--windows-icon`. Se valida en la Fase 0 (ver [08](08-roadmap.md)).
