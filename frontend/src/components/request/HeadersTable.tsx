import React, { useEffect, useRef } from 'react';
import { Trash2, Plus, Lock, Unlock } from 'lucide-react';
import { cn } from '../../lib/utils';

export type HeaderRow = { key: string; value: string; enabled?: boolean; secret?: boolean };

type Props = {
  headers: HeaderRow[];
  onChange: (headers: HeaderRow[]) => void;
  showSecrets?: boolean;
};

export const HeadersTable = ({ headers, onChange, showSecrets = false }: Props) => {
  const tableRef = useRef<HTMLDivElement>(null);
  // Ensure there's always at least one empty row
  useEffect(() => {
    if (!headers || headers.length === 0) {
      onChange([{ key: '', value: '', enabled: true }]);
    }
  }, [headers, onChange]);

  const updateHeader = (idx: number, patch: Partial<HeaderRow>) => {
    const next = [...(headers || [])];
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  };

  const deleteHeader = (idx: number) => {
    const next = headers.filter((_, i) => i !== idx);
    // Keep at least one empty row
    if (next.length === 0) {
      onChange([{ key: '', value: '', enabled: true }]);
    } else {
      onChange(next);
    }
  };

  const addHeader = () => {
    onChange([...(headers || []), { key: '', value: '', enabled: true }]);
  };

  // Auto-expand: add new row when user types in the last row
  const handleChange = (idx: number, patch: Partial<HeaderRow>) => {
    updateHeader(idx, patch);

    // If this is the last row and user is typing, add a new row
    const isLastRow = idx === headers.length - 1;
    const hasContent = (patch.key && patch.key.trim()) || (patch.value && patch.value.trim());

    if (isLastRow && hasContent) {
      setTimeout(() => {
        addHeader();
      }, 50);
    }
  };

  const toggleAll = () => {
    const allEnabled = headers.every(h => h.enabled !== false);
    onChange(headers.map(h => ({ ...h, enabled: !allEnabled })));
  };

  const displayHeaders = headers && headers.length > 0 ? headers : [{ key: '', value: '', enabled: true }];
  const hasMultiple = (headers?.length || 0) > 1;

  return (
    <div className="border border-border rounded overflow-hidden" ref={tableRef}>
      {/* Table Header */}
      <div className="bg-muted border-b border-border">
        <div className="flex items-center px-2 py-2 text-xs font-medium text-muted-foreground">
          <div className="w-8 flex items-center justify-center">
            <input
              type="checkbox"
              className="rounded border-border accent-primary cursor-pointer"
              checked={headers.every(h => h.enabled !== false)}
              onChange={toggleAll}
              title="Toggle all"
            />
          </div>
          <div className="w-1/3 px-2">Key</div>
          <div className="flex-1 px-2">Value</div>
          {showSecrets && <div className="w-16 px-2 text-center">Secret</div>}
          <div className="w-10"></div>
        </div>
      </div>

      {/* Table Body */}
      <div className="divide-y divide-border">
        {displayHeaders.map((header, idx) => {
          const isEmpty = !header.key?.trim() && !header.value?.trim();
          const showDelete = !isEmpty || hasMultiple;
          return (
            <div
              key={idx}
              className={cn(
                "flex items-center px-2 py-1.5 hover:bg-muted/30 transition-colors group",
                header.enabled === false && "opacity-50"
              )}
            >
              {/* Enable/Disable Checkbox */}
              <div className="w-8 flex items-center justify-center">
                <input
                  type="checkbox"
                  className="rounded border-border accent-primary cursor-pointer"
                  checked={header.enabled !== false}
                  onChange={(e) => updateHeader(idx, { enabled: e.target.checked })}
                  title={header.enabled !== false ? "Disable" : "Enable"}
                />
              </div>

              {/* Key Input */}
              <div className="w-1/3 px-2">
                <input
                  type="text"
                  className="w-full bg-transparent border-none px-2 py-1.5 text-sm focus:outline-none focus:bg-white focus:ring-1 focus:ring-primary rounded font-mono"
                  placeholder="Content-Type"
                  value={header.key || ''}
                  onChange={(e) => handleChange(idx, { key: e.target.value })}
                  disabled={header.enabled === false}
                />
              </div>

              {/* Value Input */}
              <div className="flex-1 px-2">
                <input
                  type="text"
                  className="w-full bg-transparent border-none px-2 py-1.5 text-sm focus:outline-none focus:bg-white focus:ring-1 focus:ring-primary rounded"
                  placeholder="application/json"
                  value={header.value || ''}
                  onChange={(e) => handleChange(idx, { value: e.target.value })}
                  disabled={header.enabled === false}
                />
              </div>

              {/* Secret toggle */}
              {showSecrets && (
                <div className="w-16 flex items-center justify-center">
                  <button
                    className={cn(
                      "text-xs px-2 py-1 rounded border transition-colors",
                      header.secret
                        ? "bg-amber-50 border-amber-300 text-amber-700"
                        : "border-border text-muted-foreground hover:bg-muted/40"
                    )}
                    type="button"
                    onClick={() => updateHeader(idx, { secret: !header.secret })}
                    title={header.secret ? "Marked as secret" : "Mark as secret"}
                  >
                    {header.secret ? <Lock size={12} /> : <Unlock size={12} />}
                  </button>
                </div>
              )}

              {/* Delete Button */}
              <div className="w-10 flex items-center justify-center">
                {showDelete && (
                  <button
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive p-1 rounded transition-all"
                    type="button"
                    onClick={() => deleteHeader(idx)}
                    title="Delete header"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Row Button */}
      <div className="px-2 py-2 border-t border-border bg-muted/30">
        <button
          onClick={addHeader}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors px-2 py-1 rounded hover:bg-white"
          type="button"
        >
          <Plus size={14} />
          Add Header
        </button>
      </div>
    </div>
  );
};
