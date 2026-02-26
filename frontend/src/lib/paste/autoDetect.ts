export type PasteKind = 'json' | 'urlencoded' | 'graphql' | 'xml' | 'text';

export type PasteDetection = {
  kind: PasteKind;
  confidence: number;
  normalized: string;
};

const looksLikeJson = (text: string) => {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) return false;
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
};

const looksLikeUrlEncoded = (text: string) => {
  const trimmed = text.trim();
  if (!trimmed.includes('=')) return false;
  if (trimmed.includes('{') || trimmed.includes('}')) return false;
  return trimmed
    .split('&')
    .every((pair) => pair.length > 0 && (pair.includes('=') || decodeURIComponent(pair) === pair));
};

const looksLikeGraphQL = (text: string) => {
  const trimmed = text.trim();
  return /^(query|mutation|subscription)\b/.test(trimmed) || (trimmed.startsWith('{') && trimmed.includes('\n'));
};

const looksLikeXml = (text: string) => {
  const trimmed = text.trim();
  return /^<\?xml\b/.test(trimmed) || /^<([a-zA-Z][\w:.-]*)(\s|>)/.test(trimmed);
};

export const detectPastedContent = (raw: unknown): PasteDetection => {
  const text = typeof raw === 'string' ? raw : raw == null ? '' : String(raw);
  const normalized = text.replace(/\r\n/g, '\n');

  if (looksLikeJson(normalized)) {
    return { kind: 'json', confidence: 0.98, normalized };
  }

  if (looksLikeUrlEncoded(normalized)) {
    return { kind: 'urlencoded', confidence: 0.9, normalized };
  }

  if (looksLikeGraphQL(normalized)) {
    return { kind: 'graphql', confidence: 0.72, normalized };
  }

  if (looksLikeXml(normalized)) {
    return { kind: 'xml', confidence: 0.92, normalized };
  }

  return { kind: 'text', confidence: 0.5, normalized };
};
