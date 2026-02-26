export type BasicKeyValueRow = {
  key?: string;
  value?: string;
};

const hasCellContent = (value: unknown): boolean => typeof value === 'string' && value.trim().length > 0;

export const hasRowContent = (row: BasicKeyValueRow | undefined): boolean => {
  if (!row) return false;
  return hasCellContent(row.key) || hasCellContent(row.value);
};

export const applyRowPatchWithTrailingEmpty = <T extends BasicKeyValueRow>(
  rows: T[],
  index: number,
  patch: Partial<T>,
  createEmptyRow: () => T,
): T[] => {
  const source = rows || [];
  const next = [...source];
  const previous = (next[index] || {}) as T;
  const updated = { ...previous, ...patch } as T;
  next[index] = updated;

  const isLast = index === source.length - 1;
  if (!isLast) return next;

  const hadContent = hasRowContent(previous);
  const hasContent = hasRowContent(updated);
  if (!hadContent && hasContent) {
    next.push(createEmptyRow());
  }

  return next;
};
