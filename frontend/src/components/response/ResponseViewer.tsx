import React, { useEffect, useMemo, useState } from 'react';
import { useActiveRequestStore } from '../../stores/useActiveRequestStore';
import { useLastResultsQuery } from '../../hooks/useLastResults';
import { Clock, AlertCircle, Copy } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useWorkspaceLockStore } from '../../stores/useWorkspaceLockStore';
import { VirtualJsonViewer } from './VirtualJsonViewer';
import { estimateJsonComplexity, type JsonValue } from './jsonTree';

export const ResponseViewer = () => {
  const { result, runningByRequest, resultsByRequest, activeRequestId, sentByRequest } = useActiveRequestStore();
  const { data: lastResults } = useLastResultsQuery();
  const isLocked = useWorkspaceLockStore((s) => s.isLocked);
  const activeResult =
    activeRequestId && (resultsByRequest[activeRequestId] || lastResults[activeRequestId])
      ? resultsByRequest[activeRequestId] || lastResults[activeRequestId]
      : result;
  const activeRequestInfo = activeRequestId ? sentByRequest[activeRequestId] : null;
  const [tab, setTab] = useState<'json' | 'raw' | 'headers' | 'request'>('json');
  const [forceJsonRender, setForceJsonRender] = useState(false);

  const rawBody = useMemo(() => {
    if (!activeResult) return '';
    if (typeof activeResult.body === 'string') return activeResult.body;
    try {
      return JSON.stringify(activeResult.body ?? {}, null, 2);
    } catch {
      return String(activeResult.body ?? '');
    }
  }, [activeResult]);

  const rawFull = useMemo(
    () =>
      activeResult
        ? [
            `HTTP ${activeResult.status_code}`,
            ...Object.entries(activeResult.headers || {}).map(([k, v]) => `${k}: ${v}`),
            '',
            rawBody,
          ].join('\n')
        : '',
    [activeResult, rawBody],
  );

  useEffect(() => {
    if (!activeResult) return;
    setForceJsonRender(false);
  }, [activeResult?.request_id, activeResult?.timestamp]);

  const jsonAnalysis = useMemo(() => {
    if (!activeResult || tab !== 'json') return null;

    let parsed: JsonValue | null = null;
    let parseError: string | null = null;
    const body = activeResult.body;

    if (body && typeof body === 'object') {
      parsed = body as JsonValue;
    } else if (typeof body === 'string') {
      const trimmed = body.trim();
      const likelyJson =
        Boolean(activeResult.body_is_json) ||
        trimmed.startsWith('{') ||
        trimmed.startsWith('[');
      if (!likelyJson) {
        parseError = 'Response body is not marked as JSON';
      } else {
        try {
          parsed = JSON.parse(body) as JsonValue;
        } catch (ex) {
          parseError = ex instanceof Error ? ex.message : 'Unable to parse JSON body';
        }
      }
    } else {
      parseError = 'Response body is empty';
    }

    if (!parsed) {
      return {
        parsed: null,
        parseError,
        complexity: null,
      };
    }

    const complexity = estimateJsonComplexity(parsed);
    return { parsed, parseError: null, complexity };
  }, [activeResult, tab]);

  const isRunning = activeRequestId ? Boolean(runningByRequest[activeRequestId]) : false;

  if (isRunning) {
    return <div className="h-full flex items-center justify-center animate-pulse text-primary">Sending Request...</div>;
  }

  if (isLocked) {
    return <div className="h-full flex items-center justify-center text-muted-foreground text-sm">Workspace locked. Unlock to view responses.</div>;
  }

  if (!activeResult) {
    return <div className="h-full flex items-center justify-center text-muted-foreground text-sm">No Response Yet</div>;
  }

  const isError = activeResult.status_code >= 400 || activeResult.status_code === 0;

  const requestSummary = activeRequestInfo
    ? {
        method: activeRequestInfo.method,
        url: activeRequestInfo.url,
        query_params: activeRequestInfo.query_params,
        headers: activeRequestInfo.headers,
        body_mode: activeRequestInfo.body_mode,
        body: activeRequestInfo.body,
        form_body: activeRequestInfo.form_body,
      }
    : null;

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Status Bar */}
      <div className="p-3 border-b border-border bg-muted flex justify-between items-center text-xs">
        <div className="flex items-center gap-3">
          <span className={cn("font-bold px-2 py-1 rounded", isError ? "bg-destructive/10 text-destructive" : "bg-success/10 text-success")}>
            {activeResult.status_code === 0 ? "ERR" : activeResult.status_code} {activeResult.status_code === 200 ? "OK" : ""}
          </span>
          <span className="flex items-center gap-1 text-muted-foreground">
            <Clock size={12} /> {activeResult.duration_ms.toFixed(0)}ms
          </span>
        </div>
        <div className="text-muted-foreground">
            {new Date(activeResult.timestamp * 1000).toLocaleTimeString()}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border flex text-xs">
        {['json', 'raw', 'headers', 'request'].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t as any)}
            className={cn(
              'px-3 py-2 font-semibold uppercase tracking-wide border-b-2',
              tab === t ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
            type="button"
          >
            {t}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-2 space-y-2">
        {activeResult.error && (
          <div className="text-destructive p-4 border border-destructive/20 rounded bg-destructive/10 mb-2">
            <div className="font-bold flex items-center gap-2"><AlertCircle size={16}/> System Error</div>
            <div className="mt-2 font-mono text-xs">{activeResult.error}</div>
          </div>
        )}

        {tab === 'json' && (
          <div className="h-full">
            {!jsonAnalysis?.parsed && (
              <div className="text-xs text-muted-foreground p-3 border border-border rounded bg-muted/20 space-y-2">
                <div>Response body is not valid JSON for tree view.</div>
                {jsonAnalysis?.parseError && <div className="font-mono text-[11px]">{jsonAnalysis.parseError}</div>}
                <button
                  className="px-3 py-1.5 text-xs rounded border border-border bg-white hover:bg-muted transition-colors"
                  type="button"
                  onClick={() => setTab('raw')}
                >
                  Open Raw
                </button>
              </div>
            )}

            {jsonAnalysis?.parsed && jsonAnalysis.complexity?.tooComplex && !forceJsonRender && (
              <div className="text-xs text-muted-foreground p-3 border border-border rounded bg-muted/20 space-y-2">
                <div className="font-semibold text-foreground">JSON tree rendering is likely to be slow for this payload.</div>
                <div>
                  Nodes inspected: {jsonAnalysis.complexity.nodeCount} | Depth: {jsonAnalysis.complexity.maxDepthSeen}
                </div>
                <div className="flex gap-2">
                  <button
                    className="px-3 py-1.5 text-xs rounded border border-border bg-white hover:bg-muted transition-colors"
                    type="button"
                    onClick={() => setTab('raw')}
                  >
                    Open Raw
                  </button>
                  <button
                    className="px-3 py-1.5 text-xs rounded border border-border bg-white hover:bg-muted transition-colors"
                    type="button"
                    onClick={() => setForceJsonRender(true)}
                  >
                    Try JSON View Anyway
                  </button>
                </div>
              </div>
            )}

            {jsonAnalysis?.parsed && (!jsonAnalysis.complexity?.tooComplex || forceJsonRender) && (
              <VirtualJsonViewer data={jsonAnalysis.parsed} />
            )}
          </div>
        )}

        {tab === 'raw' && (
          <div className="space-y-2">
            <div className="flex justify-end gap-2">
              <button
                className="px-3 py-1.5 text-xs rounded border border-border bg-white hover:bg-muted transition-colors flex items-center gap-1 font-medium"
                type="button"
                onClick={() => navigator.clipboard.writeText(rawBody)}
              >
                <Copy size={12} /> Copy Body
              </button>
              <button
                className="px-3 py-1.5 text-xs rounded border border-border bg-white hover:bg-muted transition-colors flex items-center gap-1 font-medium"
                type="button"
                onClick={() => navigator.clipboard.writeText(rawFull)}
              >
                <Copy size={12} /> Copy All
              </button>
            </div>
            <pre className="whitespace-pre-wrap font-mono text-sm bg-muted border border-border rounded p-4">
{rawFull}
            </pre>
          </div>
        )}

        {tab === 'headers' && (
          <div className="space-y-2">
            {Object.entries(activeResult.headers || {}).map(([k, v]) => (
              <div key={k} className="flex items-center gap-2 text-sm">
                <span className="font-mono text-xs text-muted-foreground min-w-[140px]">{k}</span>
                <span className="font-mono">{v}</span>
              </div>
            ))}
            {(!activeResult.headers || Object.keys(activeResult.headers).length === 0) && (
              <div className="text-xs text-muted-foreground">No headers</div>
            )}
          </div>
        )}

        {tab === 'request' && (
          <div className="space-y-3">
            {!requestSummary && (
              <div className="text-xs text-muted-foreground">
                Request details unavailable for this response (loaded from history or sent before capture).
              </div>
            )}
            {requestSummary && (
              <>
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-mono font-bold">{requestSummary.method}</span>
                  <span className="font-mono break-all text-xs text-muted-foreground">{requestSummary.url}</span>
                </div>
                <div>
                  <div className="text-[10px] uppercase text-muted-foreground mb-1">Headers</div>
                  {Object.entries(requestSummary.headers || {}).map(([k, v]) => (
                    <div key={k} className="flex items-center gap-2 text-sm">
                      <span className="font-mono text-xs text-muted-foreground min-w-[140px]">{k}</span>
                      <span className="font-mono break-all">{String(v)}</span>
                    </div>
                  ))}
                  {(!requestSummary.headers || Object.keys(requestSummary.headers).length === 0) && (
                    <div className="text-xs text-muted-foreground">No headers</div>
                  )}
                </div>
                {requestSummary.query_params && requestSummary.query_params.length > 0 && (
                  <div>
                    <div className="text-[10px] uppercase text-muted-foreground mb-1">Query Params</div>
                    <div className="border border-border rounded">
                      {requestSummary.query_params.map((p: any, idx: number) => (
                        <div
                          key={`${p.key}-${idx}`}
                          className={cn(
                            'flex text-xs border-b border-border px-2 py-1',
                            idx === requestSummary.query_params.length - 1 && 'border-b-0',
                            p.enabled === false && 'opacity-60',
                          )}
                        >
                          <span className="w-1/3 font-mono break-all">{p.key}</span>
                          <span className="flex-1 font-mono break-all">{p.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {requestSummary.body_mode && (
                  <div>
                    <div className="text-[10px] uppercase text-muted-foreground mb-1">Body ({requestSummary.body_mode})</div>
                    {requestSummary.body_mode === 'form-urlencoded' || requestSummary.body_mode === 'form-data' ? (
                      <div className="border border-border rounded">
                        {(requestSummary.form_body || []).map((row: any, idx: number) => (
                          <div
                            key={`${row.key}-${idx}`}
                            className={cn(
                              'flex text-xs border-b border-border px-2 py-1',
                              idx === (requestSummary.form_body || []).length - 1 && 'border-b-0',
                              row.enabled === false && 'opacity-60',
                            )}
                          >
                            <span className="w-1/3 font-mono break-all">{row.key}</span>
                            <span className="flex-1 font-mono break-all">{String(row.value)}</span>
                          </div>
                        ))}
                        {(!requestSummary.form_body || requestSummary.form_body.length === 0) && (
                          <div className="text-xs text-muted-foreground px-2 py-2">Empty form body</div>
                        )}
                      </div>
                    ) : (
                      <pre className="whitespace-pre-wrap font-mono text-sm bg-muted border border-border rounded p-3">
                        {typeof requestSummary.body === 'string'
                          ? requestSummary.body
                          : JSON.stringify(requestSummary.body ?? {}, null, 2)}
                      </pre>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Footer Spacing */}
        <div className="pt-4 pb-2"></div>
      </div>
    </div>
  );
};
