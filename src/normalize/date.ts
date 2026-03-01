const ISO_DATE_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;

const MONTH_NAME_REGEX =
  /(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}/i;

const NUMERIC_DATE_REGEX = /(\d{1,2})\/(\d{1,2})\/(\d{4})/;

export function parseIsoDateStrict(input: string): Date | null {
  const match = ISO_DATE_REGEX.exec(input.trim());
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    return null;
  }

  return candidate;
}

export function formatIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function daysBetweenInclusive(startIso: string, endIso: string): number {
  const start = parseIsoDateStrict(startIso);
  const end = parseIsoDateStrict(endIso);

  if (!start || !end) {
    return Number.NaN;
  }

  const diffMs = end.getTime() - start.getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.floor(diffMs / dayMs) + 1;
}

export function isDateInRange(dateIso: string, fromIso: string, toIso: string): boolean {
  return dateIso >= fromIso && dateIso <= toIso;
}

function stripOrdinalSuffix(input: string): string {
  return input.replace(/(\d+)(st|nd|rd|th)\b/gi, "$1");
}

export function parseDateFromText(input: string): string | null {
  const text = stripOrdinalSuffix(input.replace(/\s+/g, " ").trim());

  const monthMatch = text.match(MONTH_NAME_REGEX);
  if (monthMatch) {
    const parsed = new Date(`${monthMatch[0]} UTC`);
    if (!Number.isNaN(parsed.getTime())) {
      return formatIsoDate(parsed);
    }
  }

  const numericMatch = text.match(NUMERIC_DATE_REGEX);
  if (numericMatch) {
    const month = Number(numericMatch[1]);
    const day = Number(numericMatch[2]);
    const year = Number(numericMatch[3]);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (!Number.isNaN(parsed.getTime())) {
      return formatIsoDate(parsed);
    }
  }

  return null;
}
