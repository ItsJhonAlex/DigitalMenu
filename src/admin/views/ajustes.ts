import { api } from "../api";
import { BRAND } from "../brand";
import { clear, el } from "../dom";
import { showToast } from "../toast";

function boolSetting(settings: Record<string, unknown>, key: string, fallback = true): boolean {
  const v = settings[key];
  if (v === false || v === "false" || v === 0) return false;
  if (v === true || v === "true" || v === 1) return true;
  return fallback;
}

export async function renderAjustes(root: HTMLElement): Promise<void> {
  const settings = await api.get<Record<string, unknown>>("/api/admin/settings");
  clear(root);

  const name = el("input", {
    className: "input",
    attrs: {
      value:
        typeof settings["carta.restaurant_name"] === "string"
          ? String(settings["carta.restaurant_name"])
          : BRAND,
    },
  }) as HTMLInputElement;

  const welcomeEs = el("input", {
    className: "input",
    attrs: {
      value:
        typeof settings["carta.welcome"] === "object" &&
        settings["carta.welcome"] &&
        "es" in (settings["carta.welcome"] as object)
          ? String((settings["carta.welcome"] as { es?: string }).es ?? "")
          : `Bienvenidos a ${BRAND}`,
    },
  }) as HTMLInputElement;

  const footerEs = el("input", {
    className: "input",
    attrs: {
      value:
        typeof settings["carta.footer"] === "object" &&
        settings["carta.footer"] &&
        "es" in (settings["carta.footer"] as object)
          ? String((settings["carta.footer"] as { es?: string }).es ?? "")
          : "Precios con impuestos incluidos",
    },
  }) as HTMLInputElement;

  const showRate = el("input", {
    className: "toggle",
    attrs: { type: "checkbox" },
  }) as HTMLInputElement;
  showRate.checked = boolSetting(settings, "carta.show_rate", true);

  const showImages = el("input", {
    className: "toggle",
    attrs: { type: "checkbox" },
  }) as HTMLInputElement;
  showImages.checked = boolSetting(settings, "carta.show_images", true);

  const pin = el("input", {
    className: "input",
    attrs: {
      type: "password",
      inputmode: "numeric",
      maxlength: "8",
      placeholder: settings["admin.pinEnabled"]
        ? "•••• (dejar vacío para no cambiar)"
        : "Opcional 4–8 dígitos",
    },
  }) as HTMLInputElement;
  const clearPin = el("input", {
    className: "toggle",
    attrs: { type: "checkbox" },
  }) as HTMLInputElement;

  const persistFlag = async (
    key: "carta.show_rate" | "carta.show_images",
    value: boolean,
    ok: string,
  ) => {
    try {
      await api.put("/api/admin/settings", { [key]: value });
      showToast(ok, "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Error al guardar", "error");
      // Revertir UI si falla
      if (key === "carta.show_rate") showRate.checked = !value;
      else showImages.checked = !value;
    }
  };

  showRate.addEventListener("change", () => {
    void persistFlag(
      "carta.show_rate",
      showRate.checked,
      showRate.checked ? "Tasa del día visible" : "Tasa del día oculta",
    );
  });
  showImages.addEventListener("change", () => {
    void persistFlag(
      "carta.show_images",
      showImages.checked,
      showImages.checked ? "Fotos activadas en la carta" : "Carta en solo texto",
    );
  });

  const save = el("button", {
    className: "btn btn--primary",
    text: "Guardar textos",
    attrs: { type: "button" },
  });
  save.addEventListener("click", async () => {
    try {
      const body: Record<string, unknown> = {
        "carta.restaurant_name": name.value.trim() || BRAND,
        "carta.welcome": { es: welcomeEs.value.trim(), en: "Welcome" },
        "carta.footer": { es: footerEs.value.trim() },
        "carta.show_rate": showRate.checked,
        "carta.show_images": showImages.checked,
      };
      if (clearPin.checked) body["admin.pin"] = null;
      else if (pin.value.trim()) body["admin.pin"] = pin.value.trim();
      await api.put("/api/admin/settings", body);
      showToast("Ajustes guardados", "success");
      await renderAjustes(root);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Error", "error");
    }
  });

  root.appendChild(
    el("div", {
      className: "card stack",
      children: [
        el("h2", { className: "card__title", text: `Datos de ${BRAND}` }),
        el("label", {
          className: "field",
          children: [el("span", { text: "Nombre del restaurante" }), name],
        }),
        el("label", {
          className: "field",
          children: [el("span", { text: "Bienvenida (ES)" }), welcomeEs],
        }),
        el("label", {
          className: "field",
          children: [el("span", { text: "Pie de carta (ES)" }), footerEs],
        }),
        el("label", {
          className: "row",
          children: [showRate, el("span", { text: "Mostrar tasa del día en la carta" })],
        }),
        el("label", {
          className: "row",
          children: [
            showImages,
            el("span", {
              text: "Mostrar fotos en la carta (apágalo si aún no hay imágenes)",
            }),
          ],
        }),
        el("p", {
          className: "muted",
          text: "Los interruptores se guardan al tocarlos. Recarga la carta para ver el cambio.",
        }),
        el("h2", { className: "card__title", text: "Seguridad" }),
        el("label", {
          className: "field",
          children: [el("span", { text: "PIN del Admin (opcional)" }), pin],
        }),
        el("label", {
          className: "row",
          children: [clearPin, el("span", { text: "Desactivar PIN" })],
        }),
        save,
      ],
    }),
  );

  // RF-50 / RF-51 — Copias de seguridad
  type BackupList = {
    items: Array<{ file: string; kind: string; bytes: number; createdAt: string }>;
    lastAutoAt: string | null;
    keepDaily: number;
    hour?: number;
  };

  const backupCard = el("div", { className: "card stack" });
  root.appendChild(backupCard);

  const formatBytes = (n: number) => {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  };

  const renderBackups = async () => {
    clear(backupCard);
    backupCard.appendChild(el("h2", { className: "card__title", text: "Copias de seguridad" }));

    let data: BackupList;
    try {
      data = await api.get<BackupList>("/api/admin/backups");
    } catch (err) {
      backupCard.appendChild(
        el("p", {
          className: "muted",
          text: err instanceof Error ? err.message : "No se pudieron listar las copias",
        }),
      );
      return;
    }

    backupCard.appendChild(
      el("p", {
        className: "muted",
        text: `Automática: conserva ${data.keepDaily} (hora ${String(data.hour ?? 4).padStart(2, "0")}:00). ${
          data.lastAutoAt
            ? `Última: ${new Date(data.lastAutoAt).toLocaleString()}`
            : "Aún no hay copia automática."
        }`,
      }),
    );

    const btnRow = el("div", { className: "row" });
    const btnDb = el("button", {
      className: "btn",
      text: "Crear copia ahora",
      attrs: { type: "button" },
    });
    const btnFull = el("button", {
      className: "btn btn--primary",
      text: "Exportar copia completa (.zip)",
      attrs: { type: "button" },
    });
    btnRow.append(btnDb, btnFull);
    backupCard.appendChild(btnRow);

    const runCreate = async (kind: "db" | "full") => {
      btnDb.setAttribute("disabled", "true");
      btnFull.setAttribute("disabled", "true");
      try {
        const res = await api.post<{ file: string; bytes: number }>("/api/admin/backups", { kind });
        showToast(
          kind === "full"
            ? `Exportada ${res.file} (${formatBytes(res.bytes)})`
            : `Copia ${res.file} (${formatBytes(res.bytes)})`,
          "success",
        );
        // Ofrecer descarga inmediata
        const a = document.createElement("a");
        a.href = `/api/admin/backups/${encodeURIComponent(res.file)}`;
        a.download = res.file;
        a.click();
        await renderBackups();
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Error al crear copia", "error");
        btnDb.removeAttribute("disabled");
        btnFull.removeAttribute("disabled");
      }
    };
    btnDb.addEventListener("click", () => void runCreate("db"));
    btnFull.addEventListener("click", () => void runCreate("full"));

    // RF-52 — Subir copia propia (.db o .zip)
    const uploadRow = el("div", { className: "row" });
    const uploadInput = el("input", {
      attrs: { type: "file", accept: ".db,.zip,application/zip" },
    }) as HTMLInputElement;
    const uploadBtn = el("button", {
      className: "btn",
      text: "Restaurar desde archivo…",
      attrs: { type: "button" },
    });
    uploadBtn.addEventListener("click", () => uploadInput.click());
    uploadInput.addEventListener("change", () => {
      const file = uploadInput.files?.[0];
      uploadInput.value = "";
      if (!file) return;
      void runRestoreUpload(file);
    });
    uploadRow.append(
      uploadBtn,
      el("span", { className: "muted tiny", text: ".db o .zip con imágenes" }),
    );
    backupCard.appendChild(uploadRow);

    if (data.items.length === 0) {
      backupCard.appendChild(
        el("p", { className: "muted", text: "No hay copias en backups\\ todavía." }),
      );
      return;
    }

    const kindLabel = (kind: string) => {
      if (kind === "full") return "Completa";
      if (kind === "pre") return "Previa";
      return "Diaria";
    };

    const list = el("ul", { className: "stack" });
    for (const item of data.items.slice(0, 30)) {
      const li = el("li", { className: "row" });
      li.append(
        el("span", {
          text: `[${kindLabel(item.kind)}] ${item.file} · ${formatBytes(item.bytes)} · ${new Date(item.createdAt).toLocaleString()}`,
        }),
      );
      const dl = el("a", {
        className: "btn btn--ghost",
        text: "Descargar",
        attrs: {
          href: `/api/admin/backups/${encodeURIComponent(item.file)}`,
          download: item.file,
        },
      });
      const restoreBtn = el("button", {
        className: "btn btn--primary",
        text: "Restaurar",
        attrs: { type: "button" },
      });
      restoreBtn.addEventListener("click", () => void runRestoreFile(item.file));
      li.append(dl, restoreBtn);
      list.appendChild(li);
    }
    backupCard.appendChild(list);
  };

  const runRestoreFile = async (file: string) => {
    const ok = confirm(
      `¿Restaurar la copia «${file}»?\n\nSe creará automáticamente una copia de seguridad del estado actual (pre-restore) por si hay que deshacer.\nLa carta se actualizará con los datos restaurados.`,
    );
    if (!ok) return;
    try {
      const res = await api.post<{
        ok: boolean;
        safetyBackup: string;
        migrated: number[];
      }>("/api/admin/backups/restore", { file, confirm: true });
      showToast(
        `Restaurada. Copia de seguridad: ${res.safetyBackup}${
          res.migrated?.length ? ` · migraciones: ${res.migrated.join(",")}` : ""
        }`,
        "success",
      );
      await renderBackups();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Error al restaurar", "error");
    }
  };

  const runRestoreUpload = async (file: File) => {
    const ok = confirm(
      `¿Restaurar desde «${file.name}» (${formatBytes(file.size)})?\n\nSe creará automáticamente una copia de seguridad del estado actual (pre-restore) por si hay que deshacer.\nSi es un .zip, también se restaurarán las imágenes incluidas.`,
    );
    if (!ok) return;
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("confirm", "true");
      const res = await fetch("/api/admin/backups/restore", {
        method: "POST",
        body: fd,
        headers: { Accept: "application/json" },
      });
      const body = (await res.json()) as {
        error?: { message?: string };
        safetyBackup?: string;
        migrated?: number[];
      };
      if (!res.ok) {
        throw new Error(body.error?.message ?? `Error ${res.status}`);
      }
      showToast(
        `Restaurada. Copia de seguridad: ${body.safetyBackup ?? "—"}${
          body.migrated?.length ? ` · migraciones: ${body.migrated.join(",")}` : ""
        }`,
        "success",
      );
      await renderBackups();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Error al restaurar", "error");
    }
  };

  void renderBackups();

  // M3 — Exportar / importar carta (sin fotos; fotos = zip completo)
  const ioCard = el("div", { className: "card stack" });
  root.appendChild(ioCard);
  ioCard.append(
    el("h2", { className: "card__title", text: "Exportar / importar carta" }),
    el("p", {
      className: "muted",
      text: "Productos, categorías, precios y traducciones. Las fotos no van en Excel: use el zip completo de copias.",
    }),
  );

  const exportRow = el("div", { className: "row" });
  for (const [format, label] of [
    ["xlsx", "Excel (.xlsx)"],
    ["csvzip", "CSV (zip)"],
    ["csv", "Solo products.csv"],
  ] as const) {
    const btn = el("button", {
      className: "btn",
      text: label,
      attrs: { type: "button" },
    });
    btn.addEventListener("click", () => {
      const a = document.createElement("a");
      a.href = `/api/admin/catalog/export?format=${format}`;
      a.download = "";
      a.click();
    });
    exportRow.appendChild(btn);
  }
  ioCard.appendChild(exportRow);

  const fileInput = el("input", {
    attrs: { type: "file", accept: ".xlsx,.csv,.zip" },
  }) as HTMLInputElement;
  const previewBox = el("div", { className: "stack" });
  const previewBtn = el("button", {
    className: "btn btn--primary",
    text: "Vista previa de importación",
    attrs: { type: "button" },
  });
  let importToken: string | null = null;

  previewBtn.addEventListener("click", async () => {
    const file = fileInput.files?.[0];
    if (!file) {
      showToast("Elija un archivo .xlsx, .zip o .csv", "error");
      return;
    }
    previewBtn.setAttribute("disabled", "true");
    clear(previewBox);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/catalog/import/preview", {
        method: "POST",
        body: fd,
        headers: { Accept: "application/json" },
      });
      const body = (await res.json()) as {
        error?: { message?: string };
        creates?: Array<{ sheet: string; id: number | null; label: string }>;
        updates?: Array<{ sheet: string; id: number | null; label: string }>;
        errors?: Array<{ sheet: string; row: number; message: string }>;
        token?: string | null;
        summary?: { createCount: number; updateCount: number; errorCount: number };
      };
      if (!res.ok) {
        throw new Error(body.error?.message ?? `Error ${res.status}`);
      }
      importToken = body.token ?? null;
      const s = body.summary!;
      previewBox.appendChild(
        el("p", {
          text: `Crear: ${s.createCount} · Actualizar: ${s.updateCount} · Errores: ${s.errorCount}`,
        }),
      );
      if (body.errors?.length) {
        const ul = el("ul", { className: "stack" });
        for (const e of body.errors.slice(0, 30)) {
          ul.appendChild(
            el("li", {
              className: "muted",
              text: `${e.sheet} fila ${e.row}: ${e.message}`,
            }),
          );
        }
        previewBox.appendChild(ul);
      } else {
        const ul = el("ul", { className: "stack" });
        for (const c of [...(body.creates ?? []), ...(body.updates ?? [])].slice(0, 25)) {
          ul.appendChild(
            el("li", {
              className: "muted tiny",
              text: `${c.sheet === "categories" ? "Cat" : "Prod"} ${c.id ?? "nuevo"} — ${c.label}`,
            }),
          );
        }
        previewBox.appendChild(ul);
        if (importToken) {
          const applyBtn = el("button", {
            className: "btn btn--primary",
            text: "Aplicar importación (con copia de seguridad)",
            attrs: { type: "button" },
          });
          applyBtn.addEventListener("click", async () => {
            if (!confirm("¿Aplicar cambios? Se creará una copia pre-import automáticamente.")) {
              return;
            }
            applyBtn.setAttribute("disabled", "true");
            try {
              const applied = await api.post<{
                ok: boolean;
                created: number;
                updated: number;
                safetyBackup: string;
              }>("/api/admin/catalog/import/apply", {
                confirm: true,
                token: importToken,
              });
              showToast(
                `Importado: +${applied.created} / ~${applied.updated}. Copia: ${applied.safetyBackup}`,
                "success",
              );
              importToken = null;
              clear(previewBox);
              await renderBackups();
            } catch (err) {
              showToast(err instanceof Error ? err.message : "Error al aplicar", "error");
              applyBtn.removeAttribute("disabled");
            }
          });
          previewBox.appendChild(applyBtn);
        }
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Error en vista previa", "error");
    } finally {
      previewBtn.removeAttribute("disabled");
    }
  });

  ioCard.append(
    el("label", {
      className: "field",
      children: [el("span", { text: "Archivo a importar" }), fileInput],
    }),
    previewBtn,
    previewBox,
  );
}
