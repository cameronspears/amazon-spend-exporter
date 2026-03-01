import fs from "node:fs/promises";
import path from "node:path";
import { CliExportOptions, ExportConfig, buildExportConfig } from "../config";
import { launchBrowserSession, ensureOrdersPageAccess } from "../browser/session";
import { writeCsv } from "../export/csv";
import { writeXlsx } from "../export/xlsx";
import { createLogger } from "../logger";
import { scrapeOrderDetail } from "../scraper/order-detail";
import { scrapeOrderRefs } from "../scraper/orders-list";
import {
  ExportEvent,
  ExportProgress,
  ExportRunMeta,
  ExportRunStatus,
  Logger,
  OrderItemRow,
  ParsedOrderItem
} from "../types";

export const EXIT_SUCCESS = 0;
export const EXIT_VALIDATION_ERROR = 2;
export const EXIT_LOGIN_INCOMPLETE = 3;
export const EXIT_EXTRACTION_FAILED = 4;

const PLACEHOLDER_ITEM_TITLE = "[Order captured; item details unavailable]";

export interface ExportRunHooks {
  onEvent?: (event: ExportEvent) => void;
  logger?: Logger;
}

export interface ExportRunOutcome {
  exitCode: number;
  status: ExportRunStatus;
  config: ExportConfig | null;
  files: string[];
  warningFile: string | null;
  warnings: string[];
  orders: number;
  items: number;
  rows: OrderItemRow[];
  meta: ExportRunMeta | null;
  errorMessage: string | null;
}

function toFileStem(from: string, to: string): string {
  return `amazon-orders-${from}-to-${to}`;
}

function createInitialProgress(): ExportProgress {
  return {
    stage: "idle",
    percent: 0,
    ordersTotal: 0,
    ordersProcessed: 0,
    itemsExtracted: 0,
    warningsCount: 0
  };
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function buildPlaceholderItem(): ParsedOrderItem {
  return {
    itemTitle: PLACEHOLDER_ITEM_TITLE,
    asinOrSku: null,
    quantity: 0,
    itemPrice: null,
    itemSubtotal: null
  };
}

export async function runExportJob(
  rawOptions: CliExportOptions,
  hooks: ExportRunHooks = {}
): Promise<ExportRunOutcome> {
  const baseLogger = hooks.logger ?? createLogger();
  const progress = createInitialProgress();
  let currentStatus: ExportRunStatus = "idle";
  let config: ExportConfig | null = null;
  let warningFile: string | null = null;

  const emit = (message: string, context?: Record<string, unknown>): void => {
    if (!hooks.onEvent) {
      return;
    }

    hooks.onEvent({
      ts: new Date().toISOString(),
      stage: currentStatus,
      message,
      progress: { ...progress },
      ...(context ? { context } : {})
    });
  };

  const setStage = (
    stage: ExportRunStatus,
    message: string,
    patch?: Partial<Omit<ExportProgress, "stage">>,
    context?: Record<string, unknown>
  ): void => {
    currentStatus = stage;
    progress.stage = stage;
    if (patch) {
      if (patch.percent !== undefined) {
        progress.percent = clampPercent(patch.percent);
      }
      if (patch.ordersTotal !== undefined) {
        progress.ordersTotal = patch.ordersTotal;
      }
      if (patch.ordersProcessed !== undefined) {
        progress.ordersProcessed = patch.ordersProcessed;
      }
      if (patch.itemsExtracted !== undefined) {
        progress.itemsExtracted = patch.itemsExtracted;
      }
      if (patch.warningsCount !== undefined) {
        progress.warningsCount = patch.warningsCount;
      }
    }

    emit(message, context);
  };

  const logger: Logger = {
    info: (message, context) => {
      baseLogger.info(message, context);
      emit(message, context);
    },
    warn: (message, context) => {
      baseLogger.warn(message, context);
      emit(message, context);
    },
    error: (message, context) => {
      baseLogger.error(message, context);
      emit(message, context);
    }
  };

  try {
    config = buildExportConfig(rawOptions);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    setStage(
      "failed",
      "validation_failed",
      {
        percent: 100
      },
      {
        error: errorMessage
      }
    );
    return {
      exitCode: EXIT_VALIDATION_ERROR,
      status: "failed",
      config: null,
      files: [],
      warningFile: null,
      warnings: [errorMessage],
      orders: 0,
      items: 0,
      rows: [],
      meta: null,
      errorMessage
    };
  }

  logger.info("starting_export", {
    from: config.from,
    to: config.to,
    outDir: config.outDir,
    format: config.format,
    headless: config.headless,
    maxOrders: config.maxOrders,
    loginTimeoutSeconds: config.loginTimeoutSeconds
  });

  await fs.mkdir(config.outDir, { recursive: true });
  const debugDir = config.debug ? path.join(config.outDir, "_debug") : undefined;

  setStage("awaiting_auth", "launching_browser", { percent: 2 });
  const session = await launchBrowserSession({
    headless: config.headless,
    logger
  });

  const warnings: string[] = [];
  const rows: OrderItemRow[] = [];
  const outputFiles: string[] = [];
  let totalOrders = 0;

  try {
    logger.info("opening_amazon_orders_page");
    setStage("awaiting_auth", "awaiting_manual_login", { percent: 5 });
    const hasAccess = await ensureOrdersPageAccess(
      session.page,
      logger,
      config.loginTimeoutSeconds * 1000
    );
    if (!hasAccess) {
      const message = "Login/session incomplete.";
      warnings.push(message);
      setStage(
        "failed",
        "orders_page_access_failed",
        {
          percent: 100,
          warningsCount: warnings.length
        },
        {
          reason: message
        }
      );

      return {
        exitCode: EXIT_LOGIN_INCOMPLETE,
        status: "failed",
        config,
        files: [],
        warningFile: null,
        warnings,
        orders: 0,
        items: 0,
        rows: [],
        meta: null,
        errorMessage: message
      };
    }

    setStage("collecting_orders", "collecting_order_references", { percent: 15 });
    const listResult = await scrapeOrderRefs(session.page, config, logger);
    warnings.push(...listResult.warnings);
    totalOrders = listResult.orders.length;

    setStage("collecting_orders", "order_reference_collection_complete", {
      percent: 32,
      ordersTotal: totalOrders,
      warningsCount: warnings.length
    });

    if (listResult.orders.length === 0) {
      warnings.push("No orders were found in the requested date range.");
    }

    const exportedAt = new Date().toISOString();
    setStage("extracting_details", "extracting_order_details", {
      percent: 35,
      ordersProcessed: 0,
      itemsExtracted: 0,
      warningsCount: warnings.length
    });

    for (const [index, order] of listResult.orders.entries()) {
      logger.info("processing_order", {
        index: index + 1,
        total: listResult.orders.length,
        orderId: order.orderId
      });

      try {
        const detail = await scrapeOrderDetail(session.page, order, logger, { debugDir });
        warnings.push(...detail.warnings.map((warning) => `[${order.orderId}] ${warning}`));

        const itemsToEmit = detail.items.length > 0 ? detail.items : [buildPlaceholderItem()];
        if (detail.items.length === 0) {
          logger.warn("order_placeholder_item_emitted", {
            orderId: order.orderId
          });
        }

        for (const item of itemsToEmit) {
          rows.push({
            order_id: detail.orderId ?? order.orderId,
            order_date: detail.orderDate ?? order.orderDate,
            order_status: detail.orderStatus,
            item_title: item.itemTitle,
            asin_or_sku: item.asinOrSku,
            quantity: item.quantity,
            item_price: item.itemPrice,
            item_subtotal: item.itemSubtotal,
            shipping_amount: detail.shippingAmount,
            tax_amount: detail.taxAmount,
            discount_amount: detail.discountAmount,
            order_total: detail.orderTotal,
            payment_method_masked: detail.paymentMethodMasked,
            ship_to_city: detail.shipToCity,
            ship_to_state: detail.shipToState,
            ship_to_country: detail.shipToCountry,
            invoice_url: detail.invoiceUrl,
            order_detail_url: order.detailUrl,
            currency: detail.currency,
            source_marketplace: "amazon.com",
            exported_at: exportedAt
          });
        }

        logger.info("order_processed", {
          orderId: order.orderId,
          itemsExtracted: detail.items.length,
          runningRowCount: rows.length
        });
      } catch (error) {
        warnings.push(
          `[${order.orderId}] Failed to parse order details: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        logger.warn("order_parse_failed", {
          orderId: order.orderId,
          error: error instanceof Error ? error.message : String(error)
        });
      }

      const ratio = totalOrders > 0 ? (index + 1) / totalOrders : 1;
      setStage("extracting_details", "detail_extraction_progress", {
        percent: 35 + ratio * 55,
        ordersTotal: totalOrders,
        ordersProcessed: index + 1,
        itemsExtracted: rows.length,
        warningsCount: warnings.length
      });
    }

    const stem = toFileStem(config.from, config.to);
    setStage("writing_files", "writing_output_files", {
      percent: 92,
      ordersTotal: totalOrders,
      ordersProcessed: totalOrders,
      itemsExtracted: rows.length,
      warningsCount: warnings.length
    });

    if (config.format === "csv" || config.format === "both") {
      outputFiles.push(await writeCsv(rows, config.outDir, `${stem}.csv`));
    }

    const runMeta: ExportRunMeta = {
      from: config.from,
      to: config.to,
      generatedAt: new Date().toISOString(),
      totalOrders: totalOrders,
      totalItems: rows.length,
      warnings
    };

    if (config.format === "xlsx" || config.format === "both") {
      outputFiles.push(await writeXlsx(rows, runMeta, config.outDir, `${stem}.xlsx`));
    }

    if (warnings.length > 0) {
      warningFile = path.join(config.outDir, `${stem}.warnings.log`);
      await fs.writeFile(warningFile, warnings.join("\n"), "utf8");
      setStage("completed_with_warnings", "export_completed_with_warnings", {
        percent: 100,
        ordersTotal: totalOrders,
        ordersProcessed: totalOrders,
        itemsExtracted: rows.length,
        warningsCount: warnings.length
      });

      return {
        exitCode: EXIT_EXTRACTION_FAILED,
        status: "completed_with_warnings",
        config,
        files: outputFiles,
        warningFile,
        warnings,
        orders: totalOrders,
        items: rows.length,
        rows,
        meta: runMeta,
        errorMessage: null
      };
    }

    setStage("completed", "export_completed", {
      percent: 100,
      ordersTotal: totalOrders,
      ordersProcessed: totalOrders,
      itemsExtracted: rows.length,
      warningsCount: 0
    });

    return {
      exitCode: EXIT_SUCCESS,
      status: "completed",
      config,
      files: outputFiles,
      warningFile: null,
      warnings,
      orders: totalOrders,
      items: rows.length,
      rows,
      meta: runMeta,
      errorMessage: null
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("export_failed", { error: errorMessage });
    warnings.push(`Export failed: ${errorMessage}`);
    setStage("failed", "export_failed", {
      percent: 100,
      warningsCount: warnings.length,
      ordersTotal: totalOrders,
      itemsExtracted: rows.length
    });

    return {
      exitCode: EXIT_EXTRACTION_FAILED,
      status: "failed",
      config,
      files: outputFiles,
      warningFile,
      warnings,
      orders: totalOrders,
      items: rows.length,
      rows,
      meta: null,
      errorMessage
    };
  } finally {
    await session.browser.close();
  }
}
