/** Compresión de imágenes en el navegador → WebP (RF-20). */

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No se pudo leer la imagen"));
    };
    img.src = url;
  });
}

async function toWebp(img: HTMLImageElement, maxSide: number, quality: number): Promise<Blob> {
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas no disponible");
  ctx.drawImage(img, 0, 0, w, h);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/webp", quality),
  );
  if (!blob) throw new Error("No se pudo generar WebP (pruebe otro navegador/Edge)");
  return blob;
}

export type CompressedPair = {
  large: File;
  thumb: File;
  note: string;
};

export async function prepareProductImages(file: File): Promise<CompressedPair> {
  const img = await loadImage(file);
  const largeBlob = await toWebp(img, 1000, 0.75);
  const thumbBlob = await toWebp(img, 400, 0.72);
  const base = file.name.replace(/\.[^.]+$/, "") || "foto";
  const large = new File([largeBlob], `${base}.webp`, { type: "image/webp" });
  const thumb = new File([thumbBlob], `${base}_t.webp`, { type: "image/webp" });
  const fromKb = (file.size / 1024).toFixed(0);
  const toKb = (largeBlob.size / 1024).toFixed(0);
  return {
    large,
    thumb,
    note: `${fromKb} KB → ${toKb} KB (WebP)`,
  };
}

export async function uploadProductImage(file: File): Promise<{ image: string; note: string }> {
  const pair = await prepareProductImages(file);
  const form = new FormData();
  form.append("large", pair.large);
  form.append("thumb", pair.thumb);
  const res = await fetch("/api/admin/images", { method: "POST", body: form });
  if (!res.ok) {
    let msg = `Error al subir (${res.status})`;
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      if (body.error?.message) msg = body.error.message;
    } catch {
      // ignore
    }
    throw new Error(msg);
  }
  const data = (await res.json()) as { image: string };
  return { image: data.image, note: pair.note };
}
