import React from 'react';
import { type Control, useWatch } from 'react-hook-form';
import { HeadersTable, type HeaderRow } from './HeadersTable';
import type { FormValues } from './requestEditorModel';

type RequestHeadersTabProps = {
  control: Control<FormValues>;
  onHeadersChange: (headers: HeaderRow[]) => void;
  duplicateKeyIndexes?: Set<number>;
  missingKeyIndexes?: Set<number>;
  unresolvedKeyIndexes?: Set<number>;
  unresolvedValueIndexes?: Set<number>;
  variableSuggestions?: string[];
};

const EMPTY_HEADER: HeaderRow = { key: '', value: '', enabled: true };

export const RequestHeadersTab = React.memo(
  ({
    control,
    onHeadersChange,
    duplicateKeyIndexes,
    missingKeyIndexes,
    unresolvedKeyIndexes,
    unresolvedValueIndexes,
    variableSuggestions,
  }: RequestHeadersTabProps) => {
    const headers = useWatch({ control, name: 'headers' }) as HeaderRow[] | undefined;

    return (
      <div className="p-4 bg-card h-full">
        <HeadersTable
          headers={headers || [EMPTY_HEADER]}
          onChange={onHeadersChange}
          showSecrets
          duplicateKeyIndexes={duplicateKeyIndexes}
          missingKeyIndexes={missingKeyIndexes}
          unresolvedKeyIndexes={unresolvedKeyIndexes}
          unresolvedValueIndexes={unresolvedValueIndexes}
          variableSuggestions={variableSuggestions}
        />
      </div>
    );
  },
);

RequestHeadersTab.displayName = 'RequestHeadersTab';
