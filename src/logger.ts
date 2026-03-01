import { Logger } from "./types";

type LogLevel = "info" | "warn" | "error";

const REDACT_KEYS = ["cookie", "token", "authorization", "password", "address"];
const JSON_LOG_FORMAT = process.env.AMAZON_ORDERS_LOG_FORMAT === "json";

function sanitizeContext(context?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!context) {
    return undefined;
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context)) {
    if (REDACT_KEYS.some((fragment) => key.toLowerCase().includes(fragment))) {
      sanitized[key] = "[REDACTED]";
      continue;
    }

    if (typeof value === "string" && value.length > 500) {
      sanitized[key] = `${value.slice(0, 497)}...`;
      continue;
    }

    sanitized[key] = value;
  }

  return sanitized;
}

function emit(level: LogLevel, message: string, context?: Record<string, unknown>): void {
  const sanitizedContext = sanitizeContext(context);
  const ts = new Date().toISOString();

  if (JSON_LOG_FORMAT) {
    const payload = {
      ts,
      level,
      message,
      ...(sanitizedContext ? { context: sanitizedContext } : {})
    };
    const output = JSON.stringify(payload);
    if (level === "error") {
      console.error(output);
      return;
    }
    console.log(output);
    return;
  }

  const levelLabel = level.toUpperCase().padEnd(5, " ");
  const contextText = sanitizedContext
    ? ` ${Object.entries(sanitizedContext)
        .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
        .join(" ")}`
    : "";
  const output = `[${ts}] ${levelLabel} ${message}${contextText}`;
  if (level === "error") {
    console.error(output);
  } else {
    console.log(output);
  }
}

export function createLogger(): Logger {
  return {
    info: (message, context) => emit("info", message, context),
    warn: (message, context) => emit("warn", message, context),
    error: (message, context) => emit("error", message, context)
  };
}
