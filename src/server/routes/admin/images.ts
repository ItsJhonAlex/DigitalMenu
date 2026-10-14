import type { AppContext } from "../../app";
import { validationError } from "../../http/validate";
import { createImagesService } from "../../services/images";
import { createAdminRouter } from "./base";

export function imagesAdmin(ctx: AppContext) {
  const app = createAdminRouter(ctx);
  const images = createImagesService({
    dataDir: ctx.runtime.dataDir,
    getDb: () => ctx.db,
  });

  app.post("/api/admin/images", async (c) => {
    const form = await c.req.parseBody();
    const large = form.large;
    const thumb = form.thumb;
    if (!(large instanceof File) || !(thumb instanceof File)) {
      throw validationError("Se requieren partes large y thumb");
    }
    const result = await images.saveUpload(large, thumb);
    return c.json(result, 201);
  });

  app.get("/api/admin/images/orphans", (c) => c.json(images.listOrphans()));

  app.delete("/api/admin/images/orphans", (c) => {
    const deleted = images.deleteOrphans();
    return c.json({ deleted });
  });

  return app;
}
