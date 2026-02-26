import React, { useRef } from 'react';
import Editor from 'react-simple-code-editor';
import { highlight, languages } from 'prismjs';
import 'prismjs/components/prism-json';
import 'prismjs/themes/prism.css';
import { Upload } from 'lucide-react';
import { FormTable } from './FormTable';
import { FormDataTable } from './FormDataTable';
import { cn } from '../../lib/utils';
import type { FormValues } from './requestEditorModel';

const isTauri = typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') {
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

const BinaryPickerButton = ({
  onPick,
  disabled,
  current,
}: {
  onPick: (payload: { file_path?: string; file_inline?: string; file_name?: string } | null) => void;
  disabled?: boolean;
  current: { file_path?: string; file_inline?: string; file_name?: string } | null;
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const handlePick = async () => {
    if (isTauri) {
      try {
        const { open } = await import('@tauri-apps/plugin-dialog');
        const selected = await open({ multiple: false });
        if (!selected || Array.isArray(selected)) return;
        const parts = String(selected).split(/[\\/]/);
        onPick({ file_path: String(selected), file_inline: undefined, file_name: parts[parts.length - 1] || 'upload.bin' });
      } catch (e) {
        console.error('Binary pick failed', e);
      }
      return;
    }
    inputRef.current?.click();
  };

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const b64 = await fileToBase64(file);
      onPick({ file_inline: b64, file_name: file.name, file_path: undefined });
    } catch (err) {
      console.error('Binary file read failed', err);
    }
  };

  return (
    <>
      <button
        type="button"
        className="px-3 py-2 text-xs rounded border border-border bg-white hover:bg-muted transition-colors font-medium flex items-center gap-1"
        onClick={handlePick}
        disabled={disabled}
      >
        <Upload size={14} />
        {current?.file_path || current?.file_inline ? 'Replace file' : 'Pick file'}
      </button>
      <input type="file" className="hidden" ref={inputRef} onChange={onFileChange} />
    </>
  );
};

type RequestBodyTabProps = {
  bodyMode: FormValues['body_mode'];
  bodyValue: string;
  secretBody: boolean;
  binary: FormValues['binary'];
  formBodyRows: FormValues['form_body'];
  formUnresolvedKeyIndexes?: Set<number>;
  formUnresolvedValueIndexes?: Set<number>;
  variableSuggestions?: string[];
  bodySnippets?: Array<{ id: string; label: string }>;
  selectedSnippetId?: string;
  unresolvedVariableCount: number;
  unresolvedVariableNames: string[];
  transformNotice?: string | null;
  isLocked: boolean;
  formDuplicateIndexes: Set<number>;
  formMissingIndexes: Set<number>;
  onBodyModeChange: (mode: FormValues['body_mode']) => void;
  onBodyChange: (value: string) => void;
  onSmartPaste: () => void;
  onConvertBodyToTable: () => void;
  onConvertTableToBody: () => void;
  onSnippetSelect: (id: string) => void;
  onApplySnippet: () => void;
  onSecretBodyToggle: () => void;
  onFormBodyChange: (rows: FormValues['form_body']) => void;
  onBinaryChange: (next: FormValues['binary']) => void;
};

export const RequestBodyTab = ({
  bodyMode,
  bodyValue,
  secretBody,
  binary,
  formBodyRows,
  formUnresolvedKeyIndexes,
  formUnresolvedValueIndexes,
  variableSuggestions,
  bodySnippets,
  selectedSnippetId,
  unresolvedVariableCount,
  unresolvedVariableNames,
  transformNotice,
  isLocked,
  formDuplicateIndexes,
  formMissingIndexes,
  onBodyModeChange,
  onBodyChange,
  onSmartPaste,
  onConvertBodyToTable,
  onConvertTableToBody,
  onSnippetSelect,
  onApplySnippet,
  onSecretBodyToggle,
  onFormBodyChange,
  onBinaryChange,
}: RequestBodyTabProps) => {
  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center gap-4 text-sm flex-wrap">
        <span className="text-xs uppercase text-muted-foreground">Body type</span>
        {[
          { key: 'raw', label: 'Raw' },
          { key: 'json', label: 'JSON' },
          { key: 'form-urlencoded', label: 'x-www-form-urlencoded' },
          { key: 'form-data', label: 'form-data' },
          { key: 'binary', label: 'binary' },
        ].map((opt) => (
          <label
            key={opt.key}
            className={cn(
              'flex items-center gap-2 px-2 py-1 rounded border cursor-pointer',
              bodyMode === opt.key ? 'border-primary bg-muted/40' : 'border-border hover:bg-muted/30',
            )}
          >
            <input
              type="radio"
              className="accent-primary"
              checked={bodyMode === opt.key}
              onChange={() => onBodyModeChange(opt.key as FormValues['body_mode'])}
            />
            <span className="text-xs">{opt.label}</span>
          </label>
        ))}
        <button
          type="button"
          className={cn(
            'text-[11px] px-2 py-1 rounded border transition-colors',
            secretBody ? 'bg-amber-50 border-amber-300 text-amber-700' : 'border-border text-muted-foreground hover:bg-muted/40',
          )}
          onClick={onSecretBodyToggle}
        >
          {secretBody ? 'Body marked secret' : 'Mark body as secret'}
        </button>
        <button
          type="button"
          className="text-[11px] px-2 py-1 rounded border border-border text-muted-foreground hover:bg-muted/40 transition-colors"
          onClick={onSmartPaste}
        >
          Smart paste
        </button>
        {(bodyMode === 'json' || bodyMode === 'raw') && (
          <button
            type="button"
            className="text-[11px] px-2 py-1 rounded border border-border text-muted-foreground hover:bg-muted/40 transition-colors"
            onClick={onConvertBodyToTable}
          >
            JSON to table
          </button>
        )}
        {(bodyMode === 'form-urlencoded' || bodyMode === 'form-data') && (
          <button
            type="button"
            className="text-[11px] px-2 py-1 rounded border border-border text-muted-foreground hover:bg-muted/40 transition-colors"
            onClick={onConvertTableToBody}
          >
            Table to JSON
          </button>
        )}
        {(bodyMode === 'raw' || bodyMode === 'json') && variableSuggestions && variableSuggestions.length > 0 && (
          <select
            className="text-[11px] px-2 py-1 rounded border border-border bg-white text-muted-foreground"
            defaultValue=""
            onChange={(e) => {
              if (!e.target.value) return;
              onBodyChange(`${bodyValue}${e.target.value}`);
              e.target.value = '';
            }}
          >
            <option value="">Insert variable…</option>
            {variableSuggestions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        )}
        {(bodyMode === 'raw' || bodyMode === 'json') && bodySnippets && bodySnippets.length > 0 && (
          <>
            <select
              className="text-[11px] px-2 py-1 rounded border border-border bg-white text-muted-foreground"
              value={selectedSnippetId || ''}
              onChange={(e) => onSnippetSelect(e.target.value)}
            >
              <option value="">Snippet…</option>
              {bodySnippets.map((snippet) => (
                <option key={snippet.id} value={snippet.id}>
                  {snippet.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="text-[11px] px-2 py-1 rounded border border-border text-muted-foreground hover:bg-muted/40 transition-colors"
              onClick={onApplySnippet}
              disabled={!selectedSnippetId}
            >
              Insert snippet
            </button>
          </>
        )}
        {unresolvedVariableCount > 0 && (
          <div
            className="text-[11px] px-2 py-1 rounded border border-amber-300 bg-amber-50 text-amber-700"
            title={unresolvedVariableNames.join(', ')}
          >
            {unresolvedVariableCount} unresolved vars
          </div>
        )}
      </div>
      {transformNotice && <div className="text-[11px] px-2 py-1 rounded border border-border bg-muted/20 text-muted-foreground">{transformNotice}</div>}

      {(bodyMode === 'raw' || bodyMode === 'json') && (
        <Editor
          value={bodyValue}
          onValueChange={onBodyChange}
          highlight={(code) => highlight(code, languages.json, 'json')}
          padding={16}
          style={{ fontFamily: '"Fira code", "Fira Mono", monospace', fontSize: 14, minHeight: '100%' }}
          className="min-h-full border border-input rounded bg-white focus-within:ring-2 focus-within:ring-primary focus-within:border-primary"
        />
      )}

      {bodyMode === 'form-urlencoded' && (
        <FormTable
          rows={formBodyRows}
          onChange={(rows) => onFormBodyChange(rows)}
          allowFile={false}
          showSecrets
          tableId="form-body"
          duplicateKeyIndexes={formDuplicateIndexes}
          missingKeyIndexes={formMissingIndexes}
          unresolvedKeyIndexes={formUnresolvedKeyIndexes}
          unresolvedValueIndexes={formUnresolvedValueIndexes}
          variableSuggestions={variableSuggestions}
        />
      )}

      {bodyMode === 'form-data' && (
        <FormDataTable
          rows={formBodyRows}
          onChange={(rows) => onFormBodyChange(rows)}
          duplicateKeyIndexes={formDuplicateIndexes}
          missingKeyIndexes={formMissingIndexes}
        />
      )}

      {bodyMode === 'binary' && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Send a single binary payload. Choose a file path (desktop) or attach inline (browser).</p>
          <div className="flex items-center gap-2">
            <input
              type="text"
              className="flex-1 bg-transparent border border-input rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="File path or leave blank to pick"
              value={binary?.file_path || ''}
              data-req-field="binary-path"
              onChange={(e) => onBinaryChange({ ...(binary || {}), file_path: e.target.value, file_inline: undefined })}
            />
            <BinaryPickerButton onPick={(payload) => onBinaryChange(payload)} disabled={isLocked} current={binary} />
          </div>
          {binary?.file_name && !binary.file_path && <div className="text-[11px] text-muted-foreground px-1">Attached inline: {binary.file_name}</div>}
        </div>
      )}
    </div>
  );
};
