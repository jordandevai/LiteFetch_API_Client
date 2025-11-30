import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LiteAPI, type StoredCookie } from '../lib/api';
import { useActiveCollectionStore } from '../stores/useActiveCollectionStore';
import { useWorkspaceLockStore } from '../stores/useWorkspaceLockStore';

const COOKIE_KEY = (collectionId: string | null, envId: string | null) => [
  'cookies',
  collectionId || 'none',
  envId || 'active',
];

export const useCookiesQuery = (envId: string | null) => {
  const activeId = useActiveCollectionStore((s) => s.activeId);
  const isLocked = useWorkspaceLockStore((s) => s.isLocked);
  return useQuery({
    queryKey: COOKIE_KEY(activeId, envId),
    queryFn: () => LiteAPI.listCookies(activeId!, envId || undefined),
    enabled: !!activeId && !!envId && !isLocked,
    retry: false,
  });
};

export const useUpsertCookieMutation = (envId: string | null) => {
  const qc = useQueryClient();
  const activeId = useActiveCollectionStore((s) => s.activeId);
  return useMutation({
    mutationFn: async (cookie: StoredCookie) => {
      if (!activeId) throw new Error('No active collection selected');
      if (useWorkspaceLockStore.getState().isLocked) throw new Error('Workspace locked');
      return LiteAPI.upsertCookie(activeId, cookie, envId || undefined);
    },
    onSuccess: (data) => {
      qc.setQueryData(COOKIE_KEY(activeId, envId), data);
    },
  });
};

type DeleteParams = { domain?: string; path?: string; name?: string };

export const useDeleteCookieMutation = (envId: string | null) => {
  const qc = useQueryClient();
  const activeId = useActiveCollectionStore((s) => s.activeId);
  return useMutation({
    mutationFn: async (filters: DeleteParams = {}) => {
      if (!activeId) throw new Error('No active collection selected');
      if (useWorkspaceLockStore.getState().isLocked) throw new Error('Workspace locked');
      return LiteAPI.deleteCookies(activeId, { ...filters, envId: envId || undefined });
    },
    onSuccess: (data) => {
      qc.setQueryData(COOKIE_KEY(activeId, envId), data);
    },
  });
};
