# DigitalMenu

Carta digital **local** (sin internet) para restaurante. Un único `MenuDigital.exe` sirve la carta (`/`) y el admin (`/admin`) desde el PC del POS.

Documentación completa en [`docs/`](docs/README.md).

## Requisitos de desarrollo

- Windows + [Bun](https://bun.sh) **1.4.3+**
- Git

## Inicio rápido

```powershell
bun install
bun run dev          # http://localhost:8080 (carta) y /admin
bun test
bun run typecheck
bun run lint
```

Datos de desarrollo en `./data` (creada al arrancar; está en `.gitignore`).

## Scripts

| Comando | Descripción |
|---------|-------------|
| `bun run dev` | Servidor con `--watch` y `--dev` |
| `bun run start` | Servidor sin watch |
| `bun test` | Pruebas |
| `bun run typecheck` | TypeScript strict |
| `bun run lint` | Biome |
| `bun run build` | Web + `MenuDigital.exe` (target baseline) |

## Estructura

```
src/
  shared/   # money, i18n, wifi, tipos API (servidor + navegador)
  server/   # Bun.serve + Hono + SQLite
  admin/    # Panel (Edge --app, solo localhost)
  carta/    # Menú para teléfonos en la LAN
```

Prototipo visual de referencia: `design/` (no forma parte del build).
