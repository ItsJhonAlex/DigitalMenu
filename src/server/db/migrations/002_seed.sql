-- Migración 002: datos iniciales (docs/06 §5)
INSERT INTO languages (code, native_name, active, sort_order) VALUES
  ('es', 'Español', 1, 0),
  ('en', 'English', 1, 1);

INSERT INTO currencies (
  code, name, symbol, decimals, is_base, base_per_unit,
  rounding, round_step, symbol_position, active, sort_order
) VALUES
  ('CUP', 'Peso cubano',   'CUP', 0, 1, 1,   'nearest', 5,   'after',  1, 0),
  ('USD', 'Dólar EE. UU.', '$',   2, 0, 400, 'up',      0.5, 'before', 1, 1);

INSERT INTO settings (key, value) VALUES
  ('carta.restaurant_name', '"Mi Restaurante"'),
  ('carta.default_lang', '"es"'),
  ('carta.default_currency', '"CUP"'),
  ('carta.show_rate', 'true'),
  ('carta.second_currency', 'null'),
  ('carta.soldout_position', '"inline"'),
  ('wifi.security', '"WPA"'),
  ('wifi.hidden', 'false'),
  ('images.quality', '0.75'),
  ('images.max_large', '1000'),
  ('images.max_thumb', '400');

-- Categorías de ejemplo (vacías) para el primer arranque
INSERT INTO categories (sort_order, visible) VALUES
  (10, 1),
  (20, 1),
  (30, 1),
  (40, 1),
  (50, 1),
  (60, 1);

INSERT INTO translations (entity, entity_id, lang, name, description) VALUES
  ('category', 1, 'es', 'Entrantes', NULL),
  ('category', 1, 'en', 'Starters', NULL),
  ('category', 2, 'es', 'Plato Fuerte', NULL),
  ('category', 2, 'en', 'Main Courses', NULL),
  ('category', 3, 'es', 'Postres', NULL),
  ('category', 3, 'en', 'Desserts', NULL),
  ('category', 4, 'es', 'Cócteles', NULL),
  ('category', 4, 'en', 'Cocktails', NULL),
  ('category', 5, 'es', 'Bebidas', NULL),
  ('category', 5, 'en', 'Drinks', NULL),
  ('category', 6, 'es', 'Artículos', NULL),
  ('category', 6, 'en', 'Items', NULL);
