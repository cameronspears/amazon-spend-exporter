import fs from "node:fs/promises";
import path from "node:path";
import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import { Page } from "playwright";
import { ExportConfig } from "../config";
import { isDateInRange, parseDateFromText } from "../normalize/date";
import { Logger, OrderRef } from "../types";
import { navigateWithBackoff } from "../browser/session";
import { AMAZON_COM_ORDERS_URL, AMAZON_COM_SELECTORS } from "./selectors.amazon-com";

export interface ParsedOrderListPage {
  orders: OrderRef[];
  nextPageUrl: string | null;
  warnings: string[];
}

export interface ScrapedOrderListResult {
  orders: OrderRef[];
  pagesVisited: number;
  warnings: string[];
}

interface DomOrderCandidate {
  href: string | null;
  dataOrderId: string | null;
  contextText: string;
}

interface DomExtractionResult {
  orders: OrderRef[];
  warnings: string[];
  diagnostics: {
    anchorCandidates: number;
    dataOrderCandidates: number;
    derivedOrders: number;
  };
}

interface SeedHistoryUrl {
  url: string;
  label: string;
}

interface DomPayload {
  anchorCandidates: DomOrderCandidate[];
  dataOrderCandidates: DomOrderCandidate[];
}

function normalizeSpace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function absolutizeUrl(href: string, baseUrl: string): string {
  return new URL(href, baseUrl).toString();
}

function isOrderDetailLikeHref(href: string): boolean {
  const normalizedHref = href.toLowerCase();
  return AMAZON_COM_SELECTORS.ordersList.detailLinkContains.some((fragment) =>
    normalizedHref.includes(fragment.toLowerCase())
  );
}

function extractOrderIdFromDetailUrl(detailUrl: string): string | null {
  const fromQuery = detailUrl.match(/[?&](?:orderID|orderId)=([0-9-]{8,})/i);
  if (fromQuery) {
    return fromQuery[1];
  }

  const fromPath = detailUrl.match(/order-details(?:\/|[^a-zA-Z0-9]+)([0-9-]{8,})/i);
  return fromPath ? fromPath[1] : null;
}

function buildDetailUrlFromOrderId(orderId: string): string {
  return `https://www.amazon.com/gp/your-account/order-details?orderID=${encodeURIComponent(orderId)}`;
}

function extractYear(isoDate: string): number {
  return Number(isoDate.slice(0, 4));
}

export function buildSeedOrderHistoryUrls(fromIso: string, toIso: string): SeedHistoryUrl[] {
  const fromYear = extractYear(fromIso);
  const toYear = extractYear(toIso);

  const seeds: SeedHistoryUrl[] = [];
  for (let year = toYear; year >= fromYear; year -= 1) {
    seeds.push({
      url: `${AMAZON_COM_ORDERS_URL}&orderFilter=year-${year}`,
      label: `fallback-year-${year}`
    });
    seeds.push({
      url: `${AMAZON_COM_ORDERS_URL}&timeFilter=year-${year}`,
      label: `fallback-time-year-${year}`
    });
  }

  return seeds;
}

interface OrdersListPageMeta {
  totalOrders: number | null;
  selectedFilter: string | null;
  startIndex: number;
}

function buildSyntheticNextPageUrl(currentUrl: string, meta: OrdersListPageMeta): string | null {
  if (meta.totalOrders === null) {
    return null;
  }

  const nextStartIndex = meta.startIndex + 10;
  if (nextStartIndex >= meta.totalOrders) {
    return null;
  }

  const nextUrl = new URL(currentUrl);
  nextUrl.searchParams.set("startIndex", String(nextStartIndex));
  nextUrl.searchParams.delete("ref_");
  return nextUrl.toString();
}

function discoverYearSeedUrlsFromHtml(
  html: string,
  baseUrl: string,
  fromIso: string,
  toIso: string
): SeedHistoryUrl[] {
  const fromYear = extractYear(fromIso);
  const toYear = extractYear(toIso);
  const $ = cheerio.load(html);
  const discovered = new Map<string, SeedHistoryUrl>();

  const addSeed = (url: string, label: string): void => {
    if (!discovered.has(url)) {
      discovered.set(url, { url, label });
    }
  };

  const yearPattern = /year-(\d{4})/i;
  const base = new URL(baseUrl);

  const materializeFilterValue = (filterValue: string): string => {
    const candidate = new URL(base.toString());
    if (candidate.searchParams.has("timeFilter")) {
      candidate.searchParams.set("timeFilter", filterValue);
    } else {
      candidate.searchParams.set("orderFilter", filterValue);
    }
    candidate.searchParams.delete("startIndex");
    candidate.searchParams.delete("ref_");
    return candidate.toString();
  };

  $("a[href], option[value]").each((_, element) => {
    const href = $(element).attr("href");
    const value = $(element).attr("value");
    const source = href ?? value ?? "";

    const match = source.match(yearPattern);
    if (!match) {
      return;
    }

    const year = Number(match[1]);
    if (!Number.isFinite(year) || year < fromYear || year > toYear) {
      return;
    }

    let url: string;
    if (/^https?:\/\//i.test(source) || source.startsWith("/") || source.startsWith("?")) {
      url = absolutizeUrl(source, baseUrl);
    } else if (source.toLowerCase().startsWith("year-")) {
      url = materializeFilterValue(source);
    } else {
      return;
    }

    try {
      const normalized = new URL(url);
      normalized.searchParams.delete("startIndex");
      normalized.searchParams.delete("ref_");
      addSeed(normalized.toString(), `discovered-year-${year}`);
    } catch {
      return;
    }
  });

  return Array.from(discovered.values()).sort((a, b) => b.label.localeCompare(a.label));
}

function extractOrderId(text: string): string | null {
  const normalized = normalizeSpace(text);
  const match = normalized.match(
    /(?:Order(?:\s*(?:#|number))?|ORDER\s*#|Order ID)\s*[:#]?\s*([0-9]{3}-[0-9]{7}-[0-9]{7}|[0-9-]{8,})/i
  );
  if (!match) {
    return null;
  }

  return match[1];
}

function extractDate(text: string): string | null {
  const normalized = normalizeSpace(text);

  const contextualMatch = normalized.match(
    /(?:Ordered on|Order placed|ORDER PLACED)\s*[:]?\s*([A-Za-z]+\s+\d{1,2},\s+\d{4}|\d{1,2}\/\d{1,2}\/\d{4})/i
  );
  if (contextualMatch) {
    return parseDateFromText(contextualMatch[1]);
  }

  return parseDateFromText(normalized);
}

function safeSelect($: cheerio.CheerioAPI, selector: string): cheerio.Cheerio<AnyNode> {
  try {
    return $(selector);
  } catch {
    return $([]) as cheerio.Cheerio<AnyNode>;
  }
}

function getOrderDetailAnchors($: cheerio.CheerioAPI): AnyNode[] {
  return $("a")
    .toArray()
    .filter((anchor) => {
      const href = $(anchor).attr("href") ?? "";
      const text = normalizeSpace($(anchor).text()).toLowerCase();
      const hrefMatch = isOrderDetailLikeHref(href);
      return hrefMatch || text.includes("order details") || text.includes("view order");
    });
}

function getBestOrderContainer($: cheerio.CheerioAPI, anchor: AnyNode): cheerio.Cheerio<AnyNode> {
  const dataOrderContainer = $(anchor).closest("[data-order-id]").first();
  if (dataOrderContainer.length > 0) {
    return dataOrderContainer;
  }

  const semanticContainer = $(anchor).closest("div.order-card, div.a-box-group, div.js-order-card").first();
  if (semanticContainer.length > 0) {
    return semanticContainer;
  }

  return $(anchor).closest("div").first();
}

function extractDetailUrl(
  $: cheerio.CheerioAPI,
  scope: cheerio.Cheerio<AnyNode>,
  baseUrl: string
): string | null {
  const anchors = scope.find("a").toArray();
  const match = anchors.find((anchor) => {
    const href = $(anchor).attr("href") ?? "";
    const text = normalizeSpace($(anchor).text()).toLowerCase();

    const hrefMatch = isOrderDetailLikeHref(href);
    return hrefMatch || text.includes("order details") || text.includes("view order");
  });

  if (!match) {
    return null;
  }

  const href = $(match).attr("href");
  if (!href) {
    return null;
  }

  return absolutizeUrl(href, baseUrl);
}

function getOrderCardNodes($: cheerio.CheerioAPI): AnyNode[] {
  const uniqueNodes = new Set<AnyNode>();

  for (const selector of AMAZON_COM_SELECTORS.ordersList.orderCards) {
    safeSelect($, selector).each((_, element) => {
      uniqueNodes.add(element);
    });

    if (uniqueNodes.size > 0) {
      break;
    }
  }

  if (uniqueNodes.size > 0) {
    return Array.from(uniqueNodes);
  }

  // Fallback: find parent nodes around links that look like order details links.
  const fallbackNodes = new Set<AnyNode>();
  $("a").each((_, anchor) => {
    const href = $(anchor).attr("href") ?? "";
    if (!isOrderDetailLikeHref(href)) {
      return;
    }

    const node = $(anchor).closest("div").first().get(0);
    if (node) {
      fallbackNodes.add(node);
    }
  });

  return Array.from(fallbackNodes);
}

function extractNextPageUrl($: cheerio.CheerioAPI, baseUrl: string): string | null {
  for (const selector of AMAZON_COM_SELECTORS.ordersList.nextPageLinks) {
    const candidate = safeSelect($, selector).first();
    const href = candidate.attr("href");
    if (href) {
      return absolutizeUrl(href, baseUrl);
    }
  }

  const fallback = $("a")
    .toArray()
    .find((anchor) => {
      const text = normalizeSpace($(anchor).text()).toLowerCase();
      const ariaLabel = ($(anchor).attr("aria-label") ?? "").toLowerCase();
      return text === "next" || ariaLabel.includes("next");
    });

  if (!fallback) {
    return null;
  }

  const href = $(fallback).attr("href");
  return href ? absolutizeUrl(href, baseUrl) : null;
}

function parseOrdersFromAnchors(html: string, baseUrl: string): { orders: OrderRef[]; warnings: string[] } {
  const $ = cheerio.load(html);
  const warnings: string[] = [];
  const orders: OrderRef[] = [];
  const anchors = getOrderDetailAnchors($);

  for (const anchor of anchors) {
    const href = $(anchor).attr("href");
    if (!href) {
      continue;
    }

    const detailUrl = absolutizeUrl(href, baseUrl);
    const scope = getBestOrderContainer($, anchor);
    const scopeText = normalizeSpace(scope.text());

    const orderId =
      scope.attr("data-order-id") ?? extractOrderIdFromDetailUrl(detailUrl) ?? extractOrderId(scopeText);

    const candidateTexts = [scopeText];
    const parentText = normalizeSpace(scope.parent().text());
    if (parentText) {
      candidateTexts.push(parentText);
    }

    const orderDate =
      candidateTexts.map((text) => extractDate(text)).find((candidate) => candidate !== null) ?? null;

    if (!orderId || !orderDate) {
      continue;
    }

    orders.push({ orderId, orderDate, detailUrl });
  }

  return {
    orders: dedupeOrderRefs(orders),
    warnings
  };
}

function parseOrdersFromTextBlocks(html: string): OrderRef[] {
  const $ = cheerio.load(html);
  const text = normalizeSpace($.root().text());
  const pattern =
    /ORDER\s*PLACED\s*([A-Za-z]+\s+\d{1,2},\s+\d{4}|\d{1,2}\/\d{1,2}\/\d{4})[\s\S]{0,450}?ORDER\s*#\s*([0-9]{3}-[0-9]{7}-[0-9]{7})/gi;
  const orders: OrderRef[] = [];

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const orderDate = parseDateFromText(match[1]);
    const orderId = match[2];
    if (!orderDate || !orderId) {
      continue;
    }

    orders.push({
      orderId,
      orderDate,
      detailUrl: buildDetailUrlFromOrderId(orderId)
    });
  }

  return dedupeOrderRefs(orders);
}

function buildOrderRefsFromCandidates(candidates: DomOrderCandidate[], baseUrl: string): DomExtractionResult {
  const warnings: string[] = [];
  const orders: OrderRef[] = [];

  for (const candidate of candidates) {
    const detailUrl = candidate.href ? absolutizeUrl(candidate.href, baseUrl) : null;
    const inferredOrderIdFromUrl = detailUrl ? extractOrderIdFromDetailUrl(detailUrl) : null;
    const orderId = candidate.dataOrderId ?? inferredOrderIdFromUrl ?? extractOrderId(candidate.contextText);
    const orderDate = extractDate(candidate.contextText);

    let finalDetailUrl = detailUrl ?? (orderId ? buildDetailUrlFromOrderId(orderId) : null);
    if (orderId && inferredOrderIdFromUrl && inferredOrderIdFromUrl !== orderId) {
      finalDetailUrl = buildDetailUrlFromOrderId(orderId);
    }

    if (!orderId || !orderDate || !finalDetailUrl) {
      continue;
    }

    orders.push({
      orderId,
      orderDate,
      detailUrl: finalDetailUrl
    });
  }

  const deduped = dedupeOrderRefs(orders);
  return {
    orders: deduped,
    warnings,
    diagnostics: {
      anchorCandidates: 0,
      dataOrderCandidates: 0,
      derivedOrders: deduped.length
    }
  };
}

async function extractOrderRefsFromDom(page: Page): Promise<DomExtractionResult> {
  const detailFragments = AMAZON_COM_SELECTORS.ordersList.detailLinkContains.map((fragment) =>
    fragment.toLowerCase()
  );
  const script = `
    (() => {
      const detailFragments = ${JSON.stringify(detailFragments)};
      const normalize = (input) => String(input ?? "").replace(/\\s+/g, " ").trim();

      const anchorCandidates = [];
      for (const anchor of Array.from(document.querySelectorAll("a[href]"))) {
        const hrefRaw = anchor.getAttribute("href") ?? "";
        const hrefLower = hrefRaw.toLowerCase();
        const text = normalize(anchor.textContent ?? "");
        const textLower = text.toLowerCase();
        const hrefMatch = detailFragments.some((fragment) => hrefLower.includes(fragment));
        const textMatch = textLower.includes("order details") || textLower.includes("view order");
        if (!hrefMatch && !textMatch) {
          continue;
        }

        let node = anchor;
        let dataOrderId = null;
        let contextText = "";
        for (let depth = 0; depth < 8 && node; depth += 1) {
          if (!dataOrderId) {
            dataOrderId = node.getAttribute("data-order-id");
          }
          const nodeText = normalize(node.textContent ?? "");
          if (nodeText.length > contextText.length) {
            contextText = nodeText;
          }
          node = node.parentElement;
        }

        anchorCandidates.push({
          href: anchor.href || hrefRaw || null,
          dataOrderId,
          contextText
        });
      }

      const dataOrderCandidates = [];
      for (const container of Array.from(document.querySelectorAll("[data-order-id]"))) {
        const dataOrderId = container.getAttribute("data-order-id");
        const link = container.querySelector("a[href]");
        dataOrderCandidates.push({
          href: (link && link.href) || (link && link.getAttribute("href")) || null,
          dataOrderId,
          contextText: normalize(container.textContent ?? "")
        });
      }

      return { anchorCandidates, dataOrderCandidates };
    })()
  `;
  const domPayload = (await page.evaluate(script)) as DomPayload;

  const combined = [...domPayload.anchorCandidates, ...domPayload.dataOrderCandidates];
  const extracted = buildOrderRefsFromCandidates(combined, page.url());

  return {
    ...extracted,
    diagnostics: {
      anchorCandidates: domPayload.anchorCandidates.length,
      dataOrderCandidates: domPayload.dataOrderCandidates.length,
      derivedOrders: extracted.orders.length
    }
  };
}

async function inspectOrderFilterControls(page: Page): Promise<{
  selectControls: Array<{ name: string | null; id: string | null; options: string[] }>;
  yearLinks: string[];
}> {
  return page.evaluate(() => {
    const selectControls = Array.from(document.querySelectorAll("select")).map((select) => {
      const options = Array.from(select.querySelectorAll("option")).map((option) =>
        `${option.getAttribute("value") ?? ""}|${(option.textContent ?? "").trim()}`
      );
      return {
        name: select.getAttribute("name"),
        id: select.getAttribute("id"),
        options: options.slice(0, 30)
      };
    });

    const yearLinks = Array.from(document.querySelectorAll("a[href]"))
      .map((anchor) => anchor.getAttribute("href") ?? "")
      .filter((href) => /year-\d{4}|orderfilter|timefilter/i.test(href))
      .slice(0, 50);

    return { selectControls, yearLinks };
  });
}

async function trySelectTimeFilterValue(
  page: Page,
  filterValue: string,
  logger: Logger
): Promise<boolean> {
  const select = page.locator("#time-filter, select[name='timeFilter']").first();
  if ((await select.count()) === 0) {
    return false;
  }

  const values = await select.evaluate((element) =>
    Array.from((element as HTMLSelectElement).options).map((option) => option.value)
  );

  if (!values.includes(filterValue)) {
    return false;
  }

  logger.info("selecting_time_filter", { filterValue });
  await Promise.all([
    page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined),
    select.selectOption(filterValue)
  ]);
  await page.waitForTimeout(1200);
  return true;
}

async function inspectOrdersListPageMeta(page: Page): Promise<OrdersListPageMeta> {
  return page.evaluate(() => {
    const normalize = (input: string): string => input.replace(/\s+/g, " ").trim();
    const bodyText = normalize(document.body.innerText || "");
    const countMatch = bodyText.match(/([0-9,]+)\s+orders?\s+placed\s+in/i);
    const parsedCount = countMatch ? Number(countMatch[1].replace(/,/g, "")) : null;

    const select =
      (document.querySelector("#time-filter") as HTMLSelectElement | null) ??
      (document.querySelector("select[name='timeFilter']") as HTMLSelectElement | null);

    const url = new URL(window.location.href);
    const startIndex = Number(url.searchParams.get("startIndex") ?? "0");

    return {
      totalOrders: parsedCount !== null && Number.isFinite(parsedCount) ? parsedCount : null,
      selectedFilter: select?.value ?? null,
      startIndex: Number.isFinite(startIndex) ? startIndex : 0
    };
  });
}

export function dedupeOrderRefs(refs: OrderRef[]): OrderRef[] {
  const seen = new Set<string>();
  const deduped: OrderRef[] = [];

  for (const ref of refs) {
    if (seen.has(ref.orderId)) {
      continue;
    }

    seen.add(ref.orderId);
    deduped.push(ref);
  }

  return deduped;
}

export function parseOrderListHtml(html: string, baseUrl: string): ParsedOrderListPage {
  const $ = cheerio.load(html);
  const textBlockOrders = parseOrdersFromTextBlocks(html);
  const anchorFirst = parseOrdersFromAnchors(html, baseUrl);
  if (anchorFirst.orders.length > 0) {
    return {
      orders: dedupeOrderRefs([...anchorFirst.orders, ...textBlockOrders]),
      nextPageUrl: extractNextPageUrl($, baseUrl),
      warnings: anchorFirst.warnings
    };
  }

  const warnings: string[] = [...anchorFirst.warnings];
  const orders: OrderRef[] = [];
  for (const node of getOrderCardNodes($)) {
    const scope = $(node);
    const text = normalizeSpace(scope.text());

    const detailUrl = extractDetailUrl($, scope, baseUrl);
    const orderId =
      scope.attr("data-order-id") ??
      (detailUrl ? extractOrderIdFromDetailUrl(detailUrl) : null) ??
      extractOrderId(text);
    const orderDate = extractDate(text);

    if (!orderId || !orderDate || !detailUrl) {
      continue;
    }

    orders.push({ orderId, orderDate, detailUrl });
  }

  return {
    orders: dedupeOrderRefs([...orders, ...textBlockOrders]),
    nextPageUrl: extractNextPageUrl($, baseUrl),
    warnings
  };
}

async function writeOrdersPageSnapshot(
  html: string,
  pageNumber: number,
  outDir: string
): Promise<string> {
  const debugDir = path.join(outDir, "_debug");
  await fs.mkdir(debugDir, { recursive: true });
  const filePath = path.join(debugDir, `orders-page-${pageNumber}.html`);
  await fs.writeFile(filePath, html, "utf8");
  return filePath;
}

export async function scrapeOrderRefs(
  page: Page,
  config: ExportConfig,
  logger: Logger
): Promise<ScrapedOrderListResult> {
  const allOrders: OrderRef[] = [];
  const warnings: string[] = [];
  const seedUrls = buildSeedOrderHistoryUrls(config.from, config.to);
  const appliedYearFilters = new Set<string>();
  const visitedPageUrls = new Set<string>();
  let pagesVisited = 0;
  const maxTotalPages = 250;

  for (let seedIndex = 0; seedIndex < seedUrls.length; seedIndex += 1) {
    const seed = seedUrls[seedIndex];
    if (allOrders.length >= config.maxOrders || pagesVisited >= maxTotalPages) {
      break;
    }

    logger.info("scanning_orders_seed", {
      seed: seed.label,
      url: seed.url
    });

    let currentPageUrl: string | null = seed.url;
    let pagesForSeed = 0;
    let preloadedFirstPage = false;

    const yearMatch = seed.label.match(/year-(\d{4})/);
    if (yearMatch) {
      const filterValue = `year-${yearMatch[1]}`;
      if (appliedYearFilters.has(filterValue)) {
        logger.info("skipping_duplicate_year_filter_seed", {
          seed: seed.label,
          filterValue
        });
        continue;
      }

      await navigateWithBackoff(page, AMAZON_COM_ORDERS_URL, logger);
      await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
      await page.waitForTimeout(700);

      const applied = await trySelectTimeFilterValue(page, filterValue, logger);
      if (applied) {
        appliedYearFilters.add(filterValue);
        currentPageUrl = page.url();
        preloadedFirstPage = true;
        logger.info("time_filter_seed_applied", {
          seed: seed.label,
          filterValue,
          currentUrl: currentPageUrl
        });
      }
    }

    while (currentPageUrl && pagesVisited < maxTotalPages) {
      if (allOrders.length >= config.maxOrders) {
        break;
      }

      if (visitedPageUrls.has(currentPageUrl)) {
        logger.info("skipping_previously_visited_orders_page", {
          seed: seed.label,
          url: currentPageUrl
        });
        break;
      }

      visitedPageUrls.add(currentPageUrl);
      pagesVisited += 1;
      pagesForSeed += 1;

      logger.info("scanning_orders_page", {
        page: pagesVisited,
        pageInSeed: pagesForSeed,
        seed: seed.label,
        url: currentPageUrl
      });
      if (!(preloadedFirstPage && pagesForSeed === 1)) {
        await navigateWithBackoff(page, currentPageUrl, logger);
        await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
        await page.waitForTimeout(1200);
      }

      const html = await page.content();
      if (pagesVisited === 1) {
        const filterDiagnostics = await inspectOrderFilterControls(page);
        logger.info("orders_filter_diagnostics", {
          selectControls: filterDiagnostics.selectControls,
          yearLinks: filterDiagnostics.yearLinks
        });
      }

      const domParsed = await extractOrderRefsFromDom(page);
      logger.info("orders_dom_scan_stats", {
        page: pagesVisited,
        pageInSeed: pagesForSeed,
        seed: seed.label,
        anchorCandidates: domParsed.diagnostics.anchorCandidates,
        dataOrderCandidates: domParsed.diagnostics.dataOrderCandidates,
        derivedOrders: domParsed.diagnostics.derivedOrders
      });

      const htmlParsed = domParsed.orders.length > 0 ? null : parseOrderListHtml(html, page.url());
      const parsed = htmlParsed
        ? htmlParsed
        : {
            orders: domParsed.orders,
            nextPageUrl: parseOrderListHtml(html, page.url()).nextPageUrl,
            warnings: domParsed.warnings
          };

      warnings.push(...parsed.warnings.map((warning) => `[orders-page-${pagesVisited}] ${warning}`));

      const textBlockOrders = parseOrdersFromTextBlocks(html);
      const mergedOrders = dedupeOrderRefs([...parsed.orders, ...textBlockOrders]);
      const inRange = mergedOrders.filter((order) => isDateInRange(order.orderDate, config.from, config.to));
      allOrders.push(...inRange);

      logger.info("orders_page_processed", {
        page: pagesVisited,
        pageInSeed: pagesForSeed,
        seed: seed.label,
        found: mergedOrders.length,
        foundDomOrHtml: parsed.orders.length,
        foundTextBlocks: textBlockOrders.length,
        inRange: inRange.length,
        totalInRange: allOrders.length
      });

      const pageMeta = await inspectOrdersListPageMeta(page);
      logger.info("orders_page_meta", {
        page: pagesVisited,
        pageInSeed: pagesForSeed,
        seed: seed.label,
        selectedFilter: pageMeta.selectedFilter,
        startIndex: pageMeta.startIndex,
        totalOrders: pageMeta.totalOrders
      });

      if (mergedOrders.length === 0 && pagesVisited === 1) {
        logger.warn("no_order_refs_detected_on_first_page", {
          hint: "Page structure may have changed or orders are not visible for selected filters."
        });
        if (config.debug) {
          const snapshotPath = await writeOrdersPageSnapshot(html, pagesVisited, config.outDir);
          logger.warn("orders_page_snapshot_written", { snapshotPath });
        }
      }

      const hasOnlyOlderOrders =
        mergedOrders.length > 0 && mergedOrders.every((order) => order.orderDate < config.from);

      if (hasOnlyOlderOrders) {
        logger.info("stopping_seed_pagination", {
          seed: seed.label,
          reason: "encountered only orders older than requested date range"
        });
        break;
      }

      const nextPageUrl = parsed.nextPageUrl ?? buildSyntheticNextPageUrl(page.url(), pageMeta);
      if (!nextPageUrl) {
        break;
      }

      currentPageUrl = nextPageUrl;
      await page.waitForTimeout(600);
    }
  }

  const deduped = dedupeOrderRefs(allOrders).slice(0, config.maxOrders);

  return {
    orders: deduped,
    pagesVisited,
    warnings
  };
}
