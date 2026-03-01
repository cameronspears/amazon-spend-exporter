import fs from "node:fs/promises";
import path from "node:path";
import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import { Page } from "playwright";
import { parseDateFromText } from "../normalize/date";
import { parseMoney } from "../normalize/money";
import { Logger, OrderDetailParseResult, OrderRef, ParsedOrderItem } from "../types";
import { navigateWithBackoff } from "../browser/session";
import { AMAZON_COM_SELECTORS } from "./selectors.amazon-com";

function normalizeSpace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function normalizeKey(input: string): string {
  return normalizeSpace(input).toLowerCase();
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function firstTextBySelectors($: cheerio.CheerioAPI, selectors: string[]): string | null {
  for (const selector of selectors) {
    try {
      const value = normalizeSpace($(selector).first().text());
      if (value) {
        return value;
      }
    } catch {
      continue;
    }
  }

  return null;
}

function extractOrderId(text: string, pageUrl: string): string | null {
  const idMatch = normalizeSpace(text).match(
    /(?:Order(?:\s*(?:#|number))?|ORDER\s*#|Order ID)\s*[:#]?\s*([0-9]{3}-[0-9]{7}-[0-9]{7}|[0-9-]{8,})/i
  );
  if (idMatch) {
    return idMatch[1];
  }

  const fromUrl = pageUrl.match(/(?:orderID|orderId)=([0-9-]{8,})/i);
  return fromUrl ? fromUrl[1] : null;
}

function sanitizePaymentMethod(input: string | null): string | null {
  if (!input) {
    return null;
  }

  return input.replace(/\b\d{5,}\b/g, (match) => `****${match.slice(-4)}`);
}

function extractAmountByLabel(bodyText: string, labels: string[]): { amount: number | null; currency: string | null } {
  for (const label of labels) {
    const regex = new RegExp(
      `${escapeRegExp(label)}[\\s\\S]{0,80}?([(-]?[\\$€£¥]?\\s*\\d[\\d,]*(?:\\.\\d{2})?\\)?)`,
      "i"
    );

    const match = bodyText.match(regex);
    if (!match) {
      continue;
    }

    const parsed = parseMoney(match[1]);
    if (parsed.amount !== null) {
      return parsed;
    }
  }

  return { amount: null, currency: null };
}

function parseAddress(addressBlock: string | null): {
  city: string | null;
  state: string | null;
  country: string | null;
} {
  if (!addressBlock) {
    return { city: null, state: null, country: null };
  }

  const lines = addressBlock
    .split(/\n+/)
    .map((line) => normalizeSpace(line))
    .filter(Boolean)
    .filter((line) => !line.toLowerCase().includes("shipping address"));

  let city: string | null = null;
  let state: string | null = null;
  let country: string | null = null;

  for (const line of lines) {
    const cityStateMatch = line.match(/^(.+?),\s*([A-Z]{2})\b/);
    if (cityStateMatch) {
      city = cityStateMatch[1];
      state = cityStateMatch[2];
    }
  }

  if (lines.length > 0) {
    const last = lines[lines.length - 1];
    if (!/\d{5}/.test(last) || /[A-Za-z]{3,}/.test(last)) {
      country = last;
    }
  }

  if (!country && state) {
    country = "United States";
  }

  return { city, state, country };
}

function extractAsinOrSku($: cheerio.CheerioAPI, scope: cheerio.Cheerio<AnyNode>): string | null {
  const hrefs = scope
    .find("a")
    .toArray()
    .map((anchor) => $(anchor).attr("href") ?? "");

  for (const href of hrefs) {
    const dpMatch = href.match(/\/dp\/([A-Z0-9]{10})/i);
    if (dpMatch) {
      return dpMatch[1].toUpperCase();
    }

    const gpProductMatch = href.match(/\/gp\/product\/([A-Z0-9]{10})/i);
    if (gpProductMatch) {
      return gpProductMatch[1].toUpperCase();
    }
  }

  const text = normalizeSpace(scope.text());
  const asinTextMatch = text.match(/ASIN\s*[:#]?\s*([A-Z0-9]{10})/i);
  return asinTextMatch ? asinTextMatch[1].toUpperCase() : null;
}

function parseItem($: cheerio.CheerioAPI, scope: cheerio.Cheerio<AnyNode>): ParsedOrderItem | null {
  const title =
    normalizeSpace(scope.find("a.product-title").first().text()) ||
    normalizeSpace(scope.find("span.a-truncate-cut").first().text()) ||
    normalizeSpace(scope.find("a[href*='/dp/']").first().text()) ||
    normalizeSpace(scope.find("h4").first().text());

  if (!title) {
    return null;
  }

  const quantityText =
    normalizeSpace(scope.find("span.quantity").first().text()) ||
    normalizeSpace(scope.find("span:contains('Qty')").first().text()) ||
    normalizeSpace(scope.find("span:contains('Quantity')").first().text()) ||
    normalizeSpace(scope.text());

  const quantityMatch = quantityText.match(/(?:Qty|Quantity)\s*[:]?\s*(\d+)/i);
  const quantity = quantityMatch ? Number(quantityMatch[1]) : 1;

  const itemPriceText =
    normalizeSpace(scope.find("span.item-price").first().text()) ||
    normalizeSpace(scope.find("span.a-size-medium.a-color-price").first().text()) ||
    normalizeSpace(scope.text().match(/Item\s*price\s*[:]?\s*([(-]?[\$€£¥]?\s*\d[\d,]*(?:\.\d{2})?\)?)/i)?.[1] ?? "");

  const itemSubtotalText =
    normalizeSpace(scope.find("span.item-subtotal").first().text()) ||
    normalizeSpace(scope.text().match(/Subtotal\s*[:]?\s*([(-]?[\$€£¥]?\s*\d[\d,]*(?:\.\d{2})?\)?)/i)?.[1] ?? "");

  const itemPrice = parseMoney(itemPriceText).amount;
  const itemSubtotal = parseMoney(itemSubtotalText).amount;

  return {
    itemTitle: title,
    asinOrSku: extractAsinOrSku($, scope),
    quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
    itemPrice,
    itemSubtotal
  };
}

function isLikelyPaymentArtifact(item: ParsedOrderItem, scopeText: string): boolean {
  const title = normalizeKey(item.itemTitle);
  const context = normalizeKey(scopeText);

  if (
    title.includes("amazon secured card") ||
    title.includes("amazon store card") ||
    title.includes("prime visa")
  ) {
    return true;
  }

  if (
    context.includes("payment method") ||
    context.includes("card ending in") ||
    context.includes("ending in")
  ) {
    return true;
  }

  return false;
}

function dedupeParsedItems(items: ParsedOrderItem[]): ParsedOrderItem[] {
  const seen = new Set<string>();
  const deduped: ParsedOrderItem[] = [];

  for (const item of items) {
    const key = [
      normalizeKey(item.itemTitle),
      item.asinOrSku ?? "",
      String(item.quantity),
      item.itemPrice ?? "",
      item.itemSubtotal ?? ""
    ].join("|");

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(item);
  }

  return deduped;
}

function collectItemContainers($: cheerio.CheerioAPI): AnyNode[] {
  const containers = new Set<AnyNode>();

  for (const selector of AMAZON_COM_SELECTORS.orderDetail.itemContainers) {
    $(selector).each((_, element) => {
      containers.add(element);
    });

    if (containers.size > 0) {
      break;
    }
  }

  return Array.from(containers);
}

function parseItems($: cheerio.CheerioAPI): ParsedOrderItem[] {
  const items: ParsedOrderItem[] = [];

  for (const container of collectItemContainers($)) {
    const scope = $(container);
    const item = parseItem($, scope);
    if (item && !isLikelyPaymentArtifact(item, scope.text())) {
      items.push(item);
    }
  }

  if (items.length > 0) {
    return dedupeParsedItems(items);
  }

  // Fallback path when normal item containers were not found.
  $("a[href*='/dp/'], a[href*='/gp/product/']").each((_, anchor) => {
    const title = normalizeSpace($(anchor).text());
    if (!title) {
      return;
    }

    const scope = $(anchor).closest("div");
    const item = parseItem($, scope);
    if (item && !isLikelyPaymentArtifact(item, scope.text())) {
      items.push(item);
    }
  });

  return dedupeParsedItems(items);
}

export function parseOrderDetailHtml(html: string, pageUrl: string): OrderDetailParseResult {
  const $ = cheerio.load(html);
  const bodyText = normalizeSpace($("body").text());
  const warnings: string[] = [];

  const orderId = extractOrderId(bodyText, pageUrl);
  const orderDate = parseDateFromText(bodyText);
  const orderStatus = firstTextBySelectors($, AMAZON_COM_SELECTORS.orderDetail.status);
  const paymentMethodMasked = sanitizePaymentMethod(
    firstTextBySelectors($, AMAZON_COM_SELECTORS.orderDetail.paymentMethod)
  );

  const shippingBlock = firstTextBySelectors($, AMAZON_COM_SELECTORS.orderDetail.shippingAddress);
  const address = parseAddress(shippingBlock);

  const shippingAmount = extractAmountByLabel(bodyText, ["Shipping & handling", "Shipping"]);
  const taxAmount = extractAmountByLabel(bodyText, ["Tax collected", "Estimated tax", "Tax"]);
  const discountAmount = extractAmountByLabel(bodyText, ["Discount", "Promotion", "Savings"]);
  const orderTotal = extractAmountByLabel(bodyText, ["Order total", "Grand total", "Total"]);

  const currency =
    orderTotal.currency ?? shippingAmount.currency ?? taxAmount.currency ?? discountAmount.currency ?? "USD";

  const invoiceAnchor = $("a")
    .toArray()
    .find((anchor) => {
      const href = $(anchor).attr("href") ?? "";
      const text = normalizeSpace($(anchor).text()).toLowerCase();
      return href.includes("invoice") || text.includes("invoice") || text.includes("print order");
    });

  const invoiceUrl = invoiceAnchor
    ? new URL($(invoiceAnchor).attr("href") ?? "", pageUrl).toString()
    : null;

  const items = parseItems($);

  if (!orderId) {
    warnings.push("Order ID was not detected on order detail page.");
  }

  if (!orderDate) {
    warnings.push("Order date was not detected on order detail page.");
  }

  if (items.length === 0) {
    warnings.push("No purchasable items found on order detail page.");
  }

  return {
    orderId,
    orderDate,
    orderStatus,
    paymentMethodMasked,
    shipToCity: address.city,
    shipToState: address.state,
    shipToCountry: address.country,
    shippingAmount: shippingAmount.amount,
    taxAmount: taxAmount.amount,
    discountAmount: discountAmount.amount,
    orderTotal: orderTotal.amount,
    currency,
    invoiceUrl,
    items,
    warnings
  };
}

async function writeDebugSnapshot(debugDir: string, orderId: string, html: string): Promise<void> {
  await fs.mkdir(debugDir, { recursive: true });
  const safeOrderId = orderId.replace(/[^a-zA-Z0-9-]/g, "_");
  const filePath = path.join(debugDir, `${safeOrderId}.html`);
  await fs.writeFile(filePath, html, "utf8");
}

export async function scrapeOrderDetail(
  page: Page,
  order: OrderRef,
  logger: Logger,
  options?: {
    debugDir?: string;
  }
): Promise<OrderDetailParseResult> {
  await navigateWithBackoff(page, order.detailUrl, logger);
  const html = await page.content();
  const parsed = parseOrderDetailHtml(html, page.url());

  const effectiveOrderId = parsed.orderId ?? order.orderId;
  const effectiveOrderDate = parsed.orderDate ?? order.orderDate;

  const result: OrderDetailParseResult = {
    ...parsed,
    orderId: effectiveOrderId,
    orderDate: effectiveOrderDate
  };

  if (result.items.length === 0 && options?.debugDir) {
    logger.warn("empty_order_items_debug_snapshot", { orderId: effectiveOrderId });
    await writeDebugSnapshot(options.debugDir, effectiveOrderId, html);
  }

  return result;
}
