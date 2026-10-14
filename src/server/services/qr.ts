import qrcode from "qrcode-generator";

// UTF-8: SSID/contraseñas con acentos, ñ, emoji (p. ej. "Cañón ☕")
const utf8 = qrcode.stringToBytesFuncs["UTF-8"];
if (utf8) {
  qrcode.stringToBytes = utf8;
}

export function makeQrSvg(payload: string, size = 300): string {
  const qr = qrcode(0, "M");
  qr.addData(payload);
  qr.make();
  const cell = Math.max(2, Math.floor(size / (qr.getModuleCount() + 8)));
  return qr.createSvgTag({ cellSize: cell, margin: 4, scalable: true });
}
