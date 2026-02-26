import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './Dialog';

type PromptDialogProps = {
  open: boolean;
  title: string;
  message?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
};

type PromptDialogContentProps = Omit<PromptDialogProps, 'open'>;

export const PromptDialog = ({
  open,
  title,
  message,
  placeholder,
  defaultValue = '',
  confirmLabel = 'OK',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}: PromptDialogProps) => {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      {open ? (
        <PromptDialogContent
          title={title}
          message={message}
          placeholder={placeholder}
          defaultValue={defaultValue}
          confirmLabel={confirmLabel}
          cancelLabel={cancelLabel}
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      ) : null}
    </Dialog>
  );
};

const PromptDialogContent = ({
  title,
  message,
  placeholder,
  defaultValue,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: PromptDialogContentProps) => {
  const [value, setValue] = useState(defaultValue || '');
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value.trim()) onConfirm(value.trim());
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit}>
        <div className="p-6 space-y-4">
          {message && <DialogDescription>{message}</DialogDescription>}
          <input
            type="text"
            className="w-full px-3 py-2 border border-input rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
            placeholder={placeholder}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
          />
        </div>
        <DialogFooter>
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm rounded border border-border bg-white hover:bg-muted transition-colors font-medium"
            type="button"
          >
            {cancelLabel}
          </button>
          <button
            type="submit"
            className="px-4 py-2 text-sm rounded bg-primary text-primary-foreground hover:opacity-90 transition-opacity font-medium"
            disabled={!value.trim()}
          >
            {confirmLabel}
          </button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
};
