import React, { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import type { CollectionFolder } from '../../lib/api';
import { importPostmanCollection } from '../../lib/postmanImport';
import { useCreateCollectionMutation } from '../../hooks/useCollectionsIndex';
import { useActiveCollectionStore } from '../../stores/useActiveCollectionStore';
import { useQueryClient } from '@tanstack/react-query';

export const ImportPostmanButton = () => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { mutateAsync: createCollection } = useCreateCollectionMutation();
  const setActiveId = useActiveCollectionStore((s) => s.setActiveId);
  const qc = useQueryClient();
  const [status, setStatus] = useState<{ message: string; tone: 'info' | 'error' | 'success' } | null>(null);
  const showStatus = (message: string, tone: 'info' | 'error' | 'success' = 'info') => {
    setStatus({ message, tone });
    window.setTimeout(() => setStatus(null), 3000);
  };

  const countRules = (items: CollectionFolder['items']): number =>
    items.reduce((acc, item) => {
      if ('items' in item) return acc + countRules(item.items);
      return acc + (item.extract_rules?.length || 0);
    }, 0);

  const onFile = async (file: File) => {
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const imported = importPostmanCollection(json);
      const ruleCount = countRules(imported.items);

      if (!imported.items.length) {
        showStatus('Import contained no requests. Is this the correct Postman export?', 'error');
        return;
      }

      const meta = await createCollection({
        name: imported.name || 'Imported Postman Collection',
        collection: imported,
      });
      qc.invalidateQueries({ queryKey: ['collections-index'] });
      qc.setQueryData(['collection', meta.id], imported);
      setActiveId(meta.id);
      const suffix = ruleCount ? ` · ${ruleCount} extraction rules detected` : '';
      showStatus(`Imported ${imported.items.length} items into "${meta.name}"${suffix}`, 'success');
    } catch (e) {
      console.error(e);
      showStatus('Failed to import Postman collection', 'error');
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <>
      <button
        className="px-3 py-1.5 text-sm rounded bg-muted hover:bg-secondary transition-colors flex items-center gap-2 font-medium"
        onClick={() => inputRef.current?.click()}
        type="button"
      >
        <Upload size={14} /> Import Postman
      </button>
      {status && (
        <span
          className={`text-xs ml-2 ${
            status.tone === 'error'
              ? 'text-destructive'
              : status.tone === 'success'
              ? 'text-success'
              : 'text-muted-foreground'
          }`}
        >
          {status.message}
        </span>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
        }}
      />
    </>
  );
};
