import { FormEvent, useEffect, useState } from 'react';
import { Lock, Eye, EyeOff } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useWorkspaceLockStore } from '../../stores/useWorkspaceLockStore';
import { useWorkspaceQuery } from '../../hooks/useWorkspace';
import { useWorkspaceManager } from '../../hooks/useWorkspaceManager';
import { LiteAPI } from '../../lib/api';

const isTauri = typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;

export const WorkspacePassphraseModal = () => {
  const qc = useQueryClient();
  const {
    isLocked,
    legacyMode,
    hasVault,
    setUnlocked,
    modalOpen,
    closeModal,
    openModal,
  } = useWorkspaceLockStore();
  const { data } = useWorkspaceQuery();
  const { switchWorkspace } = useWorkspaceManager();
  const [passphrase, setPassphrase] = useState('');
  const [newPassphrase, setNewPassphrase] = useState('');
  const [newPassphraseConfirm, setNewPassphraseConfirm] = useState('');
  const [path, setPath] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busyUnlock, setBusyUnlock] = useState(false);
  const [busySwitch, setBusySwitch] = useState(false);
  const [busyRotate, setBusyRotate] = useState(false);
  const [busyMigrate, setBusyMigrate] = useState(false);
  const [migrateNote, setMigrateNote] = useState<string | null>(null);
  const [showPass, setShowPass] = useState(false);
  const [showRotate, setShowRotate] = useState(false);
  const [createPass, setCreatePass] = useState('');
  const [createPassConfirm, setCreatePassConfirm] = useState('');

  useEffect(() => {
    if (data?.path) setPath(data.path);
  }, [data]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!isLocked && !legacyMode && hasVault) {
      setError(null);
      setPassphrase('');
      setNewPassphrase('');
      closeModal();
      return;
    }
    if (!passphrase.trim()) {
      setError('Passphrase required to unlock this workspace.');
      return;
    }
    setError(null);
    setBusyUnlock(true);
    try {
      const ok = await setUnlocked(passphrase);
      if (ok) {
        qc.invalidateQueries();
      } else {
        setError('Incorrect passphrase');
      }
    } catch (err: any) {
      setError(err?.message || 'Unable to unlock workspace');
    } finally {
      setBusyUnlock(false);
    }
  };

  const handleCreatePassphrase = async () => {
    if (!createPass.trim() || !createPassConfirm.trim()) {
      setError('Passphrase and confirmation are required');
      return;
    }
    if (createPass.trim() !== createPassConfirm.trim()) {
      setError('Passphrases do not match');
      return;
    }
    setError(null);
    setBusyUnlock(true);
    try {
      const ok = await setUnlocked(createPass.trim());
      if (ok) {
        setCreatePass('');
        setCreatePassConfirm('');
        qc.invalidateQueries();
      } else {
        setError('Unable to create vault with that passphrase');
      }
    } catch (err: any) {
      setError(err?.message || 'Unable to create vault');
    } finally {
      setBusyUnlock(false);
    }
  };

  const handleRotate = async () => {
    if (!passphrase.trim() || !newPassphrase.trim() || !newPassphraseConfirm.trim()) {
      setError('Current and new passphrases are required');
      return;
    }
    if (newPassphrase.trim() !== newPassphraseConfirm.trim()) {
      setError('New passphrases do not match');
      return;
    }
    setError(null);
    setBusyRotate(true);
    try {
      await LiteAPI.rotateWorkspacePassphrase(passphrase.trim(), newPassphrase.trim());
      setPassphrase(newPassphrase.trim());
      setNewPassphrase('');
      setNewPassphraseConfirm('');
      setShowRotate(false);
    } catch (err: any) {
      setError(err?.message || 'Unable to rotate passphrase');
    } finally {
      setBusyRotate(false);
    }
  };

  const handleBrowse = async () => {
    if (!isTauri) {
      setError('Folder picker is available in the desktop app.');
      return;
    }
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({ directory: true, multiple: false, defaultPath: path || undefined });
      if (typeof selected === 'string') {
        await handleSwitch(selected);
      } else if (Array.isArray(selected) && selected[0]) {
        await handleSwitch(selected[0]);
      }
    } catch (err: any) {
      setError(err?.message || 'Unable to open folder picker');
    }
  };

  const handleSwitch = async (targetPath?: string) => {
    const trimmed = (targetPath ?? path).trim();
    if (!trimmed) {
      setError('Path is required to switch workspace');
      return;
    }
    setError(null);
    setBusySwitch(true);
    try {
      const newPath = await switchWorkspace(trimmed);
      setPath(newPath);
      setPassphrase('');
      setNewPassphrase('');
      qc.invalidateQueries();
    } catch (err: any) {
      setError(err?.message || 'Unable to switch workspace');
    } finally {
      setBusySwitch(false);
    }
  };

  useEffect(() => {
    if (isLocked || legacyMode) {
      openModal();
    }
  }, [isLocked, legacyMode, openModal]);

  const handleMigrate = async () => {
    setError(null);
    setMigrateNote(null);
    setBusyMigrate(true);
    try {
      if (hasVault) {
        const res = await LiteAPI.migrateWorkspace();
        setMigrateNote(
          `Encrypted: collections ${res.stats?.collections ?? 0}, envs ${res.stats?.environments ?? 0}, history ${res.stats?.history ?? 0}, last_results ${res.stats?.last_results ?? 0}, cookies ${res.stats?.cookies ?? 0}`,
        );
      } else {
        await LiteAPI.updateWorkspaceIgnore();
        setMigrateNote('Workspace ignore rules updated.');
      }
    } catch (err: any) {
      setError(err?.message || 'Migration failed');
    } finally {
      setBusyMigrate(false);
    }
  };

  if (!modalOpen && !isLocked && !legacyMode) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
      <div className="bg-card border border-border rounded shadow-2xl p-6 w-full max-w-2xl space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Lock size={16} />
            <div className="font-semibold text-sm">Workspace</div>
          </div>
          {!isLocked && !legacyMode && (
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => closeModal()}
            >
              Close
            </button>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          {legacyMode
            ? 'Legacy secrets detected. Enter passphrase to migrate and unlock.'
            : isLocked
            ? 'Workspace is locked. Enter passphrase to continue.'
            : hasVault
            ? 'Manage workspace folder or unlock with passphrase.'
            : 'New workspace detected. Set a passphrase to encrypt data, or continue without encryption.'}
        </div>
        {error && <div className="text-xs text-destructive bg-destructive/10 px-2 py-1 rounded">{error}</div>}
        <div className="space-y-4">
          <div className="space-y-1">
            <div className="text-xs font-semibold">Workspace folder</div>
            <input
              type="text"
              className="w-full bg-white border border-input rounded px-3 py-2 text-sm font-mono"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="/path/to/workspace"
              disabled={busyUnlock || busySwitch || busyRotate}
              readOnly
            />
            <div className="flex gap-2">
              <button
                type="button"
                className="px-3 py-1.5 text-xs rounded border border-border bg-white hover:bg-muted transition-colors disabled:opacity-50"
                onClick={handleBrowse}
                disabled={busyUnlock || busySwitch || busyRotate}
              >
                Open Folder
              </button>
            </div>
            <div className="text-[11px] text-muted-foreground">
              Select an empty directory to create a new workspace, or select an existing directory to load an existing workspace.
            </div>
          </div>
        </div>
        <div className="border-t border-border pt-4 space-y-4">
          {!hasVault && (
            <div className="space-y-3 border border-destructive/40 bg-destructive/5 rounded p-4">
              <div className="text-sm font-semibold text-destructive">Protect this workspace</div>
              <div className="text-xs text-muted-foreground">
                Create a passphrase to encrypt collections, environments, history, and cookies before storing them on disk.
                Without a passphrase, sensitive tokens may be readable if you commit this workspace or lose control of the device.
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs uppercase text-muted-foreground">New passphrase</label>
                  <input
                    type={showPass ? 'text' : 'password'}
                    className="w-full bg-white border border-input rounded px-3 py-2 text-sm"
                    value={createPass}
                    onChange={(e) => setCreatePass(e.target.value)}
                    disabled={busyUnlock || busySwitch || busyRotate}
                    placeholder="Enter a strong passphrase"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs uppercase text-muted-foreground">Confirm passphrase</label>
                  <input
                    type={showPass ? 'text' : 'password'}
                    className="w-full bg-white border border-input rounded px-3 py-2 text-sm"
                    value={createPassConfirm}
                    onChange={(e) => setCreatePassConfirm(e.target.value)}
                    disabled={busyUnlock || busySwitch || busyRotate}
                    placeholder="Re-enter passphrase"
                  />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="px-4 py-2 text-xs rounded bg-destructive text-destructive-foreground hover:opacity-90 transition-opacity disabled:opacity-50 font-semibold"
                  onClick={handleCreatePassphrase}
                  disabled={busyUnlock || busySwitch || busyRotate || busyMigrate}
                >
                  {busyUnlock ? 'Creating...' : 'Create Passphrase'}
                </button>
                <div className="text-[11px] text-muted-foreground">
                  Store this somewhere safe -- you will need it to unlock this workspace.
                </div>
              </div>
              <div className="flex justify-between items-center pt-2">
                <div className="text-[11px] text-muted-foreground">
                  Not ready yet? You can continue without encryption (not recommended).
                </div>
                <button
                  type="button"
                  className="px-3 py-1.5 text-xs rounded border border-border bg-white hover:bg-muted transition-colors disabled:opacity-50"
                  onClick={() => closeModal()}
                  disabled={busyUnlock || busySwitch || busyRotate || busyMigrate}
                >
                  Continue without encryption
                </button>
              </div>
            </div>
          )}

          {hasVault && (
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-1 pt-2">
                <div className="text-xs font-semibold">Workspace passphrase</div>
                <div className="flex gap-2 items-center">
                  <input
                    type={showPass ? 'text' : 'password'}
                    className="w-full bg-white border border-input rounded px-3 py-2 text-sm"
                    placeholder="Passphrase"
                    value={passphrase}
                    onChange={(e) => setPassphrase(e.target.value)}
                    autoFocus
                    disabled={busyUnlock || busySwitch || busyRotate}
                  />
                  <button
                    type="button"
                    className="p-2 rounded border border-border hover:bg-muted disabled:opacity-50"
                    onClick={() => setShowPass((v) => !v)}
                    disabled={busyUnlock || busySwitch || busyRotate}
                    aria-label={showPass ? 'Hide passphrase' : 'Show passphrase'}
                  >
                    {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs text-muted-foreground">
                    {legacyMode
                      ? 'Legacy secrets detected'
                      : isLocked
                      ? 'Locked'
                      : 'Workspace is unlocked.'}
                  </div>
                  <button
                    type="submit"
                    className="px-3 py-1.5 text-xs rounded bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
                    disabled={busyUnlock || busySwitch || busyRotate}
                  >
                    {busyUnlock ? 'Unlocking...' : isLocked || legacyMode ? 'Unlock Workspace' : 'Continue'}
                  </button>
                </div>

                <div className="border border-border rounded p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold text-muted-foreground">Update passphrase</div>
                    <button
                      type="button"
                      className="px-3 py-1.5 text-xs rounded border border-border bg-white hover:bg-muted transition-colors disabled:opacity-50"
                      onClick={() => {
                        setShowRotate((v) => !v);
                        setNewPassphrase('');
                        setNewPassphraseConfirm('');
                        setError(null);
                      }}
                      disabled={busyUnlock || busySwitch || busyRotate}
                    >
                      {showRotate ? 'Cancel Update' : 'Update'}
                    </button>
                  </div>

                  {showRotate && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="flex flex-col gap-1">
                        <label className="text-xs uppercase text-muted-foreground">New passphrase</label>
                        <input
                          type={showPass ? 'text' : 'password'}
                          className="w-full bg-white border border-input rounded px-3 py-2 text-sm"
                          placeholder="New passphrase"
                          value={newPassphrase}
                          onChange={(e) => setNewPassphrase(e.target.value)}
                          disabled={busyUnlock || busySwitch || busyRotate}
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs uppercase text-muted-foreground">Confirm passphrase</label>
                        <input
                          type={showPass ? 'text' : 'password'}
                          className="w-full bg-white border border-input rounded px-3 py-2 text-sm"
                          placeholder="Confirm passphrase"
                          value={newPassphraseConfirm}
                          onChange={(e) => setNewPassphraseConfirm(e.target.value)}
                          disabled={busyUnlock || busySwitch || busyRotate}
                        />
                      </div>
                      <div className="md:col-span-2 flex justify-end">
                        <button
                          type="button"
                          className="px-3 py-1.5 text-xs rounded bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
                          onClick={handleRotate}
                          disabled={
                            busyUnlock ||
                            busySwitch ||
                            busyRotate ||
                            !passphrase.trim() ||
                            !newPassphrase.trim() ||
                            !newPassphraseConfirm.trim()
                          }
                        >
                          {busyRotate ? 'Updating...' : 'Save New Passphrase'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </form>
          )}

          {!isLocked && !legacyMode && (
            <div className="border-t border-border pt-3">
              <div className="flex items-center justify-between">
                <div className="text-[11px] text-muted-foreground">
                  Apply the latest system updates to your workspace or encrypt a previously unencrypted workspace (once you have added a passphrase).
                </div>
                <button
                  type="button"
                  className="px-3 py-1.5 text-xs rounded border border-border bg-white hover:bg-muted transition-colors disabled:opacity-50"
                  onClick={handleMigrate}
                  disabled={busyUnlock || busySwitch || busyRotate || busyMigrate}
                >
                  {busyMigrate ? 'Updating...' : 'Update Workspace'}
                </button>
              </div>
              {migrateNote && (
                <div className="text-[11px] text-success bg-success/10 border border-success/30 rounded px-2 py-1 mt-2">
                  {migrateNote}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
