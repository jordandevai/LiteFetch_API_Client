import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../ui/Dialog';

type UrlEditorDialogProps = {
  open: boolean;
  urlDraft: string;
  encodedPreview: string;
  variableSuggestions: string[];
  onDraftChange: (next: string) => void;
  onDecode: () => void;
  onPrettyQuery: () => void;
  onClose: () => void;
  onSave: () => void;
};

export const UrlEditorDialog = ({
  open,
  urlDraft,
  encodedPreview,
  variableSuggestions,
  onDraftChange,
  onDecode,
  onPrettyQuery,
  onClose,
  onSave,
}: UrlEditorDialogProps) => {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Edit URL</DialogTitle>
        </DialogHeader>
        <div className="p-4">
          <div className="mb-2 flex items-center gap-2">
            <button
              className="px-3 py-1.5 text-xs rounded border border-border bg-white hover:bg-muted transition-colors font-medium"
              type="button"
              onClick={onDecode}
            >
              Decode for edit
            </button>
            <button
              className="px-3 py-1.5 text-xs rounded border border-border bg-white hover:bg-muted transition-colors font-medium"
              type="button"
              onClick={onPrettyQuery}
            >
              Pretty query
            </button>
            {variableSuggestions.length > 0 && (
              <select
                className="px-2 py-1.5 text-xs rounded border border-border bg-white"
                defaultValue=""
                onChange={(e) => {
                  if (!e.target.value) return;
                  onDraftChange(`${urlDraft}${e.target.value}`);
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
          </div>
          <textarea
            className="w-full h-[28rem] border border-input rounded px-4 py-4 font-mono text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
            value={urlDraft}
            onChange={(e) => onDraftChange(e.target.value)}
            autoFocus
          />
          <div className="mt-2 rounded border border-border bg-muted/20 px-3 py-2">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Encoded send preview</div>
            <div className="text-xs font-mono text-muted-foreground break-all">{encodedPreview || '—'}</div>
          </div>
        </div>
        <DialogFooter>
          <button
            className="px-4 py-2 text-sm rounded border border-border bg-white hover:bg-muted transition-colors font-medium"
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className="px-4 py-2 text-sm rounded bg-primary text-primary-foreground hover:opacity-90 transition-opacity font-medium"
            onClick={onSave}
            type="button"
          >
            Save & Close
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
