import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './Dialog';

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'destructive';
  onConfirm: () => void;
  onCancel: () => void;
};

export const ConfirmDialog = ({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) => {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="p-6">
          <DialogDescription>{message}</DialogDescription>
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
            onClick={onConfirm}
            className={
              variant === 'destructive'
                ? 'px-4 py-2 text-sm rounded bg-destructive text-white hover:opacity-90 transition-opacity font-medium'
                : 'px-4 py-2 text-sm rounded bg-primary text-primary-foreground hover:opacity-90 transition-opacity font-medium'
            }
            type="button"
          >
            {confirmLabel}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
