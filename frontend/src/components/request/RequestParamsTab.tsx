import { FormTable, type Row } from './FormTable';

type RequestParamsTabProps = {
  rows: Row[];
  onChange: (rows: Row[]) => void;
  onEditRow: (index: number) => void;
  duplicateKeyIndexes?: Set<number>;
  missingKeyIndexes?: Set<number>;
  unresolvedKeyIndexes?: Set<number>;
  unresolvedValueIndexes?: Set<number>;
  variableSuggestions?: string[];
};

export const RequestParamsTab = ({
  rows,
  onChange,
  onEditRow,
  duplicateKeyIndexes,
  missingKeyIndexes,
  unresolvedKeyIndexes,
  unresolvedValueIndexes,
  variableSuggestions,
}: RequestParamsTabProps) => {
  return (
    <div className="p-4 bg-card h-full">
      <div className="text-xs uppercase text-muted-foreground mb-2">Query Parameters</div>
      <p className="text-xs text-muted-foreground mb-3">Add key/value pairs to append to the URL. Disabled rows are ignored.</p>
      <FormTable
        rows={rows}
        onChange={onChange}
        onEditRow={onEditRow}
        showSecrets
        tableId="params"
        duplicateKeyIndexes={duplicateKeyIndexes}
        missingKeyIndexes={missingKeyIndexes}
        unresolvedKeyIndexes={unresolvedKeyIndexes}
        unresolvedValueIndexes={unresolvedValueIndexes}
        variableSuggestions={variableSuggestions}
      />
    </div>
  );
};
