export type TemplateRow = {
  key: string;
  value?: string;
  enabled?: boolean;
  secret?: boolean;
  type?: 'text' | 'file' | 'binary';
  description?: string;
  file_path?: string;
  file_inline?: string;
  file_name?: string;
};

export type RequestTemplatePayload = {
  method: string;
  url: string;
  body: string;
  body_mode: 'raw' | 'json' | 'form-urlencoded' | 'form-data' | 'binary';
  headers: TemplateRow[];
  query_params: TemplateRow[];
  form_body: TemplateRow[];
  auth_type: 'none' | 'basic' | 'bearer';
  auth_params: Record<string, string>;
};

export type RequestTemplate = {
  id: string;
  name: string;
  created_at: number;
  updated_at: number;
  payload: RequestTemplatePayload;
};

const KEY = 'litefetch.requestTemplates.v1';

const now = () => Date.now();

const canStore = () => typeof window !== 'undefined' && !!window.localStorage;

const safeParse = (raw: string | null): RequestTemplate[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as RequestTemplate[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const listRequestTemplates = (): RequestTemplate[] => {
  if (!canStore()) return [];
  return safeParse(window.localStorage.getItem(KEY)).sort((a, b) => b.updated_at - a.updated_at);
};

export const saveRequestTemplate = (name: string, payload: RequestTemplatePayload): RequestTemplate => {
  const trimmed = name.trim() || 'Untitled Template';
  const existing = listRequestTemplates();
  const index = existing.findIndex((item) => item.name.toLowerCase() === trimmed.toLowerCase());
  const timestamp = now();

  const next: RequestTemplate =
    index >= 0
      ? {
          ...existing[index],
          name: trimmed,
          updated_at: timestamp,
          payload,
        }
      : {
          id: `tpl_${timestamp}_${Math.random().toString(36).slice(2, 8)}`,
          name: trimmed,
          created_at: timestamp,
          updated_at: timestamp,
          payload,
        };

  const merged =
    index >= 0 ? existing.map((item, i) => (i === index ? next : item)) : [...existing, next];

  if (canStore()) {
    window.localStorage.setItem(KEY, JSON.stringify(merged));
  }
  return next;
};

export const deleteRequestTemplate = (templateId: string): void => {
  const next = listRequestTemplates().filter((item) => item.id !== templateId);
  if (canStore()) {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  }
};

export const getRequestTemplate = (templateId: string): RequestTemplate | null => {
  return listRequestTemplates().find((item) => item.id === templateId) || null;
};
