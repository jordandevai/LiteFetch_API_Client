export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export type JsonRow = {
  path: string;
  depth: number;
  key: string | null;
  hasChildren: boolean;
  isExpanded: boolean;
  preview: string;
  kind: 'object' | 'array' | 'primitive';
};

type StackNode = {
  value: JsonValue;
  path: string;
  depth: number;
  key: string | null;
};

const PREVIEW_MAX = 180;

const truncate = (text: string): string => {
  if (text.length <= PREVIEW_MAX) return text;
  return `${text.slice(0, PREVIEW_MAX)}...`;
};

const previewValue = (value: JsonValue): string => {
  if (Array.isArray(value)) return `[${value.length}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).length}}`;
  if (typeof value === 'string') return truncate(JSON.stringify(value));
  return String(value);
};

export const estimateJsonComplexity = (
  root: JsonValue,
  maxNodes = 100_000,
  maxDepth = 80,
): { nodeCount: number; maxDepthSeen: number; tooComplex: boolean } => {
  const stack: Array<{ value: JsonValue; depth: number }> = [{ value: root, depth: 0 }];
  let nodeCount = 0;
  let maxDepthSeen = 0;

  while (stack.length) {
    const node = stack.pop()!;
    nodeCount += 1;
    if (node.depth > maxDepthSeen) maxDepthSeen = node.depth;

    if (nodeCount > maxNodes || node.depth > maxDepth) {
      return { nodeCount, maxDepthSeen, tooComplex: true };
    }

    if (Array.isArray(node.value)) {
      for (let i = node.value.length - 1; i >= 0; i -= 1) {
        stack.push({ value: node.value[i], depth: node.depth + 1 });
      }
      continue;
    }

    if (node.value && typeof node.value === 'object') {
      const entries = Object.entries(node.value);
      for (let i = entries.length - 1; i >= 0; i -= 1) {
        stack.push({ value: entries[i][1], depth: node.depth + 1 });
      }
    }
  }

  return { nodeCount, maxDepthSeen, tooComplex: false };
};

export const buildVisibleRows = (
  root: JsonValue,
  expanded: Set<string>,
  maxRows = 200_000,
): JsonRow[] => {
  const rows: JsonRow[] = [];
  const stack: StackNode[] = [{ value: root, path: '$', depth: 0, key: null }];

  while (stack.length && rows.length < maxRows) {
    const node = stack.pop()!;
    const hasChildren =
      (Array.isArray(node.value) && node.value.length > 0) ||
      (!!node.value && typeof node.value === 'object' && !Array.isArray(node.value) && Object.keys(node.value).length > 0);
    const isExpanded = expanded.has(node.path);
    const kind = Array.isArray(node.value)
      ? 'array'
      : node.value && typeof node.value === 'object'
        ? 'object'
        : 'primitive';

    rows.push({
      path: node.path,
      depth: node.depth,
      key: node.key,
      hasChildren,
      isExpanded,
      preview: previewValue(node.value),
      kind,
    });

    if (!hasChildren || !isExpanded) continue;

    if (Array.isArray(node.value)) {
      for (let i = node.value.length - 1; i >= 0; i -= 1) {
        stack.push({
          value: node.value[i],
          path: `${node.path}[${i}]`,
          depth: node.depth + 1,
          key: String(i),
        });
      }
      continue;
    }

    const entries = Object.entries(node.value as Record<string, JsonValue>);
    for (let i = entries.length - 1; i >= 0; i -= 1) {
      const [k, v] = entries[i];
      stack.push({
        value: v,
        path: `${node.path}.${k}`,
        depth: node.depth + 1,
        key: k,
      });
    }
  }

  return rows;
};
