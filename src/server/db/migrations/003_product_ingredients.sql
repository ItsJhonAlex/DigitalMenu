-- Ingredientes (texto libre ES/EN) y alérgenos UE (JSON de códigos) en products.
ALTER TABLE products ADD COLUMN ingredients_es TEXT;
ALTER TABLE products ADD COLUMN ingredients_en TEXT;
ALTER TABLE products ADD COLUMN allergens TEXT;
