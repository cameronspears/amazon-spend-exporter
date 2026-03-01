import { Browser, BrowserContext, chromium, Page } from "playwright";
import { Logger } from "../types";
import { AMAZON_COM_ORDERS_URL, AMAZON_COM_SELECTORS } from "../scraper/selectors.amazon-com";

export interface BrowserSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
}

export interface LaunchSessionOptions {
  headless: boolean;
  logger: Logger;
}

async function matchesAnySelector(page: Page, selectors: string[]): Promise<boolean> {
  for (const selector of selectors) {
    if (selector.startsWith("text=")) {
      const text = selector.slice("text=".length);
      if ((await page.getByText(text, { exact: false }).count()) > 0) {
        return true;
      }
      continue;
    }

    if ((await page.locator(selector).count()) > 0) {
      return true;
    }
  }

  return false;
}

export async function isSignInPage(page: Page): Promise<boolean> {
  const url = page.url().toLowerCase();
  if (url.includes("/ap/signin") || url.includes("/sign-in")) {
    return true;
  }

  return matchesAnySelector(page, AMAZON_COM_SELECTORS.auth.signInInputs);
}

export async function isCheckpointPage(page: Page): Promise<boolean> {
  const url = page.url().toLowerCase();
  if (url.includes("captcha") || url.includes("cvf") || url.includes("checkpoint")) {
    return true;
  }

  if (await matchesAnySelector(page, AMAZON_COM_SELECTORS.auth.checkpointMarkers)) {
    return true;
  }

  const pageText = (await page.locator("body").innerText().catch(() => "")).toLowerCase();
  return (
    pageText.includes("enter the characters you see") ||
    pageText.includes("solve this puzzle") ||
    pageText.includes("type the characters")
  );
}

export async function isOrdersPageReady(page: Page): Promise<boolean> {
  const url = page.url().toLowerCase();
  const looksLikeOrdersUrl =
    url.includes("order-history") ||
    url.includes("your-account/orders") ||
    url.includes("/your-orders/orders") ||
    url.includes("/your-orders");

  if (!looksLikeOrdersUrl) {
    return false;
  }

  if (await matchesAnySelector(page, AMAZON_COM_SELECTORS.ordersList.pageReady)) {
    return true;
  }

  const hasOrderContainers = (await page.locator("[data-order-id]").count()) > 0;
  if (hasOrderContainers) {
    return true;
  }

  const hasOrderLinks =
    (await page.locator("a[href*='order-details'], a[href*='orderID='], a[href*='orderId=']").count()) > 0;
  if (hasOrderLinks) {
    return true;
  }

  return false;
}

export async function launchBrowserSession(options: LaunchSessionOptions): Promise<BrowserSession> {
  options.logger.info("launching_browser", { headless: options.headless });
  const browser = await chromium.launch({ headless: options.headless });
  const context = await browser.newContext({
    viewport: { width: 1400, height: 920 },
    locale: "en-US",
    timezoneId: "America/Chicago"
  });

  const page = await context.newPage();
  return { browser, context, page };
}

export async function handleCheckpointIfPresent(page: Page, logger: Logger): Promise<void> {
  if (!(await isCheckpointPage(page))) {
    return;
  }

  logger.warn("checkpoint_detected", {
    note: "Resolve CAPTCHA/checkpoint in browser. Export will continue automatically."
  });
}

function isTransientErrorPageText(text: string): boolean {
  return (
    text.includes("sorry! something went wrong") ||
    text.includes("temporarily unavailable") ||
    text.includes("please try again later")
  );
}

export async function navigateWithBackoff(
  page: Page,
  url: string,
  logger: Logger,
  attempts = 3
): Promise<void> {
  let backoffMs = 1500;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      logger.info("navigating", { attempt, url });
      const response = await page.goto(url, {
        timeout: 60_000,
        waitUntil: "domcontentloaded"
      });

      const status = response?.status();
      if (status && [429, 500, 502, 503, 504].includes(status)) {
        throw new Error(`Transient HTTP status ${status}`);
      }

      await handleCheckpointIfPresent(page, logger);

      const bodyText = (await page.locator("body").innerText().catch(() => "")).toLowerCase();
      if (isTransientErrorPageText(bodyText)) {
        throw new Error("Transient error page detected");
      }

      logger.info("navigation_complete", { url: page.url() });
      return;
    } catch (error) {
      if (attempt === attempts) {
        throw error;
      }

      logger.warn("navigation_retry", {
        attempt,
        waitMs: backoffMs,
        error: error instanceof Error ? error.message : String(error)
      });

      await page.waitForTimeout(backoffMs);
      backoffMs *= 2;
    }
  }
}

export async function ensureOrdersPageAccess(
  page: Page,
  logger: Logger,
  timeoutMs = 300_000
): Promise<boolean> {
  await navigateWithBackoff(page, AMAZON_COM_ORDERS_URL, logger);

  logger.info("awaiting_user_login", {
    note: "Complete login and any 2FA challenge in the browser window."
  });

  const deadline = Date.now() + timeoutMs;
  let nextHeartbeatAt = Date.now();
  let signInNoticeShown = false;
  let checkpointNoticeShown = false;

  while (Date.now() < deadline) {
    const checkpointPresent = await isCheckpointPage(page);
    if (checkpointPresent && !checkpointNoticeShown) {
      checkpointNoticeShown = true;
      logger.warn("checkpoint_detected", {
        note: "Resolve CAPTCHA/checkpoint in browser. Export will continue automatically."
      });
    }
    if (!checkpointPresent) {
      checkpointNoticeShown = false;
    }

    if (await isOrdersPageReady(page)) {
      logger.info("orders_page_ready");
      return true;
    }

    if (!signInNoticeShown && (await isSignInPage(page))) {
      signInNoticeShown = true;
      logger.info("signin_required", {
        note: "Complete sign-in in browser. No terminal input needed; run continues automatically."
      });
    }
    if (signInNoticeShown && !(await isSignInPage(page))) {
      signInNoticeShown = false;
    }

    if (Date.now() >= nextHeartbeatAt) {
      logger.info("waiting_for_orders_page", {
        remainingSeconds: Math.max(0, Math.floor((deadline - Date.now()) / 1000)),
        currentUrl: page.url()
      });
      nextHeartbeatAt = Date.now() + 10_000;
    }

    await page.waitForTimeout(1500);
  }

  logger.error("orders_page_timeout", {
    timeoutMs,
    note: "Could not confirm access to order history page."
  });
  return false;
}
