-- Migración 001: esquema inicial (docs/06)
CREATE TABLE IF NOT EXISTS schema_migrations (
  version    INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE languages (
  code        TEXT PRIMARY KEY CHECK (length(code) BETWEEN 2 AND 10),
  native_name TEXT NOT NULL,
  active      INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE categories (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  visible    INTEGER NOT NULL DEFAULT 1 CHECK (visible IN (0,1)),
  image      TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE products (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  type        TEXT NOT NULL CHECK (type IN ('comida','bebida','articulo')),
  price_minor INTEGER NOT NULL CHECK (price_minor BETWEEN 0 AND 1000000000),
  image       TEXT,
  available   INTEGER NOT NULL DEFAULT 1 CHECK (available IN (0,1)),
  visible     INTEGER NOT NULL DEFAULT 1 CHECK (visible IN (0,1)),
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_products_category_order ON products(category_id, sort_order);

CREATE TABLE offers (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  price_minor  INTEGER NOT NULL CHECK (price_minor BETWEEN 0 AND 1000000000),
  image        TEXT,
  available    INTEGER NOT NULL DEFAULT 1 CHECK (available IN (0,1)),
  visible      INTEGER NOT NULL DEFAULT 1 CHECK (visible IN (0,1)),
  show_savings INTEGER NOT NULL DEFAULT 0 CHECK (show_savings IN (0,1)),
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE offer_items (
  offer_id   INTEGER NOT NULL REFERENCES offers(id)   ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity   INTEGER NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 99),
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (offer_id, product_id)
);
CREATE INDEX idx_offer_items_product ON offer_items(product_id);

CREATE TABLE translations (
  entity      TEXT NOT NULL CHECK (entity IN ('category','product','offer')),
  entity_id   INTEGER NOT NULL,
  lang        TEXT NOT NULL REFERENCES languages(code) ON DELETE CASCADE,
  name        TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
  description TEXT CHECK (description IS NULL OR length(description) <= 500),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (entity, entity_id, lang)
);
CREATE INDEX idx_translations_lang ON translations(lang, entity);

CREATE TABLE currencies (
  code            TEXT PRIMARY KEY CHECK (length(code) BETWEEN 2 AND 8),
  name            TEXT NOT NULL,
  symbol          TEXT NOT NULL,
  decimals        INTEGER NOT NULL DEFAULT 2 CHECK (decimals BETWEEN 0 AND 4),
  is_base         INTEGER NOT NULL DEFAULT 0 CHECK (is_base IN (0,1)),
  base_per_unit   REAL NOT NULL DEFAULT 1 CHECK (base_per_unit > 0),
  rounding        TEXT NOT NULL DEFAULT 'nearest' CHECK (rounding IN ('none','up','nearest')),
  round_step      REAL CHECK (round_step IS NULL OR round_step > 0),
  symbol_position TEXT NOT NULL DEFAULT 'before' CHECK (symbol_position IN ('before','after')),
  active          INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  sort_order      INTEGER NOT NULL DEFAULT 0,
  rate_updated_at TEXT
);
CREATE UNIQUE INDEX ux_currencies_single_base ON currencies(is_base) WHERE is_base = 1;

CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL CHECK (json_valid(value)),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE ui_strings (
  key   TEXT NOT NULL,
  lang  TEXT NOT NULL REFERENCES languages(code) ON DELETE CASCADE,
  value TEXT NOT NULL CHECK (length(value) <= 200),
  PRIMARY KEY (key, lang)
);

-- Integridad de translations (polimórfica)
CREATE TRIGGER trg_categories_del AFTER DELETE ON categories BEGIN
  DELETE FROM translations WHERE entity = 'category' AND entity_id = OLD.id;
END;
CREATE TRIGGER trg_products_del AFTER DELETE ON products BEGIN
  DELETE FROM translations WHERE entity = 'product' AND entity_id = OLD.id;
END;
CREATE TRIGGER trg_offers_del AFTER DELETE ON offers BEGIN
  DELETE FROM translations WHERE entity = 'offer' AND entity_id = OLD.id;
END;

-- Protección del idioma español
CREATE TRIGGER trg_languages_protect_es_del BEFORE DELETE ON languages
WHEN OLD.code = 'es' BEGIN
  SELECT RAISE(ABORT, 'No se puede eliminar el idioma es');
END;
CREATE TRIGGER trg_languages_protect_es_upd BEFORE UPDATE OF active ON languages
WHEN OLD.code = 'es' AND NEW.active = 0 BEGIN
  SELECT RAISE(ABORT, 'No se puede desactivar el idioma es');
END;

-- Moneda base: tasa 1 y activa
CREATE TRIGGER trg_currencies_base_ins BEFORE INSERT ON currencies
WHEN NEW.is_base = 1 AND (NEW.base_per_unit <> 1 OR NEW.active = 0) BEGIN
  SELECT RAISE(ABORT, 'La moneda base debe tener tasa 1 y estar activa');
END;
CREATE TRIGGER trg_currencies_base_upd BEFORE UPDATE ON currencies
WHEN NEW.is_base = 1 AND (NEW.base_per_unit <> 1 OR NEW.active = 0) BEGIN
  SELECT RAISE(ABORT, 'La moneda base debe tener tasa 1 y estar activa');
END;
