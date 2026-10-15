/**
 * Copias de seguridad + export/import de carta (sección Estado).
 */
import { api } from "../api";
import { dangerZone } from "../components/danger-zone";
import { clear, el } from "../dom";
import { openConfirm } from "../modal";
import { showToast } from "../toast";

type BackupList = {
  items: Array<{ file: string; kind: string; bytes: number; createdAt: string }>;
  lastAutoAt: string | null;
  keepDaily: number;
  hour?: number;
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

async function runRestoreFile(file: string, onDone: () => Promise<void>): Promise<void> {
  const ok = await openConfirm({
    title: "Restaurar copia",
    message: `¿Restaurar «${file}»? Se creará una copia de seguridad del estado actual (pre-restore). La carta se actualizará con los datos restaurados.`,
    confirmLabel: "Restaurar",
    danger: true,
  });
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
    await onDone();
  } catch (err) {
    showToast(err instanceof Error ? err.message : "Error al restaurar", "error");
  }
}

async function runRestoreUpload(file: File, onDone: () => Promise<void>): Promise<void> {
  const ok = await openConfirm({
    title: "Restaurar desde archivo",
    message: `¿Restaurar desde «${file.name}» (${formatBytes(file.size)})? Se creará una copia pre-restore. Si es un .zip, también se restaurarán las imágenes.`,
    confirmLabel: "Restaurar",
    danger: true,
  });
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
    await onDone();
  } catch (err) {
    showToast(err instanceof Error ? err.message : "Error al restaurar", "error");
  }
}

function renderDatosSection(parent: HTMLElement): void {
  const ioCard = el("div", { className: "card stack" });
  parent.appendChild(ioCard);
  ioCard.append(
    el("h2", { className: "card__title", text: "Datos" }),
    el("p", {
      className: "muted",
      text: "Exportar / importar productos, categorías y traducciones. Las fotos no van en Excel: use el zip completo de copias.",
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
          const applyZone = dangerZone({
            title: "Aplicar importación",
            hint: "Sobrescribe datos de la carta. Se crea copia pre-import automáticamente.",
            children: [],
          });
          const applyBtn = el("button", {
            className: "btn btn--danger",
            text: "Aplicar importación",
            attrs: { type: "button" },
          });
          applyBtn.addEventListener("click", async () => {
            const ok = await openConfirm({
              title: "Aplicar importación",
              message:
                "¿Aplicar los cambios de la vista previa? Se creará una copia de seguridad automática.",
              confirmLabel: "Aplicar",
              danger: true,
            });
            if (!ok) return;
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
            } catch (err) {
              showToast(err instanceof Error ? err.message : "Error al aplicar", "error");
              applyBtn.removeAttribute("disabled");
            }
          });
          applyZone.appendChild(applyBtn);
          previewBox.appendChild(applyZone);
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

/** Monta sección Copias + Datos dentro de un contenedor (Estado). */
export async function renderCopias(parent: HTMLElement): Promise<void> {
  const backupCard = el("div", { className: "card stack" });
  parent.appendChild(backupCard);

  const paintBackups = async () => {
    clear(backupCard);
    backupCard.appendChild(el("h2", { className: "card__title", text: "Copias" }));

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
        const a = document.createElement("a");
        a.href = `/api/admin/backups/${encodeURIComponent(res.file)}`;
        a.download = res.file;
        a.click();
        await paintBackups();
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Error al crear copia", "error");
        btnDb.removeAttribute("disabled");
        btnFull.removeAttribute("disabled");
      }
    };
    btnDb.addEventListener("click", () => void runCreate("db"));
    btnFull.addEventListener("click", () => void runCreate("full"));

    const restoreZone = dangerZone({
      title: "Restaurar",
      hint: "Sustituye la base actual. Se guarda una copia pre-restore antes.",
      children: [],
    });
    const uploadInput = el("input", {
      attrs: { type: "file", accept: ".db,.zip,application/zip" },
    }) as HTMLInputElement;
    const uploadBtn = el("button", {
      className: "btn btn--danger",
      text: "Restaurar desde archivo…",
      attrs: { type: "button" },
    });
    uploadBtn.addEventListener("click", () => uploadInput.click());
    uploadInput.addEventListener("change", () => {
      const file = uploadInput.files?.[0];
      uploadInput.value = "";
      if (!file) return;
      void runRestoreUpload(file, paintBackups);
    });
    restoreZone.append(
      el("div", {
        className: "row",
        children: [
          uploadBtn,
          el("span", { className: "muted tiny", text: ".db o .zip con imágenes" }),
        ],
      }),
      uploadInput,
    );
    backupCard.appendChild(restoreZone);

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
        className: "btn btn--danger",
        text: "Restaurar",
        attrs: { type: "button" },
      });
      restoreBtn.addEventListener("click", () => void runRestoreFile(item.file, paintBackups));
      li.append(dl, restoreBtn);
      list.appendChild(li);
    }
    backupCard.appendChild(list);
  };

  await paintBackups();
  renderDatosSection(parent);
}
