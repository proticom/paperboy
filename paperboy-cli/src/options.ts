const MAX_OPTION_INTEGER = 2_147_483_647;

function quoteValue(value: string): string {
  const escaped = JSON.stringify(value).slice(1, -1).replaceAll("'", "\\'");
  return `'${escaped}'`;
}

function parseInteger(value: string, label: string, minimum: number, message: string): number {
  const trimmed = value.trim();
  const quotedValue = `${quoteValue(value)}.`;
  if (!/^\d+$/.test(trimmed)) {
    throw new Error(`${label} ${message} Got: ${quotedValue}`);
  }

  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed) || parsed < minimum) {
    throw new Error(`${label} ${message} Got: ${quotedValue}`);
  }
  if (parsed > MAX_OPTION_INTEGER) {
    throw new Error(`${label} must be at most ${MAX_OPTION_INTEGER}. Got: ${quotedValue}`);
  }
  return parsed;
}

export function parsePositiveInt(value: string, label: string): number {
  return parseInteger(value, label, 1, "must be a positive integer.");
}

export function parseNonNegativeInt(value: string, label: string): number {
  return parseInteger(value, label, 0, "must be zero or a positive integer.");
}
