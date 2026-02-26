import React, { useEffect } from 'react';
import { Trash2, Plus, Lock, Unlock } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useKeyValueTableNavigation } from '../../lib/forms/useKeyValueTableNavigation';
import { TableValidationNotice } from './TableValidationNotice';

type Row = { key: string; value?: string; enabled?: boolean; description?: string; type?: 'text' | 'file' | 'binary'; secret?: boolean };

type Props = {
  rows: Row[];
  onChange: (rows: Row[]) => void;
  allowFile?: boolean;
  showDescription?: boolean;
  onEditRow?: (index: number) => void;
  showSecrets?: boolean;
  tableId?: string;
  duplicateKeyIndexes?: Set<number>;
  missingKeyIndexes?: Set<number>;
};

export const FormTable = ({
  rows,
  onChange,
  showDescription = false,
  onEditRow,
  showSecrets = false,
  tableId = 'form-table',
  duplicateKeyIndexes,
  missingKeyIndexes,
}: Props) => {
  const displayRows = rows && rows.length > 0 ? rows : [{ key: '', value: '', enabled: true, description: '' }];

  // Ensure there's always at least one empty row
  useEffect(() => {
    if (!rows || rows.length === 0) {
      onChange([{ key: '', value: '', enabled: true, description: '' }]);
    }
  }, [rows, onChange]);

  const updateRow = (idx: number, patch: Partial<Row>) => {
    const next = [...(rows || [])];
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  };

  const deleteRow = (idx: number) => {
    const next = rows.filter((_, i) => i !== idx);
    // Keep at least one empty row
    if (next.length === 0) {
      onChange([{ key: '', value: '', enabled: true, description: '' }]);
    } else {
      onChange(next);
    }
  };

  const addRow = () => {
    onChange([...(rows || []), { key: '', value: '', enabled: true, description: '' }]);
  };
  const { getCellProps } = useKeyValueTableNavigation({
    tableId,
    rowCount: displayRows.length,
    fields: showDescription ? ['key', 'value', 'description'] : ['key', 'value'],
    addRow,
    deleteRow,
    canDeleteRow: (rowIndex) =>
      Boolean(displayRows[rowIndex]?.key?.trim() || displayRows[rowIndex]?.value?.trim()) || displayRows.length > 1,
  });

  // Auto-expand: add new row when user types in the last row
  const handleChange = (idx: number, patch: Partial<Row>) => {
    updateRow(idx, patch);

    // If this is the last row and user is typing, add a new row
    const isLastRow = idx === rows.length - 1;
    const hasContent = (patch.key && patch.key.trim()) || (patch.value && patch.value.trim());

    if (isLastRow && hasContent) {
      // Small delay to ensure smooth UX
      setTimeout(() => {
        addRow();
      }, 50);
    }
  };

  const toggleAll = () => {
    const allEnabled = rows.every(r => r.enabled !== false);
    onChange(rows.map(r => ({ ...r, enabled: !allEnabled })));
  };

  return (
    <div className="border border-border rounded overflow-hidden">
      {/* Table Header */}
      <div className="bg-muted border-b border-border">
        <div className="flex items-center px-2 py-2 text-xs font-medium text-muted-foreground">
          <div className="w-8 flex items-center justify-center">
            <input
              type="checkbox"
              className="rounded border-border accent-primary cursor-pointer"
              checked={rows.every(r => r.enabled !== false)}
              onChange={toggleAll}
              title="Toggle all"
            />
          </div>
          <div className={cn("px-2", showDescription ? "w-1/4" : "w-1/3")}>Key</div>
          <div className={cn("px-2", showDescription ? "w-1/4" : "flex-1")}>Value</div>
          {showDescription && <div className="flex-1 px-2">Description</div>}
          {showSecrets && <div className="w-16 px-2 text-center">Secret</div>}
          <div className="w-10"></div>
        </div>
      </div>

      {/* Table Body */}
      <div className="divide-y divide-border">
        {displayRows.map((row, idx) => {
          const isEmpty = !row.key?.trim() && !row.value?.trim();
          return (
            <div
              key={idx}
              className={cn(
                "flex items-center px-2 py-1.5 hover:bg-muted/30 transition-colors group",
                row.enabled === false && "opacity-50"
              )}
            >
              {/* Enable/Disable Checkbox */}
              <div className="w-8 flex items-center justify-center">
                <input
                  type="checkbox"
                  className="rounded border-border accent-primary cursor-pointer"
                  checked={row.enabled !== false}
                  onChange={(e) => updateRow(idx, { enabled: e.target.checked })}
                  title={row.enabled !== false ? "Disable" : "Enable"}
                />
              </div>

              {/* Key Input */}
              <div className={cn("px-2", showDescription ? "w-1/4" : "w-1/3")}>
                <input
                  type="text"
                  className={cn(
                    "w-full bg-transparent border-none px-2 py-1.5 text-sm focus:outline-none focus:bg-white focus:ring-1 focus:ring-primary rounded",
                    (duplicateKeyIndexes?.has(idx) || missingKeyIndexes?.has(idx)) && "bg-amber-50 ring-1 ring-amber-300"
                  )}
                  placeholder="Key"
                  value={row.key || ''}
                  onChange={(e) => handleChange(idx, { key: e.target.value })}
                  disabled={row.enabled === false}
                  {...getCellProps(idx, 'key')}
                />
              </div>

              {/* Value Input */}
              <div className={cn("px-2", showDescription ? "w-1/4" : "flex-1")}>
                <input
                  type="text"
                  className="w-full bg-transparent border-none px-2 py-1.5 text-sm focus:outline-none focus:bg-white focus:ring-1 focus:ring-primary rounded"
                  placeholder="Value"
                  value={row.value || ''}
                  onChange={(e) => handleChange(idx, { value: e.target.value })}
                  disabled={row.enabled === false}
                  onDoubleClick={() => onEditRow?.(idx)}
                  {...getCellProps(idx, 'value')}
                />
              </div>

              {/* Description Input (Optional) */}
              {showDescription && (
                <div className="flex-1 px-2">
                  <input
                    type="text"
                    className="w-full bg-transparent border-none px-2 py-1.5 text-sm focus:outline-none focus:bg-white focus:ring-1 focus:ring-primary rounded"
                    placeholder="Description"
                    value={row.description || ''}
                    onChange={(e) => updateRow(idx, { description: e.target.value })}
                    disabled={row.enabled === false}
                    {...getCellProps(idx, 'description')}
                  />
                </div>
              )}

              {/* Secret toggle */}
              {showSecrets && (
                <div className="w-16 flex items-center justify-center">
                  <button
                    className={cn(
                      "text-xs px-2 py-1 rounded border transition-colors",
                      row.secret
                        ? "bg-amber-50 border-amber-300 text-amber-700"
                        : "border-border text-muted-foreground hover:bg-muted/40"
                    )}
                    type="button"
                    onClick={() => updateRow(idx, { secret: !row.secret })}
                    title={row.secret ? "Marked as secret" : "Mark as secret"}
                  >
                    {row.secret ? <Lock size={12} /> : <Unlock size={12} />}
                  </button>
                </div>
              )}

              {/* Delete Button */}
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

      {/* Add Row Button */}
      <div className="px-2 py-2 border-t border-border bg-muted/30">
        <TableValidationNotice
          duplicateCount={duplicateKeyIndexes?.size}
          missingKeyCount={missingKeyIndexes?.size}
          duplicateMessage="Duplicate keys found."
          missingKeyMessage="Rows with values must include keys."
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
    </div>
  );
};
