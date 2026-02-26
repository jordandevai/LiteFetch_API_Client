import type { RequestResult } from '../api';
import { runWithConcurrency } from './requestExecution';

export type BulkRunItem = {
  requestId: string;
  execute: () => Promise<RequestResult>;
};

export type BulkRunReportItem = {
  requestId: string;
  status: 'passed' | 'failed';
  statusCode: number;
  durationMs: number;
  error?: string;
};

export type BulkRunReport = {
  total: number;
  passed: number;
  failed: number;
  startedAt: number;
  finishedAt: number;
  durationMs: number;
  items: BulkRunReportItem[];
};

export type BulkRunHooks = {
  onItemStart?: (requestId: string) => void | Promise<void>;
  onItemDone?: (requestId: string, result: RequestResult) => void | Promise<void>;
  onItemError?: (requestId: string, error: unknown) => void | Promise<void>;
};

export async function executeBulkRun(
  items: BulkRunItem[],
  concurrency: number,
  hooks: BulkRunHooks = {},
): Promise<BulkRunReport> {
  const startedAt = Date.now();
  const reportItems: BulkRunReportItem[] = [];

  await runWithConcurrency(
    items,
    async (item) => {
      await hooks.onItemStart?.(item.requestId);
      const result = await item.execute();
      await hooks.onItemDone?.(item.requestId, result);
      const failed = result.status_code >= 400 || Boolean(result.error);
      reportItems.push({
        requestId: item.requestId,
        status: failed ? 'failed' : 'passed',
        statusCode: result.status_code,
        durationMs: result.duration_ms,
        error: result.error,
      });
      return result;
    },
    concurrency,
  ).then((settled) => {
    settled.forEach((entry, idx) => {
      if (entry.status === 'fulfilled') return;
      const requestId = items[idx]?.requestId || `item-${idx}`;
      void hooks.onItemError?.(requestId, entry.reason);
      reportItems.push({
        requestId,
        status: 'failed',
        statusCode: 0,
        durationMs: 0,
        error: String(entry.reason ?? 'Unknown error'),
      });
    });
  });

  const finishedAt = Date.now();
  const passed = reportItems.filter((i) => i.status === 'passed').length;
  const failed = reportItems.length - passed;

  return {
    total: items.length,
    passed,
    failed,
    startedAt,
    finishedAt,
    durationMs: finishedAt - startedAt,
    items: reportItems,
  };
}
