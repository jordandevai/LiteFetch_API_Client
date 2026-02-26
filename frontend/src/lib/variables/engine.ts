export type VariableSource = 'environment' | 'local';

export type VariableResolution = {
  key: string;
  value: string;
  source: VariableSource;
};

export type VariableToken = {
  raw: string;
  key: string;
  syntax: 'double-curly' | 'dollar-brace';
  index: number;
};

export type VariableContext = {
  values: Record<string, string>;
  sourceByKey?: Record<string, VariableSource>;
};

const DOUBLE_CURLY_RE = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;
const DOLLAR_BRACE_RE = /\$\{\s*([a-zA-Z0-9_.-]+)\s*\}/g;

const pushMatches = (
  input: string,
  re: RegExp,
  syntax: VariableToken['syntax'],
  out: VariableToken[],
) => {
  re.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(input)) !== null) {
    out.push({
      raw: match[0],
      key: match[1],
      syntax,
      index: match.index,
    });
  }
};

export const extractVariableTokens = (input: unknown): VariableToken[] => {
  const value = typeof input === 'string' ? input : input == null ? '' : String(input);
  if (!value) return [];
  const tokens: VariableToken[] = [];
  pushMatches(value, DOUBLE_CURLY_RE, 'double-curly', tokens);
  pushMatches(value, DOLLAR_BRACE_RE, 'dollar-brace', tokens);
  return tokens.sort((a, b) => a.index - b.index);
};

export const resolveVariableToken = (
  token: VariableToken,
  context: VariableContext,
): VariableResolution | null => {
  const value = context.values[token.key];
  if (value == null) return null;
  return {
    key: token.key,
    value,
    source: context.sourceByKey?.[token.key] || 'local',
  };
};

export const findUnresolvedVariables = (
  input: unknown,
  context: VariableContext,
): string[] => {
  const unresolved = new Set<string>();
  extractVariableTokens(input).forEach((token) => {
    if (!resolveVariableToken(token, context)) unresolved.add(token.key);
  });
  return Array.from(unresolved);
};

export const resolveTemplateText = (
  input: unknown,
  context: VariableContext,
): { output: string; unresolved: string[] } => {
  const value = typeof input === 'string' ? input : input == null ? '' : String(input);
  if (!value) return { output: '', unresolved: [] };

  const unresolved = new Set<string>();
  const replacer = (match: string, key: string) => {
    const next = context.values[key];
    if (next == null) {
      unresolved.add(key);
      return match;
    }
    return next;
  };

  const output = value.replace(DOUBLE_CURLY_RE, replacer).replace(DOLLAR_BRACE_RE, replacer);
  return { output, unresolved: Array.from(unresolved) };
};

export const buildEnvironmentVariableContext = (
  envVariables: Record<string, unknown> | undefined,
): VariableContext => {
  const values: Record<string, string> = {};
  const sourceByKey: Record<string, VariableSource> = {};
  Object.entries(envVariables || {}).forEach(([key, raw]) => {
    values[key] = raw == null ? '' : String(raw);
    sourceByKey[key] = 'environment';
  });
  return { values, sourceByKey };
};

export const buildVariableTemplateSuggestions = (keys: string[]): string[] => {
  const unique = Array.from(new Set(keys.filter(Boolean)));
  const suggestions: string[] = [];
  unique.forEach((key) => {
    suggestions.push(`{{${key}}}`);
    suggestions.push(`\${${key}}`);
  });
  return suggestions;
};
