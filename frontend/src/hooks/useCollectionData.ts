import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LiteAPI, type Collection, type CollectionFolder, type HttpRequest } from '../lib/api';
import { useActiveCollectionStore } from '../stores/useActiveCollectionStore';
import { useWorkspaceLockStore } from '../stores/useWorkspaceLockStore';

const COLLECTION_KEY = (collectionId: string | null) => ['collection', collectionId || 'none'];

const generateId = () =>
  Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

const findRequestInTree = (
  items: (CollectionFolder | HttpRequest)[],
  id: string,
): HttpRequest | null => {
  for (const item of items) {
    if (!('items' in item) && item.id === id) return item as HttpRequest;
    if ('items' in item) {
      const found = findRequestInTree(item.items, id);
      if (found) return found;
    }
  }
  return null;
};

const findItemInTree = (
  items: (CollectionFolder | HttpRequest)[],
  id: string,
): CollectionFolder | HttpRequest | null => {
  for (const item of items) {
    if (item.id === id) return item;
    if ('items' in item) {
      const found = findItemInTree(item.items, id);
      if (found) return found;
    }
  }
  return null;
};

const insertIntoTree = (
  items: (CollectionFolder | HttpRequest)[],
  parentId: string | null,
  newItem: CollectionFolder | HttpRequest,
): (CollectionFolder | HttpRequest)[] => {
  if (!parentId) {
    return [...items, newItem];
  }
  return items.map((item) => {
    if ('items' in item && item.id === parentId) {
      return { ...item, items: [...item.items, newItem] };
    }
    if ('items' in item) {
      return { ...item, items: insertIntoTree(item.items, parentId, newItem) };
    }
    return item;
  });
};

const updateNameInTree = (
  items: (CollectionFolder | HttpRequest)[],
  id: string,
  name: string,
): (CollectionFolder | HttpRequest)[] =>
  items.map((item) => {
    if (item.id === id) return { ...item, name };
    if ('items' in item) return { ...item, items: updateNameInTree(item.items, id, name) };
    return item;
  });

const updateRequestInTree = (
  items: (CollectionFolder | HttpRequest)[],
  updated: HttpRequest,
): (CollectionFolder | HttpRequest)[] =>
  items.map((item) => {
    if (!('items' in item)) {
      return item.id === updated.id ? updated : item;
    }
    return { ...item, items: updateRequestInTree(item.items, updated) };
  });

const deleteFromTree = (
  items: (CollectionFolder | HttpRequest)[],
  id: string,
): (CollectionFolder | HttpRequest)[] =>
  items
    .filter((item) => item.id !== id)
    .map((item) => ('items' in item ? { ...item, items: deleteFromTree(item.items, id) } : item));

const duplicateWithNewIds = (item: CollectionFolder | HttpRequest): CollectionFolder | HttpRequest => {
  const newId = generateId();
  if ('items' in item) {
    return {
      ...item,
      id: newId,
      name: `${item.name} copy`,
      items: item.items.map(duplicateWithNewIds),
    };
  }
  return { ...item, id: newId, name: `${item.name} copy` };
};

const duplicateItemInTree = (
  items: (CollectionFolder | HttpRequest)[],
  id: string,
): (CollectionFolder | HttpRequest)[] => {
  return items.flatMap((item) => {
    if (item.id === id) {
      const cloned = duplicateWithNewIds(item);
      return [item, cloned];
    }
    if ('items' in item) {
      return [{ ...item, items: duplicateItemInTree(item.items, id) }];
    }
    return [item];
  });
};

const removeItemReturning = (
  items: (CollectionFolder | HttpRequest)[],
  id: string,
): { items: (CollectionFolder | HttpRequest)[]; removed: CollectionFolder | HttpRequest | null } => {
  const result: (CollectionFolder | HttpRequest)[] = [];
  let removed: CollectionFolder | HttpRequest | null = null;
  for (const item of items) {
    if (item.id === id) {
      removed = item;
      continue;
    }
    if ('items' in item) {
      const { items: childItems, removed: childRemoved } = removeItemReturning(item.items, id);
      if (childRemoved) removed = childRemoved;
      result.push({ ...item, items: childItems });
    } else {
      result.push(item);
    }
  }
  return { items: result, removed };
};

const insertItemAt = (
  items: (CollectionFolder | HttpRequest)[],
  parentId: string | null,
  index: number,
  item: CollectionFolder | HttpRequest,
): (CollectionFolder | HttpRequest)[] => {
  if (!parentId) {
    const copy = [...items];
    copy.splice(index, 0, item);
    return copy;
  }
  return items.map((node) => {
    if ('items' in node && node.id === parentId) {
      const copy = [...node.items];
      copy.splice(index, 0, item);
      return { ...node, items: copy };
    }
    if ('items' in node) {
      return { ...node, items: insertItemAt(node.items, parentId, index, item) };
    }
    return node;
  });
};

export const useCollectionQuery = () => {
  const activeId = useActiveCollectionStore((s) => s.activeId);
  const isLocked = useWorkspaceLockStore((s) => s.isLocked);
  return useQuery({
    queryKey: COLLECTION_KEY(activeId),
    queryFn: () => LiteAPI.getCollection(activeId!),
    enabled: !!activeId && !isLocked,
    retry: false,
  });
};

export const useCreateRequestMutation = () => {
  const qc = useQueryClient();
  const activeId = useActiveCollectionStore((s) => s.activeId);
  return useMutation({
    mutationFn: async ({ parentId = null }: { parentId?: string | null } = {}) => {
      if (!activeId) throw new Error('No active collection selected');
      const current = qc.getQueryData<Collection>(COLLECTION_KEY(activeId));
      if (!current) throw new Error('Collection not loaded');

      const newReq: HttpRequest = {
        id: generateId(),
        name: 'New Request',
        method: 'GET',
        url: 'https://jsonplaceholder.typicode.com/todos/1',
        headers: {},
        body: null,
        query_params: [],
        auth_type: 'none',
        auth_params: {},
        extract_rules: [],
      };

      const updated: Collection = {
        ...current,
        items: insertIntoTree(current.items, parentId, newReq),
      };
      qc.setQueryData(COLLECTION_KEY(activeId), updated);
      await LiteAPI.saveCollection(activeId, updated);
      return newReq;
    },
  });
};

export const useCreateFolderMutation = () => {
  const qc = useQueryClient();
  const activeId = useActiveCollectionStore((s) => s.activeId);
  return useMutation({
    mutationFn: async ({ parentId = null }: { parentId?: string | null } = {}) => {
      if (!activeId) throw new Error('No active collection selected');
      const current = qc.getQueryData<Collection>(COLLECTION_KEY(activeId));
      if (!current) throw new Error('Collection not loaded');
      const newFolder: CollectionFolder = {
        id: generateId(),
        name: 'New Folder',
        items: [],
      };
      const updated: Collection = {
        ...current,
        items: insertIntoTree(current.items, parentId, newFolder),
      };
      qc.setQueryData(COLLECTION_KEY(activeId), updated);
      await LiteAPI.saveCollection(activeId, updated);
      return newFolder;
    },
  });
};

export const useSaveRequestMutation = () => {
  const qc = useQueryClient();
  const activeId = useActiveCollectionStore((s) => s.activeId);
  return useMutation({
    mutationFn: async (updatedReq: HttpRequest) => {
      if (!activeId) throw new Error('No active collection selected');
      const current = qc.getQueryData<Collection>(COLLECTION_KEY(activeId));
      if (!current) throw new Error('Collection not loaded');
      const updatedCollection: Collection = {
        ...current,
        items: updateRequestInTree(current.items, updatedReq),
      };
      qc.setQueryData(COLLECTION_KEY(activeId), updatedCollection);
      await LiteAPI.saveCollection(activeId, updatedCollection);
      return updatedReq;
    },
  });
};

export const useRenameItemMutation = () => {
  const qc = useQueryClient();
  const activeId = useActiveCollectionStore((s) => s.activeId);
  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      if (!activeId) throw new Error('No active collection selected');
      const current = qc.getQueryData<Collection>(COLLECTION_KEY(activeId));
      if (!current) throw new Error('Collection not loaded');
      const updated: Collection = {
        ...current,
        items: updateNameInTree(current.items, id, name),
      };
      qc.setQueryData(COLLECTION_KEY(activeId), updated);
      await LiteAPI.saveCollection(activeId, updated);
    },
  });
};

export const useDeleteItemMutation = () => {
  const qc = useQueryClient();
  const activeId = useActiveCollectionStore((s) => s.activeId);
  return useMutation({
    mutationFn: async (id: string) => {
      if (!activeId) throw new Error('No active collection selected');
      const current = qc.getQueryData<Collection>(COLLECTION_KEY(activeId));
      if (!current) throw new Error('Collection not loaded');
      const updated: Collection = {
        ...current,
        items: deleteFromTree(current.items, id),
      };
      qc.setQueryData(COLLECTION_KEY(activeId), updated);
      await LiteAPI.saveCollection(activeId, updated);
    },
  });
};

export const useDuplicateItemMutation = () => {
  const qc = useQueryClient();
  const activeId = useActiveCollectionStore((s) => s.activeId);
  return useMutation({
    mutationFn: async (id: string) => {
      if (!activeId) throw new Error('No active collection selected');
      const current = qc.getQueryData<Collection>(COLLECTION_KEY(activeId));
      if (!current) throw new Error('Collection not loaded');
      const updated: Collection = {
        ...current,
        items: duplicateItemInTree(current.items, id),
      };
      qc.setQueryData(COLLECTION_KEY(activeId), updated);
      await LiteAPI.saveCollection(activeId, updated);
    },
  });
};

export const useMoveItemMutation = () => {
  const qc = useQueryClient();
  const activeId = useActiveCollectionStore((s) => s.activeId);
  return useMutation({
    mutationFn: async ({
      id,
      targetParentId,
      index,
    }: {
      id: string;
      targetParentId: string | null;
      index: number;
    }) => {
      if (!activeId) throw new Error('No active collection selected');
      const current = qc.getQueryData<Collection>(COLLECTION_KEY(activeId));
      if (!current) throw new Error('Collection not loaded');
      const { items: withoutItem, removed } = removeItemReturning(current.items, id);
      if (!removed) return;
      const updatedItems = insertItemAt(withoutItem, targetParentId, index, removed);
      const updated: Collection = { ...current, items: updatedItems };
      qc.setQueryData(COLLECTION_KEY(activeId), updated);
      await LiteAPI.saveCollection(activeId, updated);
    },
  });
};

export const useReplaceCollectionMutation = () => {
  const qc = useQueryClient();
  const activeId = useActiveCollectionStore((s) => s.activeId);
  return useMutation({
    mutationFn: async (collection: Collection) => {
      if (!activeId) throw new Error('No active collection selected');
      qc.setQueryData(COLLECTION_KEY(activeId), collection);
      await LiteAPI.saveCollection(activeId, collection);
    },
  });
};

export const useActiveRequestFromCollection = (id: string | null) => {
  const { data: collection } = useCollectionQuery();
  return useMemo(() => {
    if (!collection || !id) return null;
    return findRequestInTree(collection.items, id);
  }, [collection, id]);
};

export const useItemLookup = (id: string | null) => {
  const { data: collection } = useCollectionQuery();
  return useMemo(() => {
    if (!collection || !id) return null;
    return findItemInTree(collection.items, id);
  }, [collection, id]);
};

export type FlatNode = {
  id: string;
  parentId: string | null;
  index: number;
  item: CollectionFolder | HttpRequest;
};

const flatten = (
  items: (CollectionFolder | HttpRequest)[],
  parentId: string | null = null,
  acc: FlatNode[] = [],
) => {
  items.forEach((item, idx) => {
    acc.push({ id: item.id, parentId, index: idx, item });
    if ('items' in item) flatten(item.items, item.id, acc);
  });
  return acc;
};

export const useFlattenedItems = () => {
  const { data: collection } = useCollectionQuery();
  return useMemo(() => {
    if (!collection) return [];
    return flatten(collection.items);
  }, [collection]);
};
