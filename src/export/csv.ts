import fs from "node:fs/promises";
import path from "node:path";
import { OrderItemRow } from "../types";

export const ORDER_ITEM_HEADERS: Array<keyof OrderItemRow> = [
  "order_id",
  "order_date",
  "order_status",
  "item_title",
  "asin_or_sku",
  "quantity",
  "item_price",
  "item_subtotal",
  "shipping_amount",
  "tax_amount",
  "discount_amount",
  "order_total",
  "payment_method_masked",
  "ship_to_city",
  "ship_to_state",
  "ship_to_country",
  "invoice_url",
  "order_detail_url",
  "currency",
  "source_marketplace",
  "exported_at"
];

function escapeCsvValue(value: string): string {
  if (value.includes(",") || value.includes("\n") || value.includes('"')) {
    return `"${value.replace(/"/g, '""')}"`;
  }

  return value;
}

function serializeValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  return escapeCsvValue(String(value));
}

export function buildCsv(rows: OrderItemRow[]): string {
  const lines: string[] = [];
  lines.push(ORDER_ITEM_HEADERS.join(","));

  for (const row of rows) {
    const line = ORDER_ITEM_HEADERS.map((header) => serializeValue(row[header])).join(",");
    lines.push(line);
  }

  return lines.join("\n");
}

export async function writeCsv(rows: OrderItemRow[], outputDir: string, filename: string): Promise<string> {
  await fs.mkdir(outputDir, { recursive: true });
  const filePath = path.join(outputDir, filename);
  await fs.writeFile(filePath, buildCsv(rows), "utf8");
  return filePath;
}
