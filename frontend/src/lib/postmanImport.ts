import type { Collection, CollectionFolder, ExtractionRule, HttpRequest } from './api';

type PostmanHeader = { key: string; value: string | undefined };
type PostmanEvent = {
  listen?: string;
  script?: { exec?: string[] | string };
};
type PostmanFormRow = { key?: string; value?: string; src?: string; disabled?: boolean; type?: string };
type PostmanBody = {
  mode?: 'raw' | 'urlencoded' | 'formdata' | 'file' | string;
  raw?: string;
  urlencoded?: PostmanFormRow[];
  formdata?: PostmanFormRow[];
  file?: { src?: string | string[] };
  options?: { raw?: { language?: string } };
};
type PostmanItem = {
  name: string;
  item?: PostmanItem[];
  event?: PostmanEvent[];
  request?: {
    method: string;
    header?: PostmanHeader[];
    url?: { raw?: string };
    body?: PostmanBody;
  };
};

type PostmanCollection = {
  info?: { name?: string };
  item: PostmanItem[];
};

const genId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

const mapHeaders = (headers?: PostmanHeader[]) => {
  const out: Record<string, string> = {};
  headers?.forEach((h) => {
    if (h.key) out[h.key] = h.value || '';
  });
  return out;
};

const cleanExpression = (expr: string): string => {
  let cleaned = expr.trim().replace(/;$/, '').replace(/^await\s+/, '');

  // Prefer the first truthy branch before fallbacks
  const ternaryQ = cleaned.indexOf('?');
  const ternaryC = cleaned.indexOf(':', ternaryQ);
  if (ternaryQ > -1 && ternaryC > ternaryQ) {
    cleaned = cleaned.slice(ternaryQ + 1, ternaryC).trim();
  }
  cleaned = cleaned.split('||')[0].split('??')[0].trim();

  // Strip common wrappers
  const wrapper = /^(JSON\.stringify|String|Number|Boolean|parseInt|parseFloat)\((.*)\)$/s;
  while (wrapper.test(cleaned)) {
    cleaned = cleaned.replace(wrapper, '$2').trim();
  }

  cleaned = cleaned
    .replace(/pm\.response\.json\(\)\.?/g, '')
    .replace(/\?\./g, '.')
    .replace(/\[['"]([^'"]+)['"]\]/g, '.$1');

  const dotMatch = cleaned.match(/^[a-zA-Z_][\w]*\.(.*)$/s);
  if (dotMatch) cleaned = dotMatch[1];

  return cleaned.trim();
};

const deriveSourcePath = (rawExpr: string): string | null => {
  const cleaned = cleanExpression(rawExpr);
  if (!cleaned) return null;

  // Reject literals or obvious non-response expressions
  if (/^['"`]/.test(cleaned)) return null;
  return cleaned;
};

const parseEnvironmentSets = (script?: string): ExtractionRule[] => {
  if (!script) return [];
  const rules: ExtractionRule[] = [];
  const seenTargets = new Set<string>();

  const patterns = [
    /pm\.environment\.set\(\s*['"]([^'"]+)['"]\s*,\s*([^)]*?)\)/g,
    /(?:^|\s)set\(\s*['"]([^'"]+)['"]\s*,\s*([^)]*?)\)/g,
  ];

  patterns.forEach((regex) => {
    let match = regex.exec(script);
    while (match) {
      const [, target, expr] = match;
      const sourcePath = deriveSourcePath(expr);
      if (sourcePath && !seenTargets.has(target)) {
        seenTargets.add(target);
        rules.push({
          id: genId(),
          source_path: sourcePath,
          target_variable: target,
        });
      }
      match = regex.exec(script);
    }
  });

  return rules;
};

const baseName = (path: string | undefined) => {
  if (!path) return '';
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || '';
};

const mapBody = (
  body?: PostmanBody,
): { body: string | null; body_mode: HttpRequest['body_mode']; form_body: HttpRequest['form_body']; binary?: HttpRequest['binary'] } => {
  if (!body) return { body: null, body_mode: 'raw', form_body: [] };

  if (body.mode === 'urlencoded') {
    const rows =
      body.urlencoded?.map((row) => ({
        key: row.key || '',
        value: row.value || '',
        enabled: row.disabled === undefined ? true : !row.disabled,
      })) || [];
    return { body: null, body_mode: 'form-urlencoded', form_body: rows };
  }

  if (body.mode === 'formdata') {
    const rows =
      body.formdata?.map((row) => ({
        key: row.key || '',
        value: row.type === 'file' ? row.src || row.value || '' : row.value || '',
        type: (row.type === 'file' ? 'file' : 'text') as 'text' | 'file' | 'binary',
        file_path: row.type === 'file' ? row.src || '' : undefined,
        file_name: row.type === 'file' ? baseName(row.src || '') : undefined,
        enabled: row.disabled === undefined ? true : !row.disabled,
      })) || [];
    return { body: null, body_mode: 'form-data', form_body: rows };
  }

  if (body.mode === 'file') {
    const src = body.file?.src;
    const filePath = Array.isArray(src) ? src?.[0] : src;
    if (filePath) {
      return {
        body: null,
        body_mode: 'binary',
        form_body: [],
        binary: { file_path: filePath, file_name: baseName(filePath || '') },
      };
    }
  }

  const raw = body.raw ?? null;
  const isJson = body.options?.raw?.language === 'json';
  return { body: raw, body_mode: isJson ? 'json' : 'raw', form_body: [] };
};

const extractRulesFromEvents = (events?: PostmanEvent[]): ExtractionRule[] => {
  const scripts = events
    ?.filter((ev) => ev.listen === 'test' && ev.script?.exec)
    .map((ev) => (Array.isArray(ev.script!.exec) ? ev.script!.exec.join('\n') : ev.script!.exec));

  if (!scripts || !scripts.length) return [];

  return scripts.flatMap((script) => parseEnvironmentSets(script));
};

const mapItem = (item: PostmanItem): CollectionFolder | HttpRequest => {
  if (item.item && item.item.length) {
    return {
      id: genId(),
      name: item.name || 'Folder',
      items: item.item.map(mapItem),
    };
  }

  const req = item.request;
  const { body, body_mode, form_body, binary } = mapBody(req?.body);
  const extract_rules = extractRulesFromEvents(item.event);

  return {
    id: genId(),
    name: item.name || 'Request',
    method: req?.method || 'GET',
    url: req?.url?.raw || '',
    headers: mapHeaders(req?.header),
    body,
    body_mode,
    form_body,
    binary,
    extract_rules,
  };
};

export const importPostmanCollection = (data: PostmanCollection): Collection => {
  return {
    id: genId(),
    name: data.info?.name || 'Imported Postman Collection',
    items: (data.item || []).map(mapItem),
  };
};
