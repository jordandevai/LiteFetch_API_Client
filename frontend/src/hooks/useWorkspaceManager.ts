import { LiteAPI, resetApiClient } from '../lib/api';
import { WORKSPACE_KEY } from './useWorkspace';
import { useWorkspaceRuntime } from '../providers/WorkspaceRuntimeProvider';
import { useActiveCollectionStore } from '../stores/useActiveCollectionStore';
import { useActiveRequestStore } from '../stores/useActiveRequestStore';
import { INDEX_KEY } from './useCollectionsIndex';
import { useWorkspaceLockStore } from '../stores/useWorkspaceLockStore';

const isTauri = typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;

export const useWorkspaceManager = () => {
  const { resetRuntime } = useWorkspaceRuntime();
  const setActiveCollectionId = useActiveCollectionStore((s) => s.setActiveId);
  const setActiveRequestId = useActiveRequestStore((s) => s.setActiveRequestId);
  const setResult = useActiveRequestStore((s) => s.setResult);
  const setLockStatus = useWorkspaceLockStore((s) => s.setStatus);
  const openLockModal = useWorkspaceLockStore((s) => s.openModal);
  const closeLockModal = useWorkspaceLockStore((s) => s.closeModal);

  const resetStores = () => {
    setActiveCollectionId(null);
    setActiveRequestId(null);
    setResult(null);
  };

  const switchWorkspace = async (path: string) => {
    const trimmed = path.trim();
    if (!trimmed) throw new Error('Path is required');

    let resolvedPath = trimmed;

    if (isTauri) {
      const { invoke } = await import('@tauri-apps/api/core');
      resolvedPath = await invoke<string>('switch_workspace', { path: trimmed });
    } else {
      const res = await LiteAPI.setWorkspace(trimmed);
      resolvedPath = res.path;
    }

    // ──────────────────────────────────────────────────────────────
    // CRITICAL: Full atomic reset — this is the industry standard
    // ──────────────────────────────────────────────────────────────
    const newClient = resetRuntime(); // ← New QueryClient (clears all cache via provider remount)
    resetApiClient();                 // ← Clears base URL, axios instance
    resetStores();                    // ← Clears Zustand active collection/request

    // Re-bootstrap fresh state
    newClient.setQueryData(WORKSPACE_KEY, { path: resolvedPath });

    const fetchStatusWithRetry = async (retries = 4, delayMs = 400) => {
      for (let i = 0; i < retries; i += 1) {
        try {
          const status = await LiteAPI.getWorkspaceStatus();
          return status;
        } catch (err) {
          if (i === retries - 1) throw err;
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
      return { locked: false, legacy: false };
    };

    try {
      const status = await fetchStatusWithRetry();
      setLockStatus(status.locked, status.legacy, (status as any).has_vault ?? true);
      if (status.locked || status.legacy || !(status as any).has_vault) {
        openLockModal();
        return resolvedPath;
      }
      // Keep modal open by default; user can close manually.
    } catch (err) {
      console.warn('[workspace] failed to load workspace status', err);
      // On repeated errors, assume unlocked to avoid blocking unprotected workspaces; status will refresh on use.
      setLockStatus(false, false, true);
      openLockModal();
    }

    // Bootstrap collections index in the new workspace and set active collection if available.
    try {
      const metas = await newClient.fetchQuery({
        queryKey: INDEX_KEY,
        queryFn: () => LiteAPI.listCollections(),
      });
      setActiveCollectionId(metas[0]?.id || null);
    } catch (err) {
      console.warn('[workspace] failed to bootstrap collections index after switch', err);
      setActiveCollectionId(null);
    }

    return resolvedPath;
  };

  return { switchWorkspace };
};
