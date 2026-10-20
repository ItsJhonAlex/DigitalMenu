import qrcode from "qrcode-generator";

// UTF-8: SSID/contraseñas con acentos, ñ, emoji (p. ej. "Cañón ☕")
const utf8 = qrcode.stringToBytesFuncs["UTF-8"];
if (utf8) {
  qrcode.stringToBytes = utf8;
}

export type QrSvgOpts = {
  /** Color de módulos (#RRGGBB). Default negro. */
  fg?: string;
  /** Logo embebido como data URL (webp/png/jpeg). ~20% del QR. */
  logoDataUrl?: string | null;
};

function sanitizeHex(color: string | undefined, fallback: string): string {
  if (color && /^#[0-9a-fA-F]{6}$/.test(color.trim())) return color.trim().toLowerCase();
  return fallback;
}

export function makeQrSvg(payload: string, size = 300, opts: QrSvgOpts = {}): string {
  const withLogo = Boolean(opts.logoDataUrl);
  const qr = qrcode(0, withLogo ? "H" : "M");
  qr.addData(payload);
  qr.make();
  const cell = Math.max(2, Math.floor(size / (qr.getModuleCount() + 8)));
  let svg = qr.createSvgTag({ cellSize: cell, margin: 4, scalable: true });

  const fg = sanitizeHex(opts.fg, "#1e1b19");
  // qrcode-generator ya pone fill="black"; no duplicar el atributo (rompe <img>).
  svg = svg.replace(/<path\b([^>]*)\/>/g, (_m, attrs: string) => {
    const cleaned = attrs.replace(/\sfill="[^"]*"/gi, "");
    return `<path fill="${fg}"${cleaned}/>`;
  });

  if (opts.logoDataUrl) {
    const vb = svg.match(/viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/);
    const dim = vb ? Number(vb[1]) : size;
    const logoBox = dim * 0.22;
    const pad = logoBox * 0.12;
    const x = (dim - logoBox) / 2;
    const y = (dim - logoBox) / 2;
    const img = logoBox - pad * 2;
    const logo = opts.logoDataUrl.replace(/"/g, "");
    const overlay =
      `<rect x="${x}" y="${y}" width="${logoBox}" height="${logoBox}" rx="${logoBox * 0.12}" fill="white"/>` +
      `<image href="${logo}" x="${x + pad}" y="${y + pad}" width="${img}" height="${img}" preserveAspectRatio="xMidYMid meet"/>`;
    svg = svg.replace("</svg>", `${overlay}</svg>`);
  }

  return svg;
}
