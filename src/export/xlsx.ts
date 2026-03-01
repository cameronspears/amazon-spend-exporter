import fs from "node:fs/promises";
import path from "node:path";
import * as XLSX from "xlsx";
import { ExportRunMeta, OrderItemRow } from "../types";

function buildMetaRows(meta: ExportRunMeta): Array<{ key: string; value: string | number }> {
  return [
    { key: "from", value: meta.from },
    { key: "to", value: meta.to },
    { key: "generatedAt", value: meta.generatedAt },
    { key: "totalOrders", value: meta.totalOrders },
    { key: "totalItems", value: meta.totalItems },
    { key: "warningsCount", value: meta.warnings.length },
    { key: "warnings", value: meta.warnings.join(" | ") }
  ];
}

export async function writeXlsx(
  rows: OrderItemRow[],
  meta: ExportRunMeta,
  outputDir: string,
  filename: string
): Promise<string> {
  await fs.mkdir(outputDir, { recursive: true });
  const filePath = path.join(outputDir, filename);

  const workbook = XLSX.utils.book_new();
  const itemsSheet = XLSX.utils.json_to_sheet(rows);
  const metaSheet = XLSX.utils.json_to_sheet(buildMetaRows(meta));

  XLSX.utils.book_append_sheet(workbook, itemsSheet, "items");
  XLSX.utils.book_append_sheet(workbook, metaSheet, "meta");

  XLSX.writeFile(workbook, filePath);
  return filePath;
}
