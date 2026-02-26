export type KeyValueRow = {
  key: string;
  value: string;
  enabled?: boolean;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isPrimitiveLike = (value: unknown) =>
  value == null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';

const toCellValue = (value: unknown): string => {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
};

export const tryParseJson = (input: string): unknown | null => {
  const trimmed = (input || '').trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
};

export const jsonTextToKeyValueRows = (
  jsonText: string,
): { rows: KeyValueRow[]; warning?: string } => {
  const parsed = tryParseJson(jsonText);
  if (parsed == null) {
    return { rows: [], warning: 'Invalid JSON. Cannot convert to table.' };
  }

  if (isPlainObject(parsed)) {
    const rows = Object.entries(parsed).map(([key, value]) => ({
      key,
      value: toCellValue(value),
      enabled: true,
    }));
    if (!rows.length) return { rows: [{ key: '', value: '', enabled: true }] };

    const hasNested = Object.values(parsed).some((value) => !isPrimitiveLike(value));
    return {
      rows,
      warning: hasNested ? 'Nested values were serialized into JSON strings for table editing.' : undefined,
    };
  }

  if (Array.isArray(parsed)) {
    const canFlatten = parsed.every((item) => isPlainObject(item));
    if (!canFlatten) {
      return { rows: [], warning: 'Only JSON objects or arrays of objects can be converted to table rows.' };
    }

    const keyOrder: string[] = [];
    const seen = new Set<string>();
    parsed.forEach((item) => {
      Object.keys(item).forEach((key) => {
        if (!seen.has(key)) {
          seen.add(key);
          keyOrder.push(key);
        }
      });
    });

    const rows = keyOrder.map((key) => ({
      key,
      value: JSON.stringify(parsed.map((item) => (item as Record<string, unknown>)[key] ?? null)),
      enabled: true,
    }));

    return {
      rows: rows.length ? rows : [{ key: '', value: '', enabled: true }],
      warning: 'Array-of-objects was columnized. Values are stored as JSON arrays per key.',
    };
  }

  return {
    rows: [],
    warning: 'Only JSON objects or arrays of objects can be converted to table rows.',
  };
};

export const keyValueRowsToJsonText = (rows: KeyValueRow[]): string => {
  const next: Record<string, unknown> = {};
  (rows || []).forEach((row) => {
    if (row.enabled === false) return;
    const key = (row.key || '').trim();
    if (!key) return;
    const raw = row.value ?? '';
    const trimmed = raw.trim();
    if (!trimmed) {
      next[key] = '';
      return;
    }
    try {
      next[key] = JSON.parse(trimmed);
    } catch {
      next[key] = raw;
    }
  });
  return JSON.stringify(next, null, 2);
};
