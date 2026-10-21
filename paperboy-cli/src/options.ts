function parseInteger(value: string, label: string, minimum: number, message: string): number {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    throw new Error(`${label} ${message}`);
  }

  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed) || parsed < minimum) {
    throw new Error(`${label} ${message}`);
  }
  return parsed;
}

export function parsePositiveInt(value: string, label: string): number {
  return parseInteger(value, label, 1, "must be a positive integer.");
}

export function parseNonNegativeInt(value: string, label: string): number {
  return parseInteger(value, label, 0, "must be zero or a positive integer.");
}
