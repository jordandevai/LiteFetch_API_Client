import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LiteAPI, type EnvironmentFile } from '../lib/api';
import { useActiveCollectionStore } from '../stores/useActiveCollectionStore';
import { useWorkspaceLockStore } from '../stores/useWorkspaceLockStore';

const ENV_KEY = (collectionId: string | null) => ['environment', collectionId || 'none'];

export const useEnvironmentQuery = () => {
  const activeId = useActiveCollectionStore((s) => s.activeId);
  const isLocked = useWorkspaceLockStore((s) => s.isLocked);
  return useQuery({
    queryKey: ENV_KEY(activeId),
    queryFn: () => LiteAPI.getEnvironment(activeId!),
    enabled: !!activeId && !isLocked,
    retry: false,
  });
};

export const useSaveEnvironmentMutation = () => {
  const qc = useQueryClient();
  const activeId = useActiveCollectionStore((s) => s.activeId);
  return useMutation({
    mutationFn: async (envFile: EnvironmentFile) => {
      if (!activeId) throw new Error('No active collection selected');
      if (useWorkspaceLockStore.getState().isLocked) throw new Error('Workspace locked');
      await LiteAPI.saveEnvironment(activeId, envFile);
      qc.setQueryData(ENV_KEY(activeId), envFile);
    },
  });
};
