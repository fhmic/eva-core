import * as XLSX from "xlsx-js-style";
import PptxGenJS from "pptxgenjs";

export type SheetData = { name: string; rows: (string | number)[][] };

export async function parseWorkbook(file: File): Promise<SheetData[]> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  return wb.SheetNames.map((name) => ({
    name,
    rows: XLSX.utils.sheet_to_json<(string | number)[]>(wb.Sheets[name], {
      header: 1,
      blankrows: false,
      defval: "",
    }),
  }));
}

export function buildWorkbook(sheets: SheetData[]): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(sheet.rows);
    XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31) || "Sheet1");
  }
  return XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
}

const INK = "0B1622";
const CYAN = "22D3EE";
const ICE = "CBE9F5";

/** Compile a dataset into a dark, EVA-styled deck. */
export async function buildDeck(title: string, sheets: SheetData[]): Promise<Blob> {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_16x9";

  const cover = pptx.addSlide();
  cover.background = { color: INK };
  cover.addText(title, {
    x: 0.7,
    y: 2.0,
    w: 8.6,
    h: 1.2,
    fontSize: 48,
    bold: true,
    color: ICE,
    fontFace: "Georgia",
  });
  cover.addText("Compiled by EVA · Executive Virtual Assistant", {
    x: 0.7,
    y: 3.2,
    w: 8.6,
    fontSize: 18,
    color: CYAN,
    fontFace: "Calibri",
  });
  cover.addText(new Date().toLocaleDateString("en-GB", { dateStyle: "long" }), {
    x: 0.7,
    y: 4.9,
    w: 8.6,
    fontSize: 14,
    color: "7C93A6",
    fontFace: "Calibri",
  });

  for (const sheet of sheets) {
    const [header, ...body] = sheet.rows;
    if (!header) continue;
    const slide = pptx.addSlide();
    slide.background = { color: "F5F8FA" };
    slide.addText(sheet.name, {
      x: 0.5,
      y: 0.4,
      w: 9,
      fontSize: 40,
      bold: true,
      color: INK,
      fontFace: "Georgia",
    });
    slide.addShape(pptx.ShapeType.rect, { x: 0.5, y: 1.25, w: 0.9, h: 0.08, fill: { color: CYAN } });

    const rows = [
      header.map((cell) => ({
        text: String(cell),
        options: { bold: true, color: "FFFFFF", fill: { color: INK } },
      })),
      ...body.slice(0, 10).map((row) => row.map((cell) => ({ text: String(cell ?? "") }))),
    ];
    slide.addTable(rows, {
      x: 0.5,
      y: 1.6,
      w: 9,
      fontSize: 14,
      fontFace: "Calibri",
      color: "1B2A33",
      border: { type: "solid", color: "D6E2E9", pt: 1 },
      autoPage: false,
    });

    if (body.length > 10) {
      slide.addText(`+ ${body.length - 10} further rows in the source workbook`, {
        x: 0.5,
        y: 5.05,
        w: 9,
        fontSize: 13,
        italic: true,
        color: "6B8494",
        fontFace: "Calibri",
      });
    }
  }

  const closing = pptx.addSlide();
  closing.background = { color: INK };
  closing.addText("Awaiting your direction, Felix.", {
    x: 0.7,
    y: 2.4,
    w: 8.6,
    fontSize: 36,
    bold: true,
    color: ICE,
    fontFace: "Georgia",
  });

  return (await pptx.write({ outputType: "blob" })) as Blob;
}
