export const uniqueKey = (existing: string[], base: string) => {
  if (!existing.includes(base)) return base;
  let i = 1;
  while (existing.includes(`${base}_${i}`)) i += 1;
  return `${base}_${i}`;
};

export const renameKeyInMap = <T>(
  source: Record<string, T>,
  oldKey: string,
  newKey: string,
): Record<string, T> => {
  if (!newKey || oldKey === newKey || !(oldKey in source)) return source;
  const next: Record<string, T> = {};
  for (const [k, v] of Object.entries(source)) {
    if (k === oldKey) next[newKey] = v;
    else next[k] = v;
  }
  return next;
};
