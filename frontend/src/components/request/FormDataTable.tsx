import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Trash2, Plus, Upload, AlertTriangle, Lock, Unlock } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useKeyValueTableNavigation } from '../../lib/forms/useKeyValueTableNavigation';
import { TableValidationNotice } from './TableValidationNotice';

export type FormDataRow = {
  key: string;
  value?: string;
  enabled?: boolean;
  type?: 'text' | 'file' | 'binary';
  file_path?: string;
  file_inline?: string;
  file_name?: string;
  secret?: boolean;
};

type Props = {
  rows?: FormDataRow[];
  onChange: (rows: FormDataRow[]) => void;
  duplicateKeyIndexes?: Set<number>;
  missingKeyIndexes?: Set<number>;
};

const isTauri = typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;

const normalizeRow = (row: FormDataRow): FormDataRow => ({
  key: row.key || '',
  value: row.value ?? '',
  enabled: row.enabled !== false,
  type: row.type === 'file' || row.type === 'binary' ? row.type : 'text',
  file_path: row.file_path,
  file_inline: row.file_inline,
  file_name: row.file_name,
  secret: row.secret,
});

const ensureRows = (rows?: FormDataRow[]): FormDataRow[] => {
  const normalized = (rows || []).map(normalizeRow);
  return normalized.length ? normalized : [normalizeRow({ key: '', value: '', enabled: true, type: 'text' })];
};

const baseName = (path: string) => {
  if (!path) return '';
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || '';
};

const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') {
        // result is a data URL; strip prefix
        const commaIdx = result.indexOf(',');
        resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
      } else if (result instanceof ArrayBuffer) {
        const bytes = new Uint8Array(result);
        let binary = '';
        bytes.forEach((b) => (binary += String.fromCharCode(b)));
        resolve(btoa(binary));
      } else {
        reject(new Error('Unsupported file result'));
      }
    };
    reader.onerror = () => reject(reader.error || new Error('File read failed'));
    reader.readAsDataURL(file);
  });
};

export const FormDataTable = ({ rows = [], onChange, duplicateKeyIndexes, missingKeyIndexes }: Props) => {
  const displayRows = useMemo(() => ensureRows(rows), [rows]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeFileRow, setActiveFileRow] = useState<number | null>(null);

  useEffect(() => {
    if (!rows || rows.length === 0) {
      onChange(displayRows);
    }
  }, [rows, onChange, displayRows]);

  const updateRow = (idx: number, patch: Partial<FormDataRow>) => {
    const next = [...displayRows];
    next[idx] = { ...next[idx], ...patch };
    onChange(ensureRows(next));
  };

  const addRow = () => {
    onChange(ensureRows([...displayRows, { key: '', value: '', enabled: true, type: 'text' }]));
  };

  const deleteRow = (idx: number) => {
    const next = displayRows.filter((_, i) => i !== idx);
    onChange(ensureRows(next));
  };
  const { getCellProps } = useKeyValueTableNavigation({
    tableId: 'form-body',
    rowCount: displayRows.length,
    fields: ['key', 'type', 'value'],
    addRow,
    deleteRow,
    canDeleteRow: (rowIndex) => {
      const row = displayRows[rowIndex];
      return Boolean(row?.key?.trim() || row?.value?.trim() || row?.file_path || row?.file_inline) || displayRows.length > 1;
    },
  });

  const handleTypeChange = (idx: number, nextType: FormDataRow['type']) => {
    const patch: Partial<FormDataRow> = { type: nextType };
    if (nextType === 'text') {
      patch.file_inline = undefined;
      patch.file_path = undefined;
      patch.file_name = undefined;
    }
    if (nextType === 'file' || nextType === 'binary') {
      patch.value = '';
    }
    updateRow(idx, patch);
  };

  const handlePickFile = async (idx: number) => {
    if (isTauri) {
      try {
        const { open } = await import('@tauri-apps/plugin-dialog');
        const selected = await open({ multiple: false });
        if (!selected || Array.isArray(selected)) return;
        updateRow(idx, {
          file_path: selected,
          file_name: baseName(selected),
          file_inline: undefined,
        });
      } catch (err) {
        console.error('File pick failed', err);
      }
      return;
    }

    setActiveFileRow(idx);
    fileInputRef.current?.click();
  };

  const handleWebFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (activeFileRow == null) return;
    if (!file) return;
    try {
      const b64 = await fileToBase64(file);
      updateRow(activeFileRow, {
        file_inline: b64,
        file_name: file.name,
        file_path: undefined,
      });
    } catch (err) {
      console.error('File read failed', err);
    } finally {
      setActiveFileRow(null);
    }
  };

  const renderFileCell = (row: FormDataRow, idx: number) => {
    const hasPath = !!row.file_path;
    const hasInline = !!row.file_inline;
    const missing = !(hasPath || hasInline);
    return (
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <input
            type="text"
            className="w-full bg-transparent border-none px-2 py-1.5 text-sm focus:outline-none focus:bg-white focus:ring-1 focus:ring-primary rounded"
            placeholder="File path or leave blank and pick"
            value={row.file_path || ''}
            onChange={(e) =>
              updateRow(idx, {
                file_path: e.target.value,
                file_inline: undefined,
                file_name: e.target.value ? baseName(e.target.value) : row.file_name,
              })
            }
            disabled={row.enabled === false}
            {...getCellProps(idx, 'value')}
          />
          {(hasInline || row.file_name) && !row.file_path && (
            <div className="text-[11px] text-muted-foreground px-2">
              {row.file_name ? `Attached: ${row.file_name} (inline)` : 'Inline file attached'}
            </div>
          )}
          {missing && row.enabled !== false && (
            <div className="text-[11px] text-amber-700 flex items-center gap-1 px-2">
              <AlertTriangle size={12} />
              File required
            </div>
          )}
        </div>
        <button
          type="button"
          className="px-2 py-1 rounded border border-border text-xs flex items-center gap-1 hover:bg-muted/40"
          onClick={() => handlePickFile(idx)}
          disabled={row.enabled === false}
        >
          <Upload size={12} />
          Pick
        </button>
      </div>
    );
  };

  return (
    <div className="border border-border rounded overflow-hidden">
      <div className="bg-muted border-b border-border">
        <div className="flex items-center px-2 py-2 text-xs font-medium text-muted-foreground">
          <div className="w-8 flex items-center justify-center">On</div>
          <div className="w-1/5 px-2">Key</div>
          <div className="w-1/6 px-2">Type</div>
          <div className="flex-1 px-2">Value / File</div>
          <div className="w-16 px-2 text-center">Secret</div>
          <div className="w-10" />
        </div>
      </div>

      <div className="divide-y divide-border">
        {displayRows.map((row, idx) => {
          const isText = (row.type || 'text') === 'text';
          const isEmpty = !row.key?.trim() && !row.value?.toString().trim() && !row.file_path && !row.file_inline;
          return (
            <div
              key={idx}
              className={cn(
                'flex items-center px-2 py-1.5 hover:bg-muted/30 transition-colors group',
                row.enabled === false && 'opacity-50'
              )}
            >
              <div className="w-8 flex items-center justify-center">
                <input
                  type="checkbox"
                  className="rounded border-border accent-primary cursor-pointer"
                  checked={row.enabled !== false}
                  onChange={(e) => updateRow(idx, { enabled: e.target.checked })}
                  title={row.enabled !== false ? 'Disable' : 'Enable'}
                />
              </div>

              <div className="w-1/5 px-2">
                <input
                  type="text"
                  className={cn(
                    "w-full bg-transparent border-none px-2 py-1.5 text-sm focus:outline-none focus:bg-white focus:ring-1 focus:ring-primary rounded",
                    (duplicateKeyIndexes?.has(idx) || missingKeyIndexes?.has(idx)) && "bg-amber-50 ring-1 ring-amber-300"
                  )}
                  placeholder="Key"
                  value={row.key || ''}
                  onChange={(e) => updateRow(idx, { key: e.target.value })}
                  disabled={row.enabled === false}
                  {...getCellProps(idx, 'key')}
                />
              </div>

              <div className="w-1/6 px-2">
                <select
                  className="w-full bg-white border border-input rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                  value={row.type || 'text'}
                  onChange={(e) => handleTypeChange(idx, e.target.value as FormDataRow['type'])}
                  disabled={row.enabled === false}
                  {...getCellProps(idx, 'type')}
                >
                  <option value="text">text</option>
                  <option value="file">file</option>
                  <option value="binary">binary</option>
                </select>
              </div>

              <div className="flex-1 px-2">
                {isText ? (
                  <input
                    type="text"
                    className="w-full bg-transparent border-none px-2 py-1.5 text-sm focus:outline-none focus:bg-white focus:ring-1 focus:ring-primary rounded"
                    placeholder="Value"
                    value={row.value || ''}
                    onChange={(e) => updateRow(idx, { value: e.target.value })}
                    disabled={row.enabled === false}
                    {...getCellProps(idx, 'value')}
                  />
                ) : (
                  renderFileCell(row, idx)
                )}
              </div>

              <div className="w-16 flex items-center justify-center">
                {isText ? (
                  <button
                    className={cn(
                      'text-xs px-2 py-1 rounded border transition-colors',
                      row.secret
                        ? 'bg-amber-50 border-amber-300 text-amber-700'
                        : 'border-border text-muted-foreground hover:bg-muted/40'
                    )}
                    type="button"
                    onClick={() => updateRow(idx, { secret: !row.secret })}
                    disabled={row.enabled === false}
                  >
                    {row.secret ? <Lock size={12} /> : <Unlock size={12} />}
                  </button>
                ) : (
                  <span className="text-[11px] text-muted-foreground">n/a</span>
                )}
              </div>

              <div className="w-10 flex items-center justify-center">
                {!isEmpty && (
                  <button
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive p-1 rounded transition-all"
                    type="button"
                    onClick={() => deleteRow(idx)}
                    title="Delete row"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="px-2 py-2 border-t border-border bg-muted/30 flex justify-between items-center">
        <div>
          <TableValidationNotice
            duplicateCount={duplicateKeyIndexes?.size}
            missingKeyCount={missingKeyIndexes?.size}
            duplicateMessage="Duplicate form keys found."
            missingKeyMessage="Rows with values/files must include keys."
          />
          <button
            onClick={addRow}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors px-2 py-1 rounded hover:bg-white"
            type="button"
          >
            <Plus size={14} />
            Add Row
          </button>
        </div>
        <input
          type="file"
          className="hidden"
          ref={fileInputRef}
          onChange={handleWebFileChange}
        />
      </div>
    </div>
  );
};
