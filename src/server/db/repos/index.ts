import type { Database } from "bun:sqlite";
import { createCategoriesRepo } from "./categories";
import { createCurrenciesRepo } from "./currencies";
import { createLanguagesRepo } from "./languages";
import { createOffersRepo } from "./offers";
import { createProductsRepo } from "./products";
import { createSettingsRepo } from "./settings";
import { createTranslationsRepo } from "./translations";

export function createRepos(db: Database) {
  return {
    languages: createLanguagesRepo(db),
    currencies: createCurrenciesRepo(db),
    categories: createCategoriesRepo(db),
    products: createProductsRepo(db),
    offers: createOffersRepo(db),
    translations: createTranslationsRepo(db),
    settings: createSettingsRepo(db),
  };
}

export type Repos = ReturnType<typeof createRepos>;

export {
  createCategoriesRepo,
  createCurrenciesRepo,
  createLanguagesRepo,
  createOffersRepo,
  createProductsRepo,
  createSettingsRepo,
  createTranslationsRepo,
};
