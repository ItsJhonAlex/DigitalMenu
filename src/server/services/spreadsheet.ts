/**
 * CSV + XLSX mínimo (varias hojas) vía fflate — sin deps nativas.
 * Celdas en inlineStr para facilitar lectura/escritura.
 */
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

export type Sheet = { name: string; rows: string[][] };

/** Escape CSV (RFC-style). */
export function toCsv(rows: string[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const s = cell ?? "";
          if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
          return s;
        })
        .join(","),
    )
    .join("\r\n");
}

/** Parse CSV simple con comillas. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let i = 0;
  let inQuotes = false;
  const s = text.replace(/^\uFEFF/, "");
  while (i < s.length) {
    const ch = s[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          cur += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      cur += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ",") {
      row.push(cur);
      cur = "";
      i++;
      continue;
    }
    if (ch === "\r") {
      i++;
      continue;
    }
    if (ch === "\n") {
      row.push(cur);
      rows.push(row);
      row = [];
      cur = "";
      i++;
      continue;
    }
    cur += ch;
    i++;
  }
  if (cur.length > 0 || row.length > 0) {
    row.push(cur);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function colName(index0: number): string {
  let n = index0 + 1;
  let s = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function sheetXml(rows: string[][]): string {
  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>',
  ];
  rows.forEach((row, rIdx) => {
    const cells = row
      .map((val, cIdx) => {
        const ref = `${colName(cIdx)}${rIdx + 1}`;
        return `<c r="${ref}" t="inlineStr"><is><t>${xmlEscape(val ?? "")}</t></is></c>`;
      })
      .join("");
    lines.push(`<row r="${rIdx + 1}">${cells}</row>`);
  });
  lines.push("</sheetData></worksheet>");
  return lines.join("");
}

/** Genera un .xlsx (libro con varias hojas). */
export function buildXlsx(sheets: Sheet[]): Uint8Array {
  const safe = sheets.map((sh, i) => ({
    name: (sh.name || `Hoja${i + 1}`).replace(/[\\/*?:\[\]]/g, "_").slice(0, 31),
    rows: sh.rows,
  }));
  const contentTypes = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  ${safe.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}
</Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;
  const wbRels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${safe.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}
</Relationships>`;
  const workbook = `<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    ${safe.map((sh, i) => `<sheet name="${xmlEscape(sh.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}
  </sheets>
</workbook>`;

  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(contentTypes),
    "_rels/.rels": strToU8(rels),
    "xl/workbook.xml": strToU8(workbook),
    "xl/_rels/workbook.xml.rels": strToU8(wbRels),
  };
  safe.forEach((sh, i) => {
    files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXml(sh.rows));
  });
  return zipSync(files, { level: 6 });
}

function extractInlineCells(sheetXmlText: string): string[][] {
  const rows: string[][] = [];
  const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/gi;
  let rm: RegExpExecArray | null;
  while ((rm = rowRe.exec(sheetXmlText))) {
    const rowXml = rm[1] ?? "";
    const cells: Array<{ col: number; val: string }> = [];
    const cellRe = /<c\b([^>]*)>([\s\S]*?)<\/c>/gi;
    let cm: RegExpExecArray | null;
    while ((cm = cellRe.exec(rowXml))) {
      const attrs = cm[1] ?? "";
      const body = cm[2] ?? "";
      const refM = /\br="([A-Z]+)(\d+)"/.exec(attrs);
      let col = cells.length;
      if (refM?.[1]) {
        let n = 0;
        for (const ch of refM[1]) n = n * 26 + (ch.charCodeAt(0) - 64);
        col = n - 1;
      }
      let val = "";
      const inline = /<t[^>]*>([\s\S]*?)<\/t>/i.exec(body);
      if (inline) {
        val = decodeXml(inline[1] ?? "");
      } else {
        const v = /<v[^>]*>([\s\S]*?)<\/v>/i.exec(body);
        if (v) val = decodeXml(v[1] ?? "");
      }
      cells.push({ col, val });
    }
    cells.sort((a, b) => a.col - b.col);
    const max = cells.reduce((m, c) => Math.max(m, c.col), -1);
    const row: string[] = Array.from({ length: max + 1 }, () => "");
    for (const c of cells) row[c.col] = c.val;
    rows.push(row);
  }
  return rows;
}

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Lee .xlsx generado (o simple con inlineStr / valores). */
export function parseXlsx(buf: Uint8Array): Sheet[] {
  const files = unzipSync(buf);
  const wb = strFromU8(files["xl/workbook.xml"] ?? new Uint8Array());
  const rels = strFromU8(files["xl/_rels/workbook.xml.rels"] ?? new Uint8Array());
  const sheetMeta: Array<{ name: string; target: string }> = [];
  const sheetTag = /<sheet\b([^>]*)\/>/gi;
  let m: RegExpExecArray | null;
  while ((m = sheetTag.exec(wb))) {
    const attrs = m[1] ?? "";
    const name = /\bname="([^"]*)"/.exec(attrs)?.[1] ?? "Hoja";
    const rid = /\br:id="([^"]*)"/.exec(attrs)?.[1];
    if (!rid) continue;
    const rel = new RegExp(`Id="${rid}"[^>]*Target="([^"]+)"`).exec(rels);
    const target = rel?.[1]?.replace(/^\//, "") ?? "";
    const path = target.startsWith("xl/") ? target : `xl/${target}`;
    sheetMeta.push({ name: decodeXml(name), target: path });
  }
  return sheetMeta.map((sh) => {
    const xml = strFromU8(files[sh.target] ?? new Uint8Array());
    return { name: sh.name, rows: extractInlineCells(xml) };
  });
}

export function sheetsToCsvZip(sheets: Sheet[]): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  for (const sh of sheets) {
    const file = `${sh.name.replace(/[^\w\-]+/g, "_").toLowerCase()}.csv`;
    entries[file] = strToU8(`\uFEFF${toCsv(sh.rows)}`);
  }
  return zipSync(entries, { level: 6 });
}

export function parseCsvZip(buf: Uint8Array): Sheet[] {
  const files = unzipSync(buf);
  const out: Sheet[] = [];
  for (const [path, data] of Object.entries(files)) {
    if (!path.toLowerCase().endsWith(".csv")) continue;
    const name = path.split(/[/\\]/).pop()!.replace(/\.csv$/i, "");
    out.push({ name, rows: parseCsv(strFromU8(data)) });
  }
  return out;
}
