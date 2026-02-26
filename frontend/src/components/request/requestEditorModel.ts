import type { ExtractionRule, HttpRequest } from '../../lib/api';
import type { FormDataRow } from './FormDataTable';
import type { HeaderRow } from './HeadersTable';
import { encodeUrlForRequest } from '../../lib/forms/requestUrl';

export type QueryParamRow = { key: string; value: string; enabled?: boolean; secret?: boolean };

export type FormValues = {
  name: string;
  method: string;
  url: string;
  body: string;
  body_mode: 'raw' | 'json' | 'form-urlencoded' | 'form-data' | 'binary';
  headers: HeaderRow[];
  extract_rules: ExtractionRule[];
  form_body: FormDataRow[];
  query_params: QueryParamRow[];
  auth_type: 'none' | 'basic' | 'bearer';
  auth_params: Record<string, string>;
  secret_headers: Record<string, boolean>;
  secret_query_params: Record<string, boolean>;
  secret_form_fields: Record<string, boolean>;
  secret_auth_params: Record<string, boolean>;
  secret_body: boolean;
  binary: { file_path?: string; file_inline?: string; file_name?: string } | null;
};

export const toHeadersArray = (headers: Record<string, string> = {}): HeaderRow[] =>
  Object.entries(headers).map(([key, value]) => ({ key, value, enabled: true }));

export const toHeadersRecord = (rows: HeaderRow[]) => {
  const next: Record<string, string> = {};
  rows.forEach(({ key, value, enabled }) => {
    const trimmed = key.trim();
    if (trimmed && enabled !== false) next[trimmed] = value;
  });
  return next;
};

export const areQueryRowsEqual = (
  a: Array<{ key: string; value: string; enabled?: boolean }> | undefined,
  b: Array<{ key: string; value: string; enabled?: boolean }> | undefined,
) => {
  const left = a || [];
  const right = b || [];
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    if ((left[i].key || '') !== (right[i].key || '')) return false;
    if ((left[i].value || '') !== (right[i].value || '')) return false;
    if ((left[i].enabled ?? true) !== (right[i].enabled ?? true)) return false;
  }
  return true;
};

export const normalizeJMESPath = (path: string) => {
  const trimmed = path.trim();
  const prefixes = ['body.', 'response.', '$.'];
  for (const prefix of prefixes) {
    if (trimmed.startsWith(prefix)) {
      return trimmed.slice(prefix.length);
    }
  }
  return trimmed;
};

export const deriveAuthFromHeaders = (
  headers: Record<string, string> | undefined,
  currentType: FormValues['auth_type'],
  currentParams: Record<string, string>,
) => {
  const authHeader = headers?.Authorization || headers?.authorization;
  if (!authHeader) return { auth_type: currentType, auth_params: currentParams };
  if (currentType && currentType !== 'none') return { auth_type: currentType, auth_params: currentParams };

  if (/^Bearer\s+/i.test(authHeader)) {
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    return { auth_type: 'bearer' as const, auth_params: { token } };
  }
  if (/^Basic\s+/i.test(authHeader)) {
    const b64 = authHeader.replace(/^Basic\s+/i, '').trim();
    try {
      const decoded = atob(b64);
      const idx = decoded.indexOf(':');
      const username = idx >= 0 ? decoded.slice(0, idx) : decoded;
      const password = idx >= 0 ? decoded.slice(idx + 1) : '';
      return { auth_type: 'basic' as const, auth_params: { username, password } };
    } catch {
      return { auth_type: currentType, auth_params: currentParams };
    }
  }
  return { auth_type: currentType, auth_params: currentParams };
};

export const buildRequestFromForm = (activeRequest: HttpRequest, values: FormValues): HttpRequest => {
  const secretHeaders: Record<string, boolean> = {};
  (values.headers || []).forEach((row) => {
    const key = (row.key || '').trim();
    if (key && row.secret) secretHeaders[key] = true;
  });

  const secretQuery: Record<string, boolean> = {};
  (values.query_params || []).forEach((row) => {
    const key = (row.key || '').trim();
    if (key && row.secret) secretQuery[key] = true;
  });

  const secretForm: Record<string, boolean> = {};
  (values.form_body || []).forEach((row) => {
    const key = (row.key || '').trim();
    const rowType = (row.type || 'text').toLowerCase();
    if (rowType === 'text' && key && row.secret) secretForm[key] = true;
  });

  const secretAuth: Record<string, boolean> = {};
  Object.entries(values.secret_auth_params || {}).forEach(([k, v]) => {
    if (v) secretAuth[k] = true;
  });

  return {
    ...activeRequest,
    name: values.name || 'New Request',
    method: values.method,
    url: values.url,
    headers: toHeadersRecord(values.headers || []),
    query_params: values.query_params || [],
    auth_type: values.auth_type,
    auth_params: values.auth_params || {},
    body: values.body ?? null,
    body_mode: values.body_mode,
    form_body: values.form_body ?? [],
    extract_rules: (values.extract_rules ?? []).map((rule) => ({
      ...rule,
      source_path: normalizeJMESPath(rule.source_path || ''),
    })),
    secret_headers: secretHeaders,
    secret_query_params: secretQuery,
    secret_form_fields: secretForm,
    secret_auth_params: secretAuth,
    secret_body: Boolean(values.secret_body),
    binary: values.binary || null,
  };
};

export const prepareRequestForSend = (req: HttpRequest): HttpRequest => {
  const headers = { ...(req.headers || {}) };
  let body = req.body;
  let formBody = req.form_body || [];
  let binaryPayload = req.binary || null;

  if (req.body_mode === 'json' && body && typeof body !== 'string') {
    body = JSON.stringify(body);
    if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
  }

  if (req.body_mode === 'form-urlencoded' || req.body_mode === 'form-data') {
    formBody = (formBody || []).filter((row) => {
      if (row.enabled === false) return false;
      const key = (row.key || '').trim();
      if (!key) return false;
      if ((row.type || 'text') === 'text') return true;
      return Boolean(row.file_path || row.file_inline);
    });
  }

  if (req.body_mode === 'form-urlencoded' && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
  }

  if (req.body_mode !== 'binary') {
    binaryPayload = null;
  }

  return { ...req, url: encodeUrlForRequest(req.url), headers, body: body ?? null, form_body: formBody, binary: binaryPayload };
};
