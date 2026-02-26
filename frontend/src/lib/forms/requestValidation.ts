export type KVRow = {
  key?: string;
  value?: string;
  enabled?: boolean;
  type?: 'text' | 'file' | 'binary' | string;
  file_path?: string;
  file_inline?: string;
};

export type ValidationIssue = {
  message: string;
  tab: 'body' | 'headers' | 'params' | 'auth' | 'settings';
  selector?: string;
};

export type RequestValidationInput = {
  url: string;
  body_mode: 'raw' | 'json' | 'form-urlencoded' | 'form-data' | 'binary';
  headers: KVRow[];
  query_params: KVRow[];
  form_body: KVRow[];
  binary: { file_path?: string; file_inline?: string } | null;
};

const normalizeKey = (key?: string) => (key || '').trim().toLowerCase();

const isEnabled = (row: KVRow) => row.enabled !== false;

const hasValueWithoutKey = (row: KVRow) => {
  if (!isEnabled(row)) return false;
  const key = (row.key || '').trim();
  if (key) return false;
  const hasTextValue = String(row.value || '').trim().length > 0;
  const hasFile = Boolean(row.file_path || row.file_inline);
  return hasTextValue || hasFile;
};

export const findDuplicateKeyIndexes = (rows: KVRow[]): Set<number> => {
  const keyToIndexes = new Map<string, number[]>();
  rows.forEach((row, idx) => {
    if (!isEnabled(row)) return;
    const key = normalizeKey(row.key);
    if (!key) return;
    const next = keyToIndexes.get(key) || [];
    next.push(idx);
    keyToIndexes.set(key, next);
  });

  const duplicates = new Set<number>();
  keyToIndexes.forEach((indexes) => {
    if (indexes.length < 2) return;
    indexes.forEach((idx) => duplicates.add(idx));
  });
  return duplicates;
};

export const findMissingKeyIndexes = (rows: KVRow[]): Set<number> => {
  const missing = new Set<number>();
  rows.forEach((row, idx) => {
    if (hasValueWithoutKey(row)) missing.add(idx);
  });
  return missing;
};

export const validateRequestForSubmit = (input: RequestValidationInput): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];

  if (!input.url.trim()) {
    issues.push({
      message: 'URL is required.',
      tab: 'body',
      selector: '[data-req-field="url"]',
    });
  }

  const headerDupes = findDuplicateKeyIndexes(input.headers || []);
  if (headerDupes.size) {
    const first = Math.min(...Array.from(headerDupes));
    issues.push({
      message: 'Headers contain duplicate keys.',
      tab: 'headers',
      selector: `[data-kv-table="headers"][data-kv-row="${first}"][data-kv-field="key"]`,
    });
  }

  const headerMissing = findMissingKeyIndexes(input.headers || []);
  if (headerMissing.size) {
    const first = Math.min(...Array.from(headerMissing));
    issues.push({
      message: 'A header value is set without a key.',
      tab: 'headers',
      selector: `[data-kv-table="headers"][data-kv-row="${first}"][data-kv-field="key"]`,
    });
  }

  const queryDupes = findDuplicateKeyIndexes(input.query_params || []);
  if (queryDupes.size) {
    const first = Math.min(...Array.from(queryDupes));
    issues.push({
      message: 'Query parameters contain duplicate keys.',
      tab: 'params',
      selector: `[data-kv-table="params"][data-kv-row="${first}"][data-kv-field="key"]`,
    });
  }

  const queryMissing = findMissingKeyIndexes(input.query_params || []);
  if (queryMissing.size) {
    const first = Math.min(...Array.from(queryMissing));
    issues.push({
      message: 'A query parameter value is set without a key.',
      tab: 'params',
      selector: `[data-kv-table="params"][data-kv-row="${first}"][data-kv-field="key"]`,
    });
  }

  const formDupes = findDuplicateKeyIndexes(input.form_body || []);
  if (formDupes.size && (input.body_mode === 'form-data' || input.body_mode === 'form-urlencoded')) {
    const first = Math.min(...Array.from(formDupes));
    issues.push({
      message: 'Form body contains duplicate keys.',
      tab: 'body',
      selector: `[data-kv-table="form-body"][data-kv-row="${first}"][data-kv-field="key"]`,
    });
  }

  const formMissing = findMissingKeyIndexes(input.form_body || []);
  if (formMissing.size && (input.body_mode === 'form-data' || input.body_mode === 'form-urlencoded')) {
    const first = Math.min(...Array.from(formMissing));
    issues.push({
      message: 'A form value is set without a key.',
      tab: 'body',
      selector: `[data-kv-table="form-body"][data-kv-row="${first}"][data-kv-field="key"]`,
    });
  }

  if (input.body_mode === 'form-data') {
    (input.form_body || []).forEach((row, idx) => {
      if (!isEnabled(row)) return;
      if ((row.type || 'text') === 'text') return;
      if (row.file_path || row.file_inline) return;
      issues.push({
        message: 'A file/form-data row is missing its file payload.',
        tab: 'body',
        selector: `[data-kv-table="form-body"][data-kv-row="${idx}"][data-kv-field="value"]`,
      });
    });
  }

  if (input.body_mode === 'binary' && !(input.binary?.file_path || input.binary?.file_inline)) {
    issues.push({
      message: 'Binary body mode requires a selected file.',
      tab: 'body',
      selector: '[data-req-field="binary-path"]',
    });
  }

  return issues;
};
