import { useCallback, type KeyboardEvent } from 'react';

export type TableField = string;

type Params = {
  tableId: string;
  rowCount: number;
  fields: TableField[];
  addRow: () => void;
  deleteRow: (rowIndex: number) => void;
  canDeleteRow?: (rowIndex: number) => boolean;
};

export const useKeyValueTableNavigation = ({
  tableId,
  rowCount,
  fields,
  addRow,
  deleteRow,
  canDeleteRow,
}: Params) => {
  const focusCell = useCallback(
    (rowIndex: number, field: TableField) => {
      if (rowIndex < 0) return;
      const selector = `[data-kv-table="${tableId}"][data-kv-row="${rowIndex}"][data-kv-field="${field}"]`;
      const node = document.querySelector<HTMLElement>(selector);
      node?.focus();
    },
    [tableId],
  );

  const queueFocus = useCallback(
    (rowIndex: number, field: TableField) => {
      window.setTimeout(() => focusCell(rowIndex, field), 0);
    },
    [focusCell],
  );

  const handleCellKeyDown = useCallback(
    (rowIndex: number, field: TableField, e: KeyboardEvent<HTMLElement>) => {
      const fieldIndex = fields.indexOf(field);
      if (fieldIndex < 0) return;

      if ((e.metaKey || e.ctrlKey) && e.key === 'Backspace') {
        if (canDeleteRow && !canDeleteRow(rowIndex)) return;
        if (!canDeleteRow && rowCount <= 1) return;
        e.preventDefault();
        deleteRow(rowIndex);
        const nextRow = Math.max(0, Math.min(rowIndex, rowCount - 2));
        queueFocus(nextRow, field);
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        queueFocus(Math.min(rowCount - 1, rowIndex + 1), field);
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        queueFocus(Math.max(0, rowIndex - 1), field);
        return;
      }

      if (e.key !== 'Tab' && e.key !== 'Enter') return;
      e.preventDefault();

      if (e.shiftKey) {
        if (fieldIndex > 0) {
          queueFocus(rowIndex, fields[fieldIndex - 1]);
          return;
        }
        if (rowIndex > 0) {
          queueFocus(rowIndex - 1, fields[fields.length - 1]);
        }
        return;
      }

      if (fieldIndex < fields.length - 1) {
        queueFocus(rowIndex, fields[fieldIndex + 1]);
        return;
      }

      if (rowIndex < rowCount - 1) {
        queueFocus(rowIndex + 1, fields[0]);
        return;
      }

      addRow();
      queueFocus(rowCount, fields[0]);
    },
    [addRow, canDeleteRow, deleteRow, fields, queueFocus, rowCount],
  );

  const getCellProps = useCallback(
    (rowIndex: number, field: TableField) => ({
      'data-kv-table': tableId,
      'data-kv-row': rowIndex,
      'data-kv-field': field,
      onKeyDown: (e: KeyboardEvent<HTMLElement>) => handleCellKeyDown(rowIndex, field, e),
    }),
    [handleCellKeyDown, tableId],
  );

  return { getCellProps };
};
