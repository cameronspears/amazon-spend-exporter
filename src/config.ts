import path from "node:path";
import { daysBetweenInclusive, formatIsoDate, parseIsoDateStrict } from "./normalize/date";
import { ExportFormat } from "./types";

const VALID_FORMATS: ExportFormat[] = ["csv", "xlsx", "both"];
const DEFAULT_MAX_ORDERS = 5000;
const DEFAULT_MAX_RANGE_DAYS = 365;
const DEFAULT_LOGIN_TIMEOUT_SECONDS = 900;

export interface CliExportOptions {
  from: string;
  to: string;
  out: string;
  format?: string;
  headless?: boolean | string;
  maxOrders?: number | string;
  maxRangeDays?: number | string;
  loginTimeoutSeconds?: number | string;
  debug?: boolean;
}

export interface ExportConfig {
  from: string;
  to: string;
  outDir: string;
  format: ExportFormat;
  headless: boolean;
  maxOrders: number;
  maxRangeDays: number;
  loginTimeoutSeconds: number;
  debug: boolean;
  marketplace: "amazon.com";
}

function parseBoolean(value: unknown, defaultValue: boolean): boolean {
  if (value === undefined || value === null) {
    return defaultValue;
  }

  if (typeof value === "boolean") {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "y"].includes(normalized)) {
    return true;
  }

  if (["false", "0", "no", "n"].includes(normalized)) {
    return false;
  }

  throw new Error(`Invalid boolean value: ${value}`);
}

function parsePositiveInt(value: unknown, defaultValue: number, fieldName: string): number {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${fieldName} must be a positive integer.`);
  }

  return parsed;
}

function parseFormat(value?: string): ExportFormat {
  const normalized = (value ?? "both").toLowerCase();
  if (!VALID_FORMATS.includes(normalized as ExportFormat)) {
    throw new Error(`format must be one of: ${VALID_FORMATS.join(", ")}`);
  }

  return normalized as ExportFormat;
}

export function buildExportConfig(raw: CliExportOptions): ExportConfig {
  if (!raw.from || !raw.to || !raw.out) {
    throw new Error("--from, --to, and --out are required.");
  }

  const fromDate = parseIsoDateStrict(raw.from);
  const toDate = parseIsoDateStrict(raw.to);
  if (!fromDate || !toDate) {
    throw new Error("Dates must use YYYY-MM-DD format.");
  }

  const from = formatIsoDate(fromDate);
  const to = formatIsoDate(toDate);
  if (from > to) {
    throw new Error("--from must be earlier than or equal to --to.");
  }

  const maxRangeDays = parsePositiveInt(raw.maxRangeDays, DEFAULT_MAX_RANGE_DAYS, "maxRangeDays");
  const rangeDays = daysBetweenInclusive(from, to);
  if (!Number.isFinite(rangeDays) || rangeDays > maxRangeDays) {
    throw new Error(`Date range exceeds the configured maximum (${maxRangeDays} days).`);
  }

  return {
    from,
    to,
    outDir: path.resolve(process.cwd(), raw.out),
    format: parseFormat(raw.format),
    headless: parseBoolean(raw.headless, false),
    maxOrders: parsePositiveInt(raw.maxOrders, DEFAULT_MAX_ORDERS, "maxOrders"),
    maxRangeDays,
    loginTimeoutSeconds: parsePositiveInt(
      raw.loginTimeoutSeconds,
      DEFAULT_LOGIN_TIMEOUT_SECONDS,
      "loginTimeoutSeconds"
    ),
    debug: Boolean(raw.debug),
    marketplace: "amazon.com"
  };
}
