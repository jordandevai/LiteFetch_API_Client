export type PresetRow = { key: string; value?: string; enabled?: boolean; secret?: boolean };

export type PresetTarget = {
  headers: PresetRow[];
  auth_type: 'none' | 'basic' | 'bearer';
  auth_params: Record<string, string>;
  body_mode: 'raw' | 'json' | 'form-urlencoded' | 'form-data' | 'binary';
  body: string;
};

export type RequestPreset = {
  id: string;
  label: string;
  description: string;
  apply: (input: PresetTarget) => Partial<PresetTarget>;
};

const upsertHeader = (rows: PresetRow[], key: string, value: string): PresetRow[] => {
  const idx = rows.findIndex((row) => (row.key || '').toLowerCase() === key.toLowerCase());
  if (idx >= 0) {
    const next = [...rows];
    next[idx] = { ...next[idx], key, value, enabled: true };
    return next;
  }
  return [...rows, { key, value, enabled: true }];
};

export const REQUEST_PRESETS: RequestPreset[] = [
  {
    id: 'json-api',
    label: 'JSON API',
    description: 'Set JSON headers and body mode.',
    apply: (input) => {
      let headers = [...(input.headers || [])];
      headers = upsertHeader(headers, 'Content-Type', 'application/json');
      headers = upsertHeader(headers, 'Accept', 'application/json');
      return { headers, body_mode: 'json' };
    },
  },
  {
    id: 'auth-bearer',
    label: 'Bearer Auth',
    description: 'Enable Bearer auth and Authorization header.',
    apply: (input) => {
      const token = input.auth_params?.token || '{{access_token}}';
      let headers = [...(input.headers || [])];
      headers = upsertHeader(headers, 'Authorization', `Bearer ${token}`);
      return {
        headers,
        auth_type: 'bearer',
        auth_params: { ...input.auth_params, token },
      };
    },
  },
  {
    id: 'form-urlencoded',
    label: 'Form URL Encoded',
    description: 'Use x-www-form-urlencoded mode and header.',
    apply: (input) => {
      let headers = [...(input.headers || [])];
      headers = upsertHeader(headers, 'Content-Type', 'application/x-www-form-urlencoded');
      return { headers, body_mode: 'form-urlencoded' };
    },
  },
  {
    id: 'graphql-json',
    label: 'GraphQL JSON',
    description: 'Set GraphQL JSON payload scaffold.',
    apply: (input) => {
      let headers = [...(input.headers || [])];
      headers = upsertHeader(headers, 'Content-Type', 'application/json');
      headers = upsertHeader(headers, 'Accept', 'application/json');
      const body = input.body?.trim()
        ? input.body
        : JSON.stringify({ query: 'query Example { __typename }', variables: {} }, null, 2);
      return { headers, body_mode: 'json', body };
    },
  },
];

export const getRequestPresetById = (id: string): RequestPreset | null =>
  REQUEST_PRESETS.find((preset) => preset.id === id) || null;
