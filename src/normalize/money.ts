export interface ParsedMoney {
  amount: number | null;
  currency: string | null;
}

const CURRENCY_SYMBOL_MAP: Record<string, string> = {
  "$": "USD",
  "£": "GBP",
  "€": "EUR",
  "¥": "JPY"
};

function inferCurrency(input: string, defaultCurrency?: string): string | null {
  for (const [symbol, currency] of Object.entries(CURRENCY_SYMBOL_MAP)) {
    if (input.includes(symbol)) {
      return currency;
    }
  }

  const codeMatch = input.match(/\b(USD|EUR|GBP|JPY|CAD|AUD|INR)\b/i);
  if (codeMatch) {
    return codeMatch[1].toUpperCase();
  }

  return defaultCurrency ?? null;
}

export function parseMoney(input: string | null | undefined, defaultCurrency?: string): ParsedMoney {
  if (!input) {
    return { amount: null, currency: defaultCurrency ?? null };
  }

  const currency = inferCurrency(input, defaultCurrency);
  const compact = input.replace(/\s+/g, "").trim();
  const isNegative = compact.includes("(") || compact.includes("-");
  const numericText = compact
    .replace(/[()]/g, "")
    .replace(/[^0-9.,-]/g, "")
    .replace(/,/g, "");

  const amountMatch = numericText.match(/-?\d+(?:\.\d+)?/);
  if (!amountMatch) {
    return { amount: null, currency };
  }

  const parsed = Number(amountMatch[0]);
  if (Number.isNaN(parsed)) {
    return { amount: null, currency };
  }

  const amount = isNegative ? -Math.abs(parsed) : parsed;
  return { amount, currency };
}
