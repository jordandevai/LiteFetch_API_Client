import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LiteAPI } from '../lib/api';

export const WORKSPACE_KEY = ['workspace'];
const isTauri = typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;

export const useWorkspaceQuery = () =>
  useQuery({
    queryKey: WORKSPACE_KEY,
    queryFn: () => LiteAPI.getWorkspace(),
  });

// Retained for non-Tauri/web contexts; Tauri flow is handled by useWorkspaceManager.
export const useSetWorkspaceMutation = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (path: string) => {
      const trimmed = path.trim();
      let persisted = trimmed;

      if (isTauri) {
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          const stored = await invoke<string>('set_workspace_path', { path: trimmed });
          if (stored) persisted = stored;
        } catch (err) {
          console.warn('[workspace] failed to persist path via Tauri; continuing with backend swap', err);
        }
      }

      return LiteAPI.setWorkspace(persisted);
    },
    onSuccess: (data) => {
      qc.setQueryData(WORKSPACE_KEY, data);
      // downstream data will need refetch; callers can trigger reload as needed
    },
  });
};

export const useInitGitMutation = () => {
  return useMutation({
    mutationFn: () => LiteAPI.initWorkspaceGit(),
  });
};
