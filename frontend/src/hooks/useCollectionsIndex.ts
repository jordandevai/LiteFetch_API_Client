import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LiteAPI, type CollectionMeta, type Collection, type EnvironmentFile } from '../lib/api';

export const INDEX_KEY = ['collections-index'];

export const useCollectionsIndex = () =>
  useQuery({
    queryKey: INDEX_KEY,
    queryFn: () => LiteAPI.listCollections(),
  });

export const useCreateCollectionMutation = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { name: string; collection?: Collection; environment?: EnvironmentFile }) => {
      const meta = await LiteAPI.createCollection(payload);
      qc.invalidateQueries({ queryKey: INDEX_KEY });
      return meta;
    },
  });
};

export const useDeleteCollectionMutation = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (collectionId: string) => {
      await LiteAPI.deleteCollection(collectionId);
      qc.invalidateQueries({ queryKey: INDEX_KEY });
    },
  });
};
