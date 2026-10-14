/**
 * Exportar / importar carta (CSV o XLSX). Fotos fuera (solo zip completo RF-51).
 * Matching por id estable; preview antes de aplicar; backup pre-import.
 */
import type { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Repos } from "../db/repos";
import { ensureBackupsDir, preImportBackupFileName, vacuumInto } from "./backup";
import {
  type Sheet,
  buildXlsx,
  parseCsv,
  parseCsvZip,
  parseXlsx,
  sheetsToCsvZip,
  toCsv,
} from "./spreadsheet";

export type CatalogIoFormat = "xlsx" | "csvzip" | "csv";

export type ImportChange = {
  sheet: string;
  action: "create" | "update";
  id: number | null;
  label: string;
};

export type ImportIssue = {
  sheet: string;
  row: number;
  message: string;
};

export type ImportPreview = {
  creates: ImportChange[];
  updates: ImportChange[];
  errors: ImportIssue[];
  /** Payload opaco para apply (JSON serializable). */
  plan: ImportPlan;
};

type CategoryPlan = {
  action: "create" | "update";
  id: number | null;
  sort_order: number;
  visible: boolean;
  image: string | null;
  i18n: Record<string, { name: string; description: string | null }>;
  label: string;
  row: number;
};

type ProductPlan = {
  action: "create" | "update";
  id: number | null;
  category_id: number;
  type: "comida" | "bebida" | "articulo";
  price_minor: number;
  available: boolean;
  visible: boolean;
  sort_order: number;
  image: string | null;
  i18n: Record<string, { name: string; description: string | null }>;
  label: string;
  row: number;
};

export type ImportPlan = {
  categories: CategoryPlan[];
  products: ProductPlan[];
};

const CAT_HEADERS = [
  "id",
  "sort_order",
  "visible",
  "image",
  "name_es",
  "description_es",
  "name_en",
  "description_en",
] as const;

const PROD_HEADERS = [
  "id",
  "category_id",
  "type",
  "price_minor",
  "available",
  "visible",
  "sort_order",
  "image",
  "name_es",
  "description_es",
  "name_en",
  "description_en",
] as const;

const TR_HEADERS = ["entity", "entity_id", "lang", "name", "description"] as const;

function boolCell(v: string | undefined, fallback: boolean): boolean {
  if (v == null || v.trim() === "") return fallback;
  const s = v.trim().toLowerCase();
  if (["1", "true", "yes", "si", "sí", "y"].includes(s)) return true;
  if (["0", "false", "no", "n"].includes(s)) return false;
  return fallback;
}

function intCell(v: string | undefined, fallback: number | null = null): number | null {
  if (v == null || v.trim() === "") return fallback;
  const n = Number(v.trim());
  return Number.isInteger(n) ? n : null;
}

function headerIndex(header: string[], name: string): number {
  return header.findIndex((h) => h.trim().toLowerCase() === name.toLowerCase());
}

function rowMap(header: string[], row: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  header.forEach((h, i) => {
    out[h.trim().toLowerCase()] = row[i] ?? "";
  });
  return out;
}

function sheetByName(sheets: Sheet[], ...names: string[]): Sheet | undefined {
  const lower = names.map((n) => n.toLowerCase());
  return sheets.find((s) => lower.includes(s.name.toLowerCase()));
}

export function buildCatalogSheets(repos: Repos): Sheet[] {
  const catRows: string[][] = [[...CAT_HEADERS]];
  for (const c of repos.categories.list()) {
    const es = repos.translations.get("category", c.id, "es");
    const en = repos.translations.get("category", c.id, "en");
    catRows.push([
      String(c.id),
      String(c.sort_order),
      String(c.visible),
      c.image ?? "",
      es?.name ?? "",
      es?.description ?? "",
      en?.name ?? "",
      en?.description ?? "",
    ]);
  }

  const prodRows: string[][] = [[...PROD_HEADERS]];
  for (const p of repos.products.list()) {
    const es = repos.translations.get("product", p.id, "es");
    const en = repos.translations.get("product", p.id, "en");
    prodRows.push([
      String(p.id),
      String(p.category_id),
      p.type,
      String(p.price_minor),
      String(p.available),
      String(p.visible),
      String(p.sort_order),
      p.image ?? "",
      es?.name ?? "",
      es?.description ?? "",
      en?.name ?? "",
      en?.description ?? "",
    ]);
  }

  const trRows: string[][] = [[...TR_HEADERS]];
  for (const entity of ["category", "product", "offer"] as const) {
    for (const lang of repos.languages.list().map((l) => l.code)) {
      for (const t of repos.translations.listByLangEntity(lang, entity)) {
        trRows.push([
          t.entity,
          String(t.entity_id),
          t.lang,
          t.name,
          t.description ?? "",
        ]);
      }
    }
  }

  return [
    { name: "categories", rows: catRows },
    { name: "products", rows: prodRows },
    { name: "translations", rows: trRows },
  ];
}

export function exportCatalog(
  repos: Repos,
  format: CatalogIoFormat,
): { bytes: Uint8Array; filename: string; contentType: string } {
  const sheets = buildCatalogSheets(repos);
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  if (format === "xlsx") {
    return {
      bytes: buildXlsx(sheets),
      filename: `carta-export-${stamp}.xlsx`,
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    };
  }
  if (format === "csv") {
    // Solo productos (hoja principal) como CSV suelto
    const products = sheets.find((s) => s.name === "products") ?? sheets[0]!;
    return {
      bytes: new TextEncoder().encode(`\uFEFF${toCsv(products.rows)}`),
      filename: `products-export-${stamp}.csv`,
      contentType: "text/csv; charset=utf-8",
    };
  }
  return {
    bytes: sheetsToCsvZip(sheets),
    filename: `carta-export-${stamp}.zip`,
    contentType: "application/zip",
  };
}

export function parseCatalogFile(filename: string, buf: Uint8Array): Sheet[] {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".xlsx") || lower.endsWith(".xlsm")) return parseXlsx(buf);
  if (lower.endsWith(".zip")) return parseCsvZip(buf);
  if (lower.endsWith(".csv")) {
    const name = lower.includes("categor")
      ? "categories"
      : lower.includes("translat")
        ? "translations"
        : "products";
    return [{ name, rows: parseCsv(new TextDecoder().decode(buf)) }];
  }
  throw new Error("Formato no soportado (use .xlsx, .zip de CSV o .csv)");
}

function parseCategoriesSheet(
  sheet: Sheet,
  repos: Repos,
  errors: ImportIssue[],
): CategoryPlan[] {
  if (sheet.rows.length < 2) return [];
  const header = sheet.rows[0]!.map((h) => h.trim().toLowerCase());
  if (headerIndex(header, "name_es") < 0 && headerIndex(header, "id") < 0) {
    errors.push({ sheet: sheet.name, row: 1, message: "Cabeceras de categorías no reconocidas" });
    return [];
  }
  const plans: CategoryPlan[] = [];
  for (let r = 1; r < sheet.rows.length; r++) {
    const rowNum = r + 1;
    const m = rowMap(header, sheet.rows[r]!);
    const idRaw = m.id?.trim() ?? "";
    const id = idRaw === "" ? null : intCell(idRaw);
    if (idRaw !== "" && id == null) {
      errors.push({ sheet: sheet.name, row: rowNum, message: `id inválido: ${idRaw}` });
      continue;
    }
    const nameEs = (m.name_es ?? "").trim();
    if (!nameEs) {
      errors.push({ sheet: sheet.name, row: rowNum, message: "name_es obligatorio" });
      continue;
    }
    let action: "create" | "update" = "create";
    if (id != null) {
      if (repos.categories.get(id)) action = "update";
      else {
        errors.push({
          sheet: sheet.name,
          row: rowNum,
          message: `id ${id} no existe (no se crea con id forzado; deje id vacío)`,
        });
        continue;
      }
    }
    const sort_order = intCell(m.sort_order, 0) ?? 0;
    const image = (m.image ?? "").trim() || null;
    if (image && !/^[a-f0-9]{16}$/.test(image)) {
      errors.push({
        sheet: sheet.name,
        row: rowNum,
        message: "image debe ser hash de 16 hex o vacío (fotos vía zip completo)",
      });
      continue;
    }
    const i18n: CategoryPlan["i18n"] = {
      es: { name: nameEs, description: (m.description_es ?? "").trim() || null },
    };
    const nameEn = (m.name_en ?? "").trim();
    if (nameEn) {
      i18n.en = { name: nameEn, description: (m.description_en ?? "").trim() || null };
    }
    plans.push({
      action,
      id,
      sort_order,
      visible: boolCell(m.visible, true),
      image,
      i18n,
      label: nameEs,
      row: rowNum,
    });
  }
  return plans;
}

function parseProductsSheet(
  sheet: Sheet,
  repos: Repos,
  catPlans: CategoryPlan[],
  errors: ImportIssue[],
): ProductPlan[] {
  if (sheet.rows.length < 2) return [];
  const header = sheet.rows[0]!.map((h) => h.trim().toLowerCase());
  if (headerIndex(header, "name_es") < 0 || headerIndex(header, "category_id") < 0) {
    errors.push({ sheet: sheet.name, row: 1, message: "Cabeceras de productos no reconocidas" });
    return [];
  }
  const existingCatIds = new Set(repos.categories.list().map((c) => c.id));
  // Categorías que se crearán en este mismo plan aún no tienen id → no referenciables por id nuevo
  const plans: ProductPlan[] = [];
  for (let r = 1; r < sheet.rows.length; r++) {
    const rowNum = r + 1;
    const m = rowMap(header, sheet.rows[r]!);
    const idRaw = m.id?.trim() ?? "";
    const id = idRaw === "" ? null : intCell(idRaw);
    if (idRaw !== "" && id == null) {
      errors.push({ sheet: sheet.name, row: rowNum, message: `id inválido: ${idRaw}` });
      continue;
    }
    const nameEs = (m.name_es ?? "").trim();
    if (!nameEs) {
      errors.push({ sheet: sheet.name, row: rowNum, message: "name_es obligatorio" });
      continue;
    }
    const category_id = intCell(m.category_id);
    if (category_id == null) {
      errors.push({ sheet: sheet.name, row: rowNum, message: "category_id obligatorio" });
      continue;
    }
    if (!existingCatIds.has(category_id) && !catPlans.some((c) => c.id === category_id)) {
      errors.push({
        sheet: sheet.name,
        row: rowNum,
        message: `category_id ${category_id} no existe`,
      });
      continue;
    }
    const type = (m.type ?? "comida").trim().toLowerCase();
    if (type !== "comida" && type !== "bebida" && type !== "articulo") {
      errors.push({ sheet: sheet.name, row: rowNum, message: `type inválido: ${type}` });
      continue;
    }
    const price_minor = intCell(m.price_minor);
    if (price_minor == null || price_minor < 0) {
      errors.push({ sheet: sheet.name, row: rowNum, message: "price_minor inválido" });
      continue;
    }
    let action: "create" | "update" = "create";
    if (id != null) {
      if (repos.products.get(id)) action = "update";
      else {
        errors.push({
          sheet: sheet.name,
          row: rowNum,
          message: `id ${id} no existe (deje id vacío para crear)`,
        });
        continue;
      }
    }
    const image = (m.image ?? "").trim() || null;
    if (image && !/^[a-f0-9]{16}$/.test(image)) {
      errors.push({
        sheet: sheet.name,
        row: rowNum,
        message: "image debe ser hash de 16 hex o vacío",
      });
      continue;
    }
    const i18n: ProductPlan["i18n"] = {
      es: { name: nameEs, description: (m.description_es ?? "").trim() || null },
    };
    const nameEn = (m.name_en ?? "").trim();
    if (nameEn) {
      i18n.en = { name: nameEn, description: (m.description_en ?? "").trim() || null };
    }
    plans.push({
      action,
      id,
      category_id,
      type,
      price_minor,
      available: boolCell(m.available, true),
      visible: boolCell(m.visible, true),
      sort_order: intCell(m.sort_order, 0) ?? 0,
      image,
      i18n,
      label: nameEs,
      row: rowNum,
    });
  }
  return plans;
}

/** Incorpora hoja translations: sobrescribe i18n de planes create/update por entity_id. */
function applyTranslationsSheet(
  sheet: Sheet | undefined,
  catPlans: CategoryPlan[],
  prodPlans: ProductPlan[],
  errors: ImportIssue[],
): void {
  if (!sheet || sheet.rows.length < 2) return;
  const header = sheet.rows[0]!.map((h) => h.trim().toLowerCase());
  for (let r = 1; r < sheet.rows.length; r++) {
    const rowNum = r + 1;
    const m = rowMap(header, sheet.rows[r]!);
    const entity = (m.entity ?? "").trim();
    const entity_id = intCell(m.entity_id);
    const lang = (m.lang ?? "").trim();
    const name = (m.name ?? "").trim();
    if (!entity || entity_id == null || !lang || !name) {
      errors.push({
        sheet: sheet.name,
        row: rowNum,
        message: "entity, entity_id, lang y name son obligatorios",
      });
      continue;
    }
    if (entity !== "category" && entity !== "product") {
      // ofertas: informativo, no bloqueamos
      continue;
    }
    const desc = (m.description ?? "").trim() || null;
    // No pisar name_es/name_en ya leídos de las hojas categories/products
    if (entity === "category") {
      const plan = catPlans.find((c) => c.id === entity_id);
      if (plan && !plan.i18n[lang]) plan.i18n[lang] = { name, description: desc };
    } else {
      const plan = prodPlans.find((p) => p.id === entity_id);
      if (plan && !plan.i18n[lang]) plan.i18n[lang] = { name, description: desc };
    }
  }
}

export function previewCatalogImport(repos: Repos, sheets: Sheet[]): ImportPreview {
  const errors: ImportIssue[] = [];
  const catSheet = sheetByName(sheets, "categories", "categorias", "categoría", "categorias.csv");
  const prodSheet = sheetByName(sheets, "products", "productos", "products.csv", "productos.csv");
  const trSheet = sheetByName(
    sheets,
    "translations",
    "traducciones",
    "translations.csv",
    "traducciones.csv",
  );

  if (!catSheet && !prodSheet) {
    errors.push({
      sheet: "—",
      row: 0,
      message: "No se encontró hoja categories ni products",
    });
    return { creates: [], updates: [], errors, plan: { categories: [], products: [] } };
  }

  const categories = catSheet ? parseCategoriesSheet(catSheet, repos, errors) : [];
  const products = prodSheet ? parseProductsSheet(prodSheet, repos, categories, errors) : [];
  applyTranslationsSheet(trSheet, categories, products, errors);

  const creates: ImportChange[] = [];
  const updates: ImportChange[] = [];
  for (const c of categories) {
    const ch: ImportChange = {
      sheet: "categories",
      action: c.action,
      id: c.id,
      label: c.label,
    };
    if (c.action === "create") creates.push(ch);
    else updates.push(ch);
  }
  for (const p of products) {
    const ch: ImportChange = {
      sheet: "products",
      action: p.action,
      id: p.id,
      label: p.label,
    };
    if (p.action === "create") creates.push(ch);
    else updates.push(ch);
  }

  return {
    creates,
    updates,
    errors,
    plan: { categories, products },
  };
}

export function backupBeforeImport(db: Database, dataDir: string): string {
  const dir = ensureBackupsDir(dataDir);
  let file = preImportBackupFileName();
  let dest = join(dir, file);
  if (existsSync(dest)) {
    file = preImportBackupFileName(new Date(Date.now() + 60_000));
    dest = join(dir, file);
  }
  vacuumInto(db, dest);
  return file;
}

export function applyCatalogImport(repos: Repos, plan: ImportPlan): { created: number; updated: number } {
  let created = 0;
  let updated = 0;

  // Categorías primero
  for (const c of plan.categories) {
    if (c.action === "create") {
      const id = repos.categories.create({
        visible: c.visible,
        image: c.image,
        sort_order: c.sort_order,
      });
      for (const [lang, t] of Object.entries(c.i18n)) {
        repos.translations.upsert({
          entity: "category",
          entity_id: id,
          lang,
          name: t.name,
          description: t.description,
        });
      }
      created++;
    } else if (c.id != null) {
      repos.categories.update(c.id, {
        sort_order: c.sort_order,
        visible: c.visible,
        image: c.image,
      });
      for (const [lang, t] of Object.entries(c.i18n)) {
        repos.translations.upsert({
          entity: "category",
          entity_id: c.id,
          lang,
          name: t.name,
          description: t.description,
        });
      }
      updated++;
    }
  }

  for (const p of plan.products) {
    if (p.action === "create") {
      const id = repos.products.create({
        category_id: p.category_id,
        type: p.type,
        price_minor: p.price_minor,
        image: p.image,
        available: p.available,
        visible: p.visible,
        sort_order: p.sort_order,
      });
      for (const [lang, t] of Object.entries(p.i18n)) {
        repos.translations.upsert({
          entity: "product",
          entity_id: id,
          lang,
          name: t.name,
          description: t.description,
        });
      }
      created++;
    } else if (p.id != null) {
      const existing = repos.products.get(p.id);
      if (!existing) continue;
      repos.products.update(p.id, {
        category_id: p.category_id,
        type: p.type,
        price_minor: p.price_minor,
        image: p.image,
        available: p.available,
        visible: p.visible,
        sort_order: p.sort_order,
      });
      for (const [lang, t] of Object.entries(p.i18n)) {
        repos.translations.upsert({
          entity: "product",
          entity_id: p.id,
          lang,
          name: t.name,
          description: t.description,
        });
      }
      updated++;
    }
  }

  return { created, updated };
}

/** Planes en memoria (no ensucian settings ni suben revision). TTL 30 min. */
const PLAN_TTL_MS = 30 * 60 * 1000;
const pendingPlans = new Map<string, { plan: ImportPlan; at: number }>();

export function storeImportPlan(_repos: Repos, plan: ImportPlan): string {
  const now = Date.now();
  for (const [k, v] of pendingPlans) {
    if (now - v.at > PLAN_TTL_MS) pendingPlans.delete(k);
  }
  const token = `imp-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  pendingPlans.set(token, { plan, at: now });
  return token;
}

export function loadImportPlan(_repos: Repos, token: string): ImportPlan | null {
  const entry = pendingPlans.get(token);
  if (!entry) return null;
  if (Date.now() - entry.at > PLAN_TTL_MS) {
    pendingPlans.delete(token);
    return null;
  }
  return entry.plan;
}

export function clearImportPlan(_repos: Repos, token: string): void {
  pendingPlans.delete(token);
}
