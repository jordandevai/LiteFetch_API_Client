export type QueryParamRow = {
  key: string;
  value: string;
  enabled?: boolean;
  secret?: boolean;
};

const PLACEHOLDER_BASE = 'http://placeholder.local';
const ABSOLUTE_URL_RE = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//;

const coerceString = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (value == null) return '';
  return String(value);
};

export const normalizeUrlForParse = (url: unknown): string => {
  const raw = coerceString(url);
  return raw.replace(/\?\?/g, '?').replace(/%3F/gi, '?');
};

const decodeURIComponentSafe = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const decodePathname = (pathname: string): string =>
  pathname
    .split('/')
    .map((part) => decodeURIComponentSafe(part))
    .join('/');

export const decodeUrlForEditor = (url: unknown): string => {
  const fallback = coerceString(url);
  try {
    const normalized = normalizeUrlForParse(url);
    const hasProtocol = ABSOLUTE_URL_RE.test(normalized);
    const parsed = new URL(normalized, hasProtocol ? undefined : PLACEHOLDER_BASE);
    const pathname = decodePathname(parsed.pathname || '');
    const searchPairs = Array.from(parsed.searchParams.entries());
    const search = searchPairs.length
      ? `?${searchPairs.map(([k, v]) => (v === '' ? k : `${k}=${v}`)).join('&')}`
      : '';
    const hashRaw = parsed.hash.startsWith('#') ? parsed.hash.slice(1) : parsed.hash;
    const hash = hashRaw ? `#${decodeURIComponentSafe(hashRaw)}` : '';

    if (hasProtocol) {
      return `${parsed.origin}${pathname}${search}${hash}`;
    }
    return `${pathname}${search}${hash}`;
  } catch {
    return fallback;
  }
};

export const encodeUrlForRequest = (url: unknown): string => {
  const fallback = coerceString(url);
  try {
    const normalized = normalizeUrlForParse(url);
    const hasProtocol = ABSOLUTE_URL_RE.test(normalized);
    const parsed = new URL(normalized, hasProtocol ? undefined : PLACEHOLDER_BASE);
    if (hasProtocol) return parsed.toString();
    return `${parsed.pathname || ''}${parsed.search || ''}${parsed.hash || ''}`;
  } catch {
    return fallback;
  }
};

export const parseQueryParamsFromUrl = (url: unknown): QueryParamRow[] => {
  try {
    const normalized = normalizeUrlForParse(url);
    const hasProtocol = ABSOLUTE_URL_RE.test(normalized);
    const parsed = new URL(normalized, hasProtocol ? undefined : PLACEHOLDER_BASE);
    if (parsed.search.startsWith('??')) {
      parsed.search = parsed.search.replace(/^\?+/, '?');
    }

    const params: QueryParamRow[] = [];
    parsed.searchParams.forEach((value, key) => {
      params.push({ key: key.replace(/^\?+/, ''), value, enabled: true });
    });
    return params.length ? params : [{ key: '', value: '', enabled: true }];
  } catch {
    return [{ key: '', value: '', enabled: true }];
  }
};

export const buildUrlWithParams = (
  url: unknown,
  params: Array<Pick<QueryParamRow, 'key' | 'value' | 'enabled'>> | undefined,
): string => {
  const fallback = coerceString(url);
  try {
    const normalized = normalizeUrlForParse(url);
    const hasProtocol = ABSOLUTE_URL_RE.test(normalized);
    const parsed = new URL(normalized, hasProtocol ? undefined : PLACEHOLDER_BASE);
    const next = new URLSearchParams();

    (params || []).forEach((row) => {
      if (row.enabled === false) return;
      const key = (row.key || '').trim();
      if (!key) return;
      next.append(key, row.value ?? '');
    });

    parsed.search = next.toString() ? `?${next.toString()}` : '';
    const encoded = hasProtocol
      ? parsed.toString()
      : `${parsed.pathname || ''}${parsed.search || ''}${parsed.hash || ''}`;
    return decodeUrlForEditor(encoded);
  } catch {
    return decodeUrlForEditor(fallback);
  }
};

export const prettyFormatUrlQuery = (url: unknown): string => {
  const fallback = coerceString(url);
  try {
    const normalized = normalizeUrlForParse(url);
    const hasProtocol = ABSOLUTE_URL_RE.test(normalized);
    const parsed = new URL(normalized, hasProtocol ? undefined : PLACEHOLDER_BASE);
    const sortedEntries = Array.from(parsed.searchParams.entries()).sort(([a], [b]) => a.localeCompare(b));
    parsed.search = '';
    sortedEntries.forEach(([k, v]) => parsed.searchParams.append(k, v));
    const next = hasProtocol
      ? parsed.toString()
      : `${parsed.pathname || ''}${parsed.search || ''}${parsed.hash || ''}`;
    return decodeUrlForEditor(next);
  } catch {
    return decodeUrlForEditor(fallback);
  }
};
