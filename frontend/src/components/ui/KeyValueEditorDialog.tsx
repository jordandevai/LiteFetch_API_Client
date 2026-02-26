import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './Dialog';

type KeyValueEditorDialogProps = {
  open: boolean;
  title: string;
  subtitle?: string;
  keyLabel?: string;
  valueLabel?: string;
  keyValue: string;
  valueValue: string;
  onKeyChange: (value: string) => void;
  onValueChange: (value: string) => void;
  onCancel: () => void;
  onSave: () => void;
  valueRows?: number;
};

export const KeyValueEditorDialog = ({
  open,
  title,
  subtitle,
  keyLabel = 'Key',
  valueLabel = 'Value',
  keyValue,
  valueValue,
  onKeyChange,
  onValueChange,
  onCancel,
  onSave,
  valueRows = 10,
}: KeyValueEditorDialogProps) => {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {subtitle ? <div className="text-xs text-muted-foreground">{subtitle}</div> : null}
        </DialogHeader>
        <div className="p-4 space-y-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs uppercase text-muted-foreground">{keyLabel}</label>
            <input
              className="w-full bg-white border border-input rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              value={keyValue}
              onChange={(e) => onKeyChange(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs uppercase text-muted-foreground">{valueLabel}</label>
            <textarea
              className="w-full bg-white border border-input rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              rows={valueRows}
              value={valueValue}
              onChange={(e) => onValueChange(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <button
            className="px-3 py-1.5 text-xs rounded border border-border bg-white hover:bg-muted transition-colors"
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
          <button
            className="px-3 py-1.5 text-xs rounded bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
            onClick={onSave}
            type="button"
          >
            Save
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
