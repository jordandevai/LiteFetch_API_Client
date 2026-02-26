import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LiteAPI, type LastResults, type RequestResult } from '../lib/api';
import { useActiveCollectionStore } from '../stores/useActiveCollectionStore';
import { useWorkspaceLockStore } from '../stores/useWorkspaceLockStore';

const LAST_RESULTS_KEY = (collectionId: string | null) => ['last-results', collectionId || 'none'];

export const useLastResultsQuery = () => {
  const activeId = useActiveCollectionStore((s) => s.activeId);
  const isLocked = useWorkspaceLockStore((s) => s.isLocked);
  return useQuery({
    queryKey: LAST_RESULTS_KEY(activeId),
    queryFn: () => LiteAPI.getLastResults(activeId!),
    initialData: {},
    enabled: !!activeId && !isLocked,
    retry: false,
  });
};

export const useSaveLastResultMutation = () => {
  const qc = useQueryClient();
  const activeId = useActiveCollectionStore((s) => s.activeId);
  return useMutation({
    mutationFn: async ({ result }: { result: RequestResult }) => {
      if (!activeId) throw new Error('No active collection selected');
      const current = qc.getQueryData<LastResults>(LAST_RESULTS_KEY(activeId)) || {};
      const next = { ...current, [result.request_id]: result };
      qc.setQueryData(LAST_RESULTS_KEY(activeId), next);
      await LiteAPI.upsertLastResult(activeId, result.request_id, result);
    },
  });
};
