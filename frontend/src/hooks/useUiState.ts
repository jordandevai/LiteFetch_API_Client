import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LiteAPI, type UiState } from '../lib/api';
import { useActiveCollectionStore } from '../stores/useActiveCollectionStore';

const UI_STATE_KEY = (collectionId: string | null) => ['ui-state', collectionId || 'none'];

export const useUiStateQuery = () => {
  const activeId = useActiveCollectionStore((s) => s.activeId);
  return useQuery({
    queryKey: UI_STATE_KEY(activeId),
    queryFn: () => LiteAPI.getUiState(activeId!),
    initialData: { openFolders: [] },
    enabled: !!activeId,
  });
};

export const useSaveUiStateMutation = () => {
  const qc = useQueryClient();
  const activeId = useActiveCollectionStore((s) => s.activeId);
  return useMutation({
    mutationFn: async (ui: UiState) => {
      if (!activeId) throw new Error('No active collection selected');
      qc.setQueryData(UI_STATE_KEY(activeId), ui);
      await LiteAPI.saveUiState(activeId, ui);
    },
  });
};
