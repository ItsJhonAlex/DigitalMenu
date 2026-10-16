# Plantillas de importación (carta)

Use este CSV o exporte desde el Admin (`Exportar carta` → Excel/CSV): la hoja **products** ya incluye las columnas nuevas y la hoja **ayuda** lista los códigos de alérgenos.

## Columnas de `products` (opcionales al final)

| Columna | Contenido |
|---------|-----------|
| `ingredientes_es` | Texto libre, separados por comas |
| `ingredientes_en` | Igual en inglés (si vacío, la carta muestra el ES) |
| `alergenos` | Códigos UE separados por comas, sin espacios obligatorios |

Un archivo antiguo **sin** esas tres columnas sigue importando; no borra ingredientes/alérgenos ya guardados.

## Códigos de `alergenos` (14 de la UE)

| Código | ES | EN |
|--------|----|----|
| `gluten` | Gluten | Gluten |
| `crustaceos` | Crustáceos | Crustaceans |
| `huevo` | Huevo | Eggs |
| `pescado` | Pescado | Fish |
| `cacahuete` | Cacahuete | Peanuts |
| `soja` | Soja | Soybeans |
| `lacteos` | Lácteos | Milk |
| `frutos_cascara` | Frutos de cáscara | Tree nuts |
| `apio` | Apio | Celery |
| `mostaza` | Mostaza | Mustard |
| `sesamo` | Sésamo | Sesame |
| `sulfitos` | Sulfitos | Sulphites |
| `altramuces` | Altramuces | Lupin |
| `moluscos` | Moluscos | Molluscs |

Ejemplo: `gluten,lacteos,frutos_cascara`

Cualquier otro código hace fallar esa fila en el preview de importación.
