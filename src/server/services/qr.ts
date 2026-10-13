import qrcode from "qrcode-generator";

export function makeQrSvg(payload: string, size = 300): string {
  const qr = qrcode(0, "M");
  qr.addData(payload);
  qr.make();
  const cell = Math.max(2, Math.floor(size / (qr.getModuleCount() + 8)));
  return qr.createSvgTag({ cellSize: cell, margin: 4, scalable: true });
}
