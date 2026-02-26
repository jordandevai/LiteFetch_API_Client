import { Play, Redo2, Save, Undo2 } from 'lucide-react';
import type { UseFormRegisterReturn } from 'react-hook-form';
import { cn } from '../../lib/utils';

type RequestTopBarProps = {
  methodField: UseFormRegisterReturn<'method'>;
  urlField: UseFormRegisterReturn<'url'>;
  urlInputRef: React.MutableRefObject<HTMLInputElement | null>;
  saveState: 'saved' | 'unsaved' | 'saving' | 'error';
  isSaving: boolean;
  isLocked: boolean;
  activeRequestRunning: boolean;
  canUndo: boolean;
  canRedo: boolean;
  unresolvedVariableCount: number;
  unresolvedVariableNames: string[];
  urlUnresolvedVariables: string[];
  variableSuggestions: string[];
  onOpenUrlEditor: () => void;
  onUrlFocus: () => void;
  onUrlBlur: (value: string) => void;
  onRun: () => void;
  onSave: () => void;
  onUndo: () => void;
  onRedo: () => void;
};

export const RequestTopBar = ({
  methodField,
  urlField,
  urlInputRef,
  saveState,
  isSaving,
  isLocked,
  activeRequestRunning,
  canUndo,
  canRedo,
  unresolvedVariableCount,
  unresolvedVariableNames,
  urlUnresolvedVariables,
  variableSuggestions,
  onOpenUrlEditor,
  onUrlFocus,
  onUrlBlur,
  onRun,
  onSave,
  onUndo,
  onRedo,
}: RequestTopBarProps) => {
  return (
    <div className="p-4 border-b border-border flex gap-2 bg-card">
      <select
        className="bg-white border border-input rounded px-3 py-2 text-sm font-mono font-bold focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
        {...methodField}
      >
        <option value="GET">GET</option>
        <option value="POST">POST</option>
        <option value="PUT">PUT</option>
        <option value="DELETE">DELETE</option>
      </select>

      <input
        className={cn(
          "flex-1 bg-white border border-input rounded px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary",
          urlUnresolvedVariables.length > 0 && "border-amber-300 bg-amber-50/40",
        )}
        {...urlField}
        ref={(el) => {
          urlField.ref(el);
          urlInputRef.current = el;
        }}
        data-req-field="url"
        placeholder="http://localhost:8000/api..."
        list={variableSuggestions.length ? 'url-variable-suggestions' : undefined}
        onDoubleClick={onOpenUrlEditor}
        onFocus={onUrlFocus}
        onBlur={(e) => onUrlBlur(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            onRun();
          }
        }}
      />
      {variableSuggestions.length ? (
        <datalist id="url-variable-suggestions">
          {variableSuggestions.map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>
      ) : null}
      {urlUnresolvedVariables.length > 0 && (
        <div
          className="px-2 py-2 text-xs rounded border border-amber-300 bg-amber-50 text-amber-700 font-medium"
          title={urlUnresolvedVariables.join(', ')}
        >
          URL vars missing
        </div>
      )}
      {saveState !== 'saved' && (
        <div
          className={cn(
            'px-2 py-2 text-xs rounded border font-medium',
            saveState === 'unsaved' && 'bg-muted text-muted-foreground border-border',
            saveState === 'saving' && 'bg-primary/10 text-primary border-primary/30',
            saveState === 'error' && 'bg-destructive/10 text-destructive border-destructive/30',
          )}
          title="Save state"
        >
          {saveState === 'unsaved' ? 'Unsaved' : saveState === 'saving' ? 'Saving…' : 'Save failed'}
        </div>
      )}
      {unresolvedVariableCount > 0 && (
        <div
          className="px-2 py-2 text-xs rounded border border-amber-300 bg-amber-50 text-amber-700 font-medium"
          title={unresolvedVariableNames.join(', ')}
        >
          {unresolvedVariableCount} unresolved vars
        </div>
      )}

      <button
        className="px-3 py-2 text-xs rounded border border-border bg-white hover:bg-muted transition-colors font-medium"
        onClick={onOpenUrlEditor}
        type="button"
      >
        Expand
      </button>

      <button
        className="bg-muted hover:bg-secondary text-foreground px-4 py-2 rounded flex items-center gap-2 text-sm transition-colors disabled:opacity-50 font-medium"
        onClick={onSave}
        title="Save Changes (Cmd+S)"
        type="button"
        disabled={isSaving || isLocked}
      >
        <Save size={14} />
      </button>
      <button
        className="px-3 py-2 text-xs rounded border border-border bg-white hover:bg-muted transition-colors font-medium disabled:opacity-50"
        type="button"
        onClick={onUndo}
        disabled={!canUndo || isLocked}
        title="Undo (Cmd/Ctrl+Z)"
      >
        <Undo2 size={14} />
      </button>
      <button
        className="px-3 py-2 text-xs rounded border border-border bg-white hover:bg-muted transition-colors font-medium disabled:opacity-50"
        type="button"
        onClick={onRedo}
        disabled={!canRedo || isLocked}
        title="Redo (Cmd/Ctrl+Shift+Z)"
      >
        <Redo2 size={14} />
      </button>
      <button
        className="bg-success hover:opacity-90 text-success-foreground px-5 py-2 rounded flex items-center gap-2 text-sm font-semibold transition-opacity"
        onClick={onRun}
        type="button"
        disabled={isLocked || activeRequestRunning}
      >
        <Play size={14} /> {activeRequestRunning ? 'Sending…' : 'Send'}
      </button>
    </div>
  );
};
