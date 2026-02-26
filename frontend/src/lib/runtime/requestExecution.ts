export async function runWithConcurrency<T, R>(
  items: T[],
  worker: (item: T, index: number) => Promise<R>,
  concurrency = 4,
): Promise<Array<PromiseSettledResult<R>>> {
  if (!items.length) return [];
  const limit = Math.max(1, Math.min(concurrency, items.length));
  const results: Array<PromiseSettledResult<R>> = new Array(items.length);
  let cursor = 0;

  const runner = async () => {
    while (true) {
      const idx = cursor;
      cursor += 1;
      if (idx >= items.length) return;
      try {
        const value = await worker(items[idx], idx);
        results[idx] = { status: 'fulfilled', value };
      } catch (reason) {
        results[idx] = { status: 'rejected', reason };
      }
    }
  };

  await Promise.all(Array.from({ length: limit }, () => runner()));
  return results;
}
