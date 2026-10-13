/**
 * Rellena la BD local con un menú de demostración (productos, ofertas, textos, fotos).
 * Uso: bun scripts/seed-demo.ts [--data ./data] [--force]
 */
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { closeDatabase, openDatabase } from "../src/server/db";
import { migrate } from "../src/server/db/migrate";
import { createRepos } from "../src/server/db/repos";

type ProductType = "comida" | "bebida" | "articulo";

type DemoProduct = {
  cat: string;
  type: ProductType;
  price: number;
  available?: boolean;
  /** Si falta, el producto sale como lista en la carta. */
  imageKey?: string;
  es: { name: string; description: string };
  en: { name: string; description: string };
};

const DEMO_PRODUCTS: DemoProduct[] = [
  {
    cat: "Entrantes",
    type: "comida",
    price: 1800,
    imageKey: "0",
    es: { name: "Tostones rellenos", description: "Plátano verde frito con ropa vieja y salsa de ajo." },
    en: { name: "Stuffed tostones", description: "Fried green plantain with shredded beef and garlic sauce." },
  },
  {
    cat: "Entrantes",
    type: "comida",
    price: 2200,
    imageKey: "0",
    es: { name: "Croquetas de jamón", description: "Crujientes, porción de 6 unidades con alioli." },
    en: { name: "Ham croquettes", description: "Crispy, 6 pieces with aioli." },
  },
  {
    cat: "Entrantes",
    type: "comida",
    price: 1600,
    available: false,
    imageKey: "0",
    es: { name: "Ceviche de pescado", description: "Marinado en limón, cebolla morada y cilantro. Agotado hoy." },
    en: { name: "Fish ceviche", description: "Marinated in lime, red onion and cilantro. Sold out today." },
  },
  {
    cat: "Plato Fuerte",
    type: "comida",
    price: 4500,
    imageKey: "1",
    es: { name: "Ropa vieja", description: "Carne desmechada en salsa criolla, arroz y maduros." },
    en: { name: "Ropa vieja", description: "Shredded beef in creole sauce, rice and sweet plantain." },
  },
  {
    cat: "Plato Fuerte",
    type: "comida",
    price: 5200,
    imageKey: "1",
    es: { name: "Pollo a la parrilla", description: "Pechuga marinada, vegetales asados y papas." },
    en: { name: "Grilled chicken", description: "Marinated breast, roasted vegetables and potatoes." },
  },
  {
    cat: "Plato Fuerte",
    type: "comida",
    price: 6800,
    imageKey: "1",
    es: { name: "Pargo frito", description: "Pescado entero frito, congrí y ensalada." },
    en: { name: "Fried snapper", description: "Whole fried fish, congri rice and salad." },
  },
  {
    cat: "Plato Fuerte",
    type: "comida",
    price: 3900,
    imageKey: "1",
    es: { name: "Pasta al pesto", description: "Espagueti con pesto de albahaca y queso." },
    en: { name: "Pesto pasta", description: "Spaghetti with basil pesto and cheese." },
  },
  {
    cat: "Postres",
    type: "comida",
    price: 1500,
    imageKey: "2",
    es: { name: "Flan de coco", description: "Casero, con caramelo y coco tostado." },
    en: { name: "Coconut flan", description: "Homemade, with caramel and toasted coconut." },
  },
  {
    cat: "Postres",
    type: "comida",
    price: 1800,
    imageKey: "2",
    es: { name: "Brownie con helado", description: "Chocolate intenso y bola de vainilla." },
    en: { name: "Brownie with ice cream", description: "Rich chocolate and a scoop of vanilla." },
  },
  {
    cat: "Cócteles",
    type: "bebida",
    price: 2800,
    imageKey: "3",
    es: { name: "Mojito clásico", description: "Ron, hierbabuena, limón y soda." },
    en: { name: "Classic mojito", description: "Rum, mint, lime and soda." },
  },
  {
    cat: "Cócteles",
    type: "bebida",
    price: 3000,
    imageKey: "3",
    es: { name: "Piña colada", description: "Ron, crema de coco y piña natural." },
    en: { name: "Piña colada", description: "Rum, coconut cream and fresh pineapple." },
  },
  {
    cat: "Cócteles",
    type: "bebida",
    price: 3200,
    available: false,
    imageKey: "3",
    es: { name: "Daiquiri de fresa", description: "Ron blanco y fresas. Temporalmente agotado." },
    en: { name: "Strawberry daiquiri", description: "White rum and strawberries. Temporarily sold out." },
  },
  {
    cat: "Bebidas",
    type: "bebida",
    price: 800,
    imageKey: "4",
    es: { name: "Jugo natural", description: "Mango, guayaba o piña — pregunta al mesero." },
    en: { name: "Fresh juice", description: "Mango, guava or pineapple — ask your server." },
  },
  {
    cat: "Bebidas",
    type: "bebida",
    price: 600,
    imageKey: "4",
    es: { name: "Refresco", description: "Lata 355 ml. Variedad del día." },
    en: { name: "Soft drink", description: "355 ml can. Daily selection." },
  },
  {
    cat: "Bebidas",
    type: "bebida",
    price: 400,
    imageKey: "4",
    es: { name: "Agua embotellada", description: "500 ml con o sin gas." },
    en: { name: "Bottled water", description: "500 ml still or sparkling." },
  },
  {
    cat: "Bebidas",
    type: "bebida",
    price: 1200,
    imageKey: "4",
    es: { name: "Cerveza nacional", description: "Botella fría 355 ml." },
    en: { name: "Local beer", description: "Cold 355 ml bottle." },
  },
  {
    cat: "Artículos",
    type: "articulo",
    price: 2500,
    es: { name: "Gorra Avanzar", description: "Algodón, talla única, logo bordado." },
    en: { name: "Avanzar cap", description: "Cotton, one size, embroidered logo." },
  },
  {
    cat: "Artículos",
    type: "articulo",
    price: 1800,
    es: { name: "Botella reutilizable", description: "Acero 500 ml, mantiene frío 12 h." },
    en: { name: "Reusable bottle", description: "500 ml steel, keeps cold 12 h." },
  },
];

function parseArgs() {
  const args = process.argv.slice(2);
  let dataDir = "./data";
  let force = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--data") dataDir = args[++i] ?? dataDir;
    else if (args[i] === "--force") force = true;
  }
  return { dataDir, force };
}

function hash16(buf: Uint8Array): string {
  return createHash("sha256").update(buf).digest("hex").slice(0, 16);
}

async function ensurePlaceholders(dir: string): Promise<Record<string, string>> {
  mkdirSync(dir, { recursive: true });
  const specs: Array<{ key: string; color: string; text: string }> = [
    { key: "0", color: "b70011", text: "Entrante" },
    { key: "1", color: "8b1e1e", text: "Plato" },
    { key: "2", color: "5c403c", text: "Postre" },
    { key: "3", color: "1e1b19", text: "Cocktail" },
    { key: "4", color: "008438", text: "Bebida" },
    { key: "5", color: "33302d", text: "Oferta" },
  ];
  const out: Record<string, string> = {};
  for (const s of specs) {
    const path = join(dir, `${s.key}.webp`);
    if (!existsSync(path)) {
      const url = `https://placehold.co/1000x625/${s.color}/ffffff/webp?text=${encodeURIComponent(s.text)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`No se pudo descargar placeholder ${s.key}: ${res.status}`);
      await Bun.write(path, Buffer.from(await res.arrayBuffer()));
    }
    out[s.key] = path;
  }
  return out;
}

async function installImage(srcPath: string, imagesDir: string): Promise<string> {
  const buf = new Uint8Array(await Bun.file(srcPath).arrayBuffer());
  const h = hash16(buf);
  const large = join(imagesDir, `${h}.webp`);
  const thumb = join(imagesDir, `${h}_t.webp`);
  if (!existsSync(large)) copyFileSync(srcPath, large);
  if (!existsSync(thumb)) copyFileSync(srcPath, thumb);
  return h;
}

function clearMenuData(db: ReturnType<typeof openDatabase>) {
  db.exec(`
    DELETE FROM offer_items;
    DELETE FROM offers;
    DELETE FROM translations WHERE entity IN ('product', 'offer');
    DELETE FROM products;
  `);
}

async function main() {
  const { dataDir, force } = parseArgs();
  mkdirSync(dataDir, { recursive: true });
  const db = openDatabase(dataDir);
  migrate(db, { dataDir });
  const repos = createRepos(db);

  const productCount = (db.prepare("SELECT COUNT(*) AS n FROM products").get() as { n: number }).n;
  if (productCount > 0 && !force) {
    console.log(`Ya hay ${productCount} productos. Usa --force para reemplazar el menú demo.`);
    closeDatabase(db);
    return;
  }
  if (productCount > 0 && force) {
    console.log("Reemplazando menú existente…");
    clearMenuData(db);
  }

  const imagesDir = join(dataDir, "images");
  mkdirSync(imagesDir, { recursive: true });
  const placeholders = await ensurePlaceholders(join("scripts", "tmp-img"));
  const imageHash: Record<string, string> = {};
  for (const [k, path] of Object.entries(placeholders)) {
    imageHash[k] = await installImage(path, imagesDir);
  }

  repos.settings.setJson("carta.restaurant_name", "Avanzar In Time");
  repos.settings.setJson("carta.welcome", {
    es: "Bienvenido — carta digital",
    en: "Welcome — digital menu",
  });
  repos.settings.setJson("carta.footer", {
    es: "Pregunta al mesero por alérgenos. Precios sujetos a cambio.",
    en: "Ask your server about allergens. Prices subject to change.",
  });
  repos.settings.setJson("carta.second_currency", "USD");
  repos.settings.setJson("carta.show_rate", true);
  repos.settings.setJson("carta.show_images", true);
  repos.settings.setJson("carta.default_currency", "CUP");

  const cats = repos.categories.list();
  const catByName = new Map<string, number>();
  for (const c of cats) {
    const t = repos.translations.get("category", c.id, "es");
    if (t?.name) catByName.set(t.name, c.id);
  }

  const productIds: Record<string, number> = {};
  let sort = 0;
  for (const p of DEMO_PRODUCTS) {
    const categoryId = catByName.get(p.cat);
    if (categoryId == null) {
      console.warn(`Categoría no encontrada: ${p.cat}`);
      continue;
    }
    sort += 10;
    const id = repos.products.create({
      category_id: categoryId,
      type: p.type,
      price_minor: p.price,
      image: p.imageKey ? (imageHash[p.imageKey] ?? null) : null,
      available: p.available !== false,
      visible: true,
      sort_order: sort,
    });
    repos.translations.upsert({
      entity: "product",
      entity_id: id,
      lang: "es",
      name: p.es.name,
      description: p.es.description,
    });
    repos.translations.upsert({
      entity: "product",
      entity_id: id,
      lang: "en",
      name: p.en.name,
      description: p.en.description,
    });
    productIds[p.es.name] = id;
  }

  const ropa = productIds["Ropa vieja"];
  const mojito = productIds["Mojito clásico"];
  const tostones = productIds["Tostones rellenos"];
  if (ropa && mojito) {
    const offerId = repos.offers.create({
      price_minor: 6500,
      image: imageHash["5"] ?? null,
      available: true,
      visible: true,
      show_savings: true,
      sort_order: 10,
      items: [
        { product_id: ropa, quantity: 1 },
        { product_id: mojito, quantity: 1 },
      ],
    });
    repos.translations.upsert({
      entity: "offer",
      entity_id: offerId,
      lang: "es",
      name: "Combo criollo",
      description: "Ropa vieja + mojito. Ahorras frente al precio por separado.",
    });
    repos.translations.upsert({
      entity: "offer",
      entity_id: offerId,
      lang: "en",
      name: "Creole combo",
      description: "Ropa vieja + mojito. Save vs. ordering separately.",
    });
  }
  if (tostones && productIds["Jugo natural"]) {
    const offerId = repos.offers.create({
      price_minor: 2200,
      image: imageHash["5"] ?? null,
      available: true,
      visible: true,
      show_savings: true,
      sort_order: 20,
      items: [
        { product_id: tostones, quantity: 1 },
        { product_id: productIds["Jugo natural"]!, quantity: 1 },
      ],
    });
    repos.translations.upsert({
      entity: "offer",
      entity_id: offerId,
      lang: "es",
      name: "Entrante + jugo",
      description: "Tostones rellenos y jugo natural.",
    });
    repos.translations.upsert({
      entity: "offer",
      entity_id: offerId,
      lang: "en",
      name: "Starter + juice",
      description: "Stuffed tostones and fresh juice.",
    });
  }

  const nProd = (db.prepare("SELECT COUNT(*) AS n FROM products").get() as { n: number }).n;
  const nOff = (db.prepare("SELECT COUNT(*) AS n FROM offers").get() as { n: number }).n;
  console.log(`Demo listo en ${dataDir}: ${nProd} productos, ${nOff} ofertas.`);
  console.log("Abre http://localhost:8080/ (Carta) y http://localhost:8080/admin");
  closeDatabase(db);
}

await main();
