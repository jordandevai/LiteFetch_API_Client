import React, { useState } from 'react';
import ReactJson from '@microlink/react-json-view';
import { useActiveRequestStore } from '../../stores/useActiveRequestStore';
import { useLastResultsQuery } from '../../hooks/useLastResults';
import { Clock, AlertCircle, Copy } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useWorkspaceLockStore } from '../../stores/useWorkspaceLockStore';

export const ResponseViewer = () => {
  const { result, isRunning, resultsByRequest, activeRequestId, sentByRequest } = useActiveRequestStore();
  const { data: lastResults } = useLastResultsQuery();
  const isLocked = useWorkspaceLockStore((s) => s.isLocked);
  const activeResult =
    activeRequestId && (resultsByRequest[activeRequestId] || lastResults[activeRequestId])
      ? resultsByRequest[activeRequestId] || lastResults[activeRequestId]
      : result;
  const activeRequestInfo = activeRequestId ? sentByRequest[activeRequestId] : null;
  const [tab, setTab] = useState<'json' | 'raw' | 'headers' | 'request'>('json');

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
  const rawBody =
    typeof activeResult.body === 'string'
      ? activeResult.body
      : JSON.stringify(activeResult.body ?? {}, null, 2);

  const rawFull = [
    `HTTP ${activeResult.status_code}`,
    ...Object.entries(activeResult.headers || {}).map(([k, v]) => `${k}: ${v}`),
    '',
    rawBody,
  ].join('\n');

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
          <ReactJson
            src={(() => {
              const body = activeResult.body;
              if (body && typeof body === 'object') return body;
              if (typeof body === 'string') {
                try {
                  const parsed = JSON.parse(body);
                  if (parsed && typeof parsed === 'object') return parsed;
                } catch {
                  /* ignore parse errors */
                }
                return { raw: body };
              }
              return { raw: body ?? '' };
            })()}
            theme="rjv-default"
            style={{ backgroundColor: 'transparent' }}
            name={false}
            displayDataTypes={false}
            enableClipboard={(copy) => {
              // Strip quotes from string values when copying
              const value = copy.src;
              let textToCopy: string;

              if (typeof value === 'string') {
                // For string values, copy without quotes
                textToCopy = value;
              } else if (typeof value === 'number' || typeof value === 'boolean') {
                // For primitives, convert to string
                textToCopy = String(value);
              } else {
                // For objects/arrays, stringify with formatting
                textToCopy = JSON.stringify(value, null, 2);
              }

              navigator.clipboard.writeText(textToCopy);
            }}
          />
        )}

        {tab === 'raw' && (
          <div className="space-y-2">
            <div className="flex justify-end gap-2">
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
