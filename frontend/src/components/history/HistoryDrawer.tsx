import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { LiteAPI, type RequestResult } from '../../lib/api';
import { Clock, X } from 'lucide-react';
import { useActiveRequestStore } from '../../stores/useActiveRequestStore';
import { useActiveCollectionStore } from '../../stores/useActiveCollectionStore';
import { useWorkspaceLockStore } from '../../stores/useWorkspaceLockStore';

type HistoryDrawerProps = {
  open: boolean;
  onClose: () => void;
  onLoad: (result: RequestResult) => void;
};

export const HistoryDrawer = ({ open, onClose, onLoad }: HistoryDrawerProps) => {
  const activeId = useActiveCollectionStore((s) => s.activeId);
  const isLocked = useWorkspaceLockStore((s) => s.isLocked);
  const { isLoading, data } = useQuery({
    queryKey: ['history', activeId],
    queryFn: () => LiteAPI.getHistory(activeId!),
    enabled: open && !!activeId && !isLocked,
    retry: false,
  });
  const isRunning = useActiveRequestStore((s) => s.isRunning);
  const [notice, setNotice] = useState<string | null>(null);

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/40 z-30 flex justify-start">
      <div className="w-full max-w-md h-full bg-card border-r border-border shadow-2xl flex flex-col">
        <div className="h-12 px-4 border-b border-border flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold">History</div>
            <div className="text-xs text-muted-foreground">Last 50 requests</div>
          </div>
          <button
            className="p-2 rounded hover:bg-muted"
            onClick={onClose}
            aria-label="Close history"
            type="button"
          >
            <X size={16} />
          </button>
        </div>
        {notice && (
          <div className="px-4 py-2 text-[11px] bg-warning/10 text-warning">
            {notice}
          </div>
        )}
        <div className="flex-1 overflow-y-auto">
          {isLocked && <div className="p-4 text-xs text-muted-foreground">Workspace locked. Unlock to view history.</div>}
          {isLoading && <div className="p-4 text-xs text-muted-foreground">Loading…</div>}
          {!isLocked && !isLoading && data && data.length === 0 && (
            <div className="p-4 text-xs text-muted-foreground">No history yet.</div>
          )}
          {!isLocked && data?.map((item) => {
            const isError = item.status_code >= 400 || item.status_code === 0 || item.error;
            return (
              <button
                key={item.timestamp}
                className="w-full text-left px-4 py-3 border-b border-border hover:bg-muted transition-colors"
                onClick={() => {
                  if (isRunning) {
                    setNotice('Wait for the current request to finish');
                    return;
                  }
                  onLoad(item);
                  onClose();
                  setNotice(null);
                }}
                type="button"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                        isError ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success'
                      }`}
                    >
                      {item.status_code || 'ERR'}
                    </span>
                    <span className="text-xs font-mono truncate">
                      {item.request_id} · {item.status_code}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock size={12} /> {new Date(item.timestamp * 1000).toLocaleTimeString()}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {item.error ? item.error : 'OK'}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
