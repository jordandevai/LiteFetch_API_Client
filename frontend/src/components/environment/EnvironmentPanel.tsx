import React, { useEffect, useMemo, useState } from 'react';
import { X, Plus, Trash2, Lock, Unlock } from 'lucide-react';
import { useEnvironmentQuery, useSaveEnvironmentMutation } from '../../hooks/useEnvironmentData';
import type { EnvironmentFile } from '../../lib/api';
import { cn } from '../../lib/utils';
import { useWorkspaceLockStore } from '../../stores/useWorkspaceLockStore';
import { renameKeyInMap, uniqueKey } from '../../lib/forms/stableRows';
import { useUnsavedChangesGuard } from '../../lib/state/useUnsavedChangesGuard';

type EnvPanelProps = {
  open: boolean;
  onClose: () => void;
};

const emptyEnvFile: EnvironmentFile = {
  active_env: 'default',
  envs: {
    default: { name: 'default', variables: {}, secrets: {} },
  },
};

export const EnvironmentPanel = ({ open, onClose }: EnvPanelProps) => {
  const { data } = useEnvironmentQuery();
  const { mutateAsync: saveEnv, isPending } = useSaveEnvironmentMutation();
  const [localEnv, setLocalEnv] = useState<EnvironmentFile>(emptyEnvFile);
  const [isDirty, setIsDirty] = useState(false);
  const [status, setStatus] = useState<{ tone: 'info' | 'success' | 'error'; message: string } | null>(null);
  const { isLocked } = useWorkspaceLockStore();
  const { confirmDiscard } = useUnsavedChangesGuard();
  const markDirty = () => setIsDirty(true);

  // keep local copy for editing
  useEffect(() => {
    if (!open || !data || isDirty) return;
    setLocalEnv(data);
  }, [data, isDirty, open]);

  const envNames = useMemo(() => Object.keys(localEnv.envs || {}), [localEnv]);
  const activeEnvKey = localEnv.active_env;
  const activeEnv = localEnv.envs[activeEnvKey] || { name: activeEnvKey, variables: {}, secrets: {} };
  const addEnv = () => {
    markDirty();
    const base = 'env';
    let idx = 1;
    while (localEnv.envs[`${base}-${idx}`]) idx += 1;
    const key = `${base}-${idx}`;
    const next: EnvironmentFile = {
      ...localEnv,
      active_env: key,
      envs: {
        ...localEnv.envs,
        [key]: { name: key, variables: {}, secrets: {} },
      },
    };
    setLocalEnv(next);
  };

  const addVar = () => {
    markDirty();
    const key = uniqueKey(Object.keys(activeEnv.variables || {}), 'KEY');
    const next = {
      ...localEnv,
      envs: {
        ...localEnv.envs,
        [activeEnvKey]: {
          ...activeEnv,
          variables: { ...activeEnv.variables, [key]: '' },
          secrets: { ...(activeEnv.secrets || {}), [key]: false },
        },
      },
    };
    setLocalEnv(next);
  };

  const updateVar = (k: string, v: string) => {
    markDirty();
    const nextVars = { ...activeEnv.variables, [k]: v };
    const next = {
      ...localEnv,
      envs: {
        ...localEnv.envs,
        [activeEnvKey]: {
          ...activeEnv,
          variables: nextVars,
        },
      },
    };
    setLocalEnv(next);
  };

  const renameVar = (oldKey: string, newKey: string) => {
    markDirty();
    if (!newKey || oldKey === newKey) return;
    if (Object.prototype.hasOwnProperty.call(activeEnv.variables || {}, newKey)) return;
    const nextVars = renameKeyInMap(activeEnv.variables || {}, oldKey, newKey);
    const nextSecrets = renameKeyInMap(activeEnv.secrets || {}, oldKey, newKey);
    const next = {
      ...localEnv,
      envs: {
        ...localEnv.envs,
        [activeEnvKey]: { ...activeEnv, variables: nextVars, secrets: nextSecrets },
      },
    };
    setLocalEnv(next);
  };

  const removeVar = (key: string) => {
    markDirty();
    const nextVars = { ...activeEnv.variables };
    const nextSecrets = { ...(activeEnv.secrets || {}) };
    delete nextVars[key];
    delete nextSecrets[key];
    const next = {
      ...localEnv,
      envs: {
        ...localEnv.envs,
        [activeEnvKey]: { ...activeEnv, variables: nextVars, secrets: nextSecrets },
      },
    };
    setLocalEnv(next);
  };

  const renameEnv = (newName: string) => {
    markDirty();
    setLocalEnv((prev) => ({
      ...prev,
      envs: { ...prev.envs, [activeEnvKey]: { ...activeEnv, name: newName } },
    }));
  };

  const handleSave = async () => {
    await saveEnv(localEnv);
    setIsDirty(false);
    setStatus({ tone: 'success', message: 'Environment saved' });
    onClose();
  };

  const toggleSecret = (key: string) => {
    markDirty();
    const nextSecrets = { ...(activeEnv.secrets || {}) };
    nextSecrets[key] = !nextSecrets[key];
    setLocalEnv((prev) => ({
      ...prev,
      envs: {
        ...prev.envs,
        [activeEnvKey]: { ...activeEnv, secrets: nextSecrets },
      },
    }));
  };

  const handleClose = () => {
    const shouldClose = confirmDiscard({
      isDirty,
      message: 'Discard unsaved environment changes?',
    });
    if (!shouldClose) return;
    setIsDirty(false);
    onClose();
  };

  if (!open) return null;

  if (isLocked) {
    return (
      <div className="fixed inset-0 bg-black/40 z-30 flex justify-end">
        <div className="w-full max-w-lg h-full bg-card border-l border-border shadow-2xl flex flex-col">
          <div className="h-12 px-4 border-b border-border flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold">Environments</div>
              <div className="text-xs text-muted-foreground">Workspace locked. Unlock to view or edit.</div>
            </div>
            <button
              className="p-2 rounded hover:bg-muted"
              onClick={handleClose}
              aria-label="Close environment panel"
              type="button"
            >
              <X size={16} />
            </button>
          </div>
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            Unlock the workspace to load environments.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-30 flex justify-end">
      <div className="w-full max-w-lg h-full bg-card border-l border-border shadow-2xl flex flex-col">
        <div className="h-12 px-4 border-b border-border flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold">Environments</div>
            <div className="text-xs text-muted-foreground">Local-only variables</div>
          </div>
          <button
            className="p-2 rounded hover:bg-muted"
            onClick={handleClose}
            aria-label="Close environment panel"
            type="button"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {status && (
            <div
              className={`px-3 py-2 text-xs rounded ${
                status.tone === 'error'
                  ? 'bg-destructive/10 text-destructive'
                  : status.tone === 'success'
                  ? 'bg-success/10 text-success'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {status.message}
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase text-muted-foreground">Active</span>
              <select
                className="bg-white border border-border rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                value={activeEnvKey}
                onChange={(e) => {
                  markDirty();
                  setLocalEnv((prev) => ({ ...prev, active_env: e.target.value }));
                }}
              >
                {envNames.map((key) => (
                  <option key={key} value={key}>
                    {localEnv.envs[key]?.name || key}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={addEnv}
              className="flex items-center gap-1 text-xs px-3 py-1.5 bg-muted rounded hover:bg-secondary transition-colors font-medium"
              type="button"
            >
              <Plus size={12} /> Add Env
            </button>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs uppercase text-muted-foreground font-medium">Environment Name</label>
            <input
              className="bg-white border border-input rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              value={activeEnv.name || activeEnvKey}
              onChange={(e) => renameEnv(e.target.value)}
            />
          </div>

          <div className="border border-border rounded">
            <div className="px-3 py-2 border-b border-border flex items-center justify-between">
              <div className="text-sm font-semibold">{activeEnv.name}</div>
              <button
                onClick={addVar}
                className="text-xs px-3 py-1.5 bg-muted rounded hover:bg-secondary transition-colors font-medium"
                type="button"
              >
                + Add Variable
              </button>
            </div>
            <div className="divide-y divide-border">
              {Object.entries(activeEnv.variables || {}).map(([key, val]) => {
                const isSecret = !!(activeEnv.secrets || {})[key];
                const locked = isSecret && typeof val === 'string' && val.startsWith('enc:') && isLocked;
                return (
                  <div key={`${activeEnvKey}-${key}`} className="px-3 py-2 flex items-center gap-2">
                    <input
                      className="w-36 bg-white border border-input rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                      value={key}
                      onChange={(e) => renameVar(key, e.target.value)}
                    />
                    <input
                      className={cn(
                        'flex-1 bg-white border border-input rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary',
                        locked && 'text-muted-foreground',
                      )}
                      value={locked ? '••••••••' : String(val)}
                      onChange={(e) => updateVar(key, e.target.value)}
                      disabled={locked}
                    />
                    <button
                      onClick={() => toggleSecret(key)}
                      className={cn(
                        'p-2 rounded transition-colors border',
                        isSecret ? 'border-amber-400 text-amber-700 bg-amber-50' : 'border-border hover:bg-muted',
                      )}
                      type="button"
                      title={isSecret ? 'Secret (encrypted on disk)' : 'Mark as secret'}
                    >
                      {isSecret ? <Lock size={14} /> : <Unlock size={14} />}
                    </button>
                    <button
                      onClick={() => removeVar(key)}
                      className="text-destructive hover:bg-destructive/10 p-2 rounded transition-colors"
                      type="button"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })}
              {Object.keys(activeEnv.variables || {}).length === 0 && (
                <div className="px-3 py-6 text-xs text-muted-foreground text-center">
                  No variables yet. Add one to get started.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="h-14 px-4 border-t border-border flex items-center justify-end gap-3 bg-muted/30">
          <button
            className="px-4 py-2 text-sm rounded border border-border bg-white hover:bg-muted transition-colors font-medium"
            onClick={handleClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className={cn(
              'px-4 py-2 text-sm rounded bg-primary text-primary-foreground hover:opacity-90 transition-opacity font-medium',
              isPending && 'opacity-50 cursor-not-allowed',
            )}
            onClick={handleSave}
            disabled={isPending}
            type="button"
          >
            {isPending ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
};
