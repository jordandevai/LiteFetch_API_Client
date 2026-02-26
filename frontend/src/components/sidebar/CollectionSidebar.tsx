import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Folder, ChevronRight, ChevronDown, Plus, Copy, Pencil, Trash2, FilePlus, FolderPlus, Play, Move } from 'lucide-react';
import { useActiveRequestStore } from '../../stores/useActiveRequestStore';
import { CollectionFolder, HttpRequest } from '../../lib/api';
import { cn } from '../../lib/utils';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { PromptDialog } from '../ui/PromptDialog';
import {
  useCollectionQuery,
  useCreateRequestMutation,
  useCreateFolderMutation,
  useRenameItemMutation,
  useDeleteItemMutation,
  useDuplicateItemMutation,
  useMoveItemMutation,
  useFlattenedItems,
} from '../../hooks/useCollectionData';
import { useQueryClient } from '@tanstack/react-query';
import {
  DndContext,
  closestCenter,
  pointerWithin,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { SortableTreeItem } from './SortableTreeItem';
import { useUiStateQuery, useSaveUiStateMutation } from '../../hooks/useUiState';
import { useSaveLastResultMutation } from '../../hooks/useLastResults';
import { useLastResultsQuery } from '../../hooks/useLastResults';
import { useActiveCollectionStore } from '../../stores/useActiveCollectionStore';
import { useCollectionsIndex, useCreateCollectionMutation, useDeleteCollectionMutation } from '../../hooks/useCollectionsIndex';
import { LiteAPI } from '../../lib/api';
import { executeBulkRun } from '../../lib/runtime/bulkRun';
import { useRunSettingsStore } from '../../stores/useRunSettingsStore';

// Recursive Tree Item Component
const TreeItem = ({
  item,
  depth = 0,
  parentId,
  index,
  onNewRequest,
  onNewFolder,
  onRename,
  onDelete,
  onDuplicate,
  isFolderOpen,
  onToggleFolder,
  onRunFolder,
  lastResults,
  onMove,
  dragOverId,
}: {
  item: CollectionFolder | HttpRequest;
  depth?: number;
  parentId: string | null;
  index: number;
  onNewRequest: (parentId: string) => void;
  onNewFolder: (parentId: string) => void;
  onRename: (id: string, currentName: string) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  isFolderOpen: (id: string) => boolean;
  onToggleFolder: (id: string) => void;
  onRunFolder: (id: string) => void;
  lastResults: Record<string, any>;
  onMove: (id: string) => void;
  dragOverId: string | null;
}) => {
  const isOpen = 'items' in item ? isFolderOpen(item.id) : false;
  const setActiveRequestId = useActiveRequestStore((s) => s.setActiveRequestId);
  const activeId = useActiveRequestStore((s) => s.activeRequestId);
  const dirtyByRequest = useActiveRequestStore((s) => s.dirtyByRequest);

  const isFolder = 'items' in item;
  const paddingLeft = `${depth * 12 + 12}px`;
  const isDropTarget = dragOverId === item.id;
  const dropClass = isDropTarget ? "bg-primary/15 border-primary" : "hover:bg-secondary border-transparent hover:border-primary/30";
  const isRequestDirty = !isFolder && Boolean(dirtyByRequest[item.id]);

  if (isFolder) {
    return (
      <SortableTreeItem
        id={item.id}
        item={item}
        parentId={parentId}
        index={index}
        render={(style, attributes, listeners) => (
          <div style={style}>
            <div
              className={cn(
                "group relative flex items-center py-1 px-2 cursor-pointer text-sm select-none border-l-2 transition-colors rounded-sm",
                dropClass
              )}
              style={{ paddingLeft }}
              onClick={() => onToggleFolder(item.id)}
              {...attributes}
              {...listeners}
            >
              {isOpen ? <ChevronDown size={14} className="mr-1 shrink-0" /> : <ChevronRight size={14} className="mr-1 shrink-0" />}
              <Folder size={14} className="mr-2 text-yellow-500 shrink-0" />
              <span className="flex-1 pr-1">{item.name}</span>
              {isDropTarget && (
                <span className="text-[10px] text-primary font-semibold mr-2">Drop to nest</span>
              )}
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 bg-secondary px-1 rounded">
                <button
                  className="p-1 rounded hover:bg-muted"
                  onClick={(e) => {
                    e.stopPropagation();
                    onNewRequest(item.id);
                  }}
                  title="Add Request"
                >
                  <FilePlus size={14} />
                </button>
                <button
                  className="p-1 rounded hover:bg-muted"
                  onClick={(e) => {
                    e.stopPropagation();
                    onNewFolder(item.id);
                  }}
                  title="Add Folder"
                >
                  <FolderPlus size={14} />
                </button>
                <button
                  className="p-1 rounded hover:bg-muted"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRename(item.id, item.name);
                  }}
                  title="Rename"
                >
                  <Pencil size={14} />
                </button>
                <button
              className="p-1 rounded hover:bg-muted"
              onClick={(e) => {
                e.stopPropagation();
                onDuplicate(item.id);
              }}
              title="Duplicate"
            >
              <Copy size={14} />
            </button>
            <button
              className="p-1 rounded hover:bg-muted"
              onClick={(e) => {
                e.stopPropagation();
                onMove(item.id);
              }}
              title="Move"
            >
              <Move size={14} />
            </button>
            <button
              className="p-1 rounded hover:bg-muted text-success"
              onClick={(e) => {
                e.stopPropagation();
                onRunFolder(item.id);
                  }}
                  title="Run Folder"
                >
                  <Play size={14} />
                </button>
                <button
                  className="p-1 rounded hover:bg-muted text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(item.id);
                  }}
                  title="Delete"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
            {isOpen && (
              <div>
                {(item as CollectionFolder).items.map((child, idx) => (
                  <TreeItem
                    key={child.id}
                    item={child}
                    depth={depth + 1}
                    parentId={item.id}
                    index={idx}
                onNewRequest={onNewRequest}
                onNewFolder={onNewFolder}
                onRename={onRename}
                onDelete={onDelete}
                onDuplicate={onDuplicate}
                isFolderOpen={isFolderOpen}
                onToggleFolder={onToggleFolder}
                onRunFolder={onRunFolder}
                lastResults={lastResults}
                onMove={onMove}
                dragOverId={dragOverId}
              />
            ))}
          </div>
        )}
      </div>
        )}
      />
    );
  }

  // It's a Request
  return (
    <SortableTreeItem
      id={item.id}
      item={item}
      parentId={parentId}
      index={index}
      render={(style, attributes, listeners) => (
        <div
          className={cn(
            "group relative flex items-center py-1.5 px-2 cursor-pointer text-sm border-l-2 transition-colors rounded-sm",
            activeId === item.id
              ? "bg-secondary border-primary"
              : isDropTarget
                ? "bg-primary/15 border-primary"
                : "border-transparent hover:bg-secondary hover:border-primary/30"
          )}
          style={{ ...style, paddingLeft }}
          onClick={() => setActiveRequestId(item.id)}
          {...attributes}
          {...listeners}
        >
          <span className={cn(
            "text-[10px] font-bold w-8 mr-2 shrink-0",
            item.method === 'GET' ? 'text-success' :
            item.method === 'POST' ? 'text-primary' :
            item.method === 'DELETE' ? 'text-destructive' : 'text-warning'
          )}>
            {item.method}
          </span>
          <span className="flex-1 opacity-80 pr-1 flex items-center gap-1 min-w-0">
            <span className="truncate">{item.name}</span>
            {isRequestDirty && <span className="text-[12px] leading-none text-amber-600">*</span>}
          </span>
          <span className="text-[10px] font-mono rounded px-1 py-0.5 bg-muted text-muted-foreground shrink-0">
            {lastResults[item.id]
              ? lastResults[item.id].status_code === 0
                ? 'ERR'
                : lastResults[item.id].status_code
              : '—'}
          </span>
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 bg-secondary px-1 rounded">
            <button
              className="p-1 rounded hover:bg-muted"
              onClick={(e) => {
                e.stopPropagation();
                onRename(item.id, item.name);
              }}
              title="Rename"
            >
              <Pencil size={14} />
            </button>
            <button
              className="p-1 rounded hover:bg-muted"
              onClick={(e) => {
                e.stopPropagation();
                onDuplicate(item.id);
              }}
              title="Duplicate"
            >
              <Copy size={14} />
            </button>
            <button
              className="p-1 rounded hover:bg-muted text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(item.id);
              }}
              title="Delete"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      )}
    />
  );
};

export const CollectionSidebar = () => {
  const { activeId, setActiveId } = useActiveCollectionStore();
  const { data: collectionsMeta } = useCollectionsIndex();
  const { mutateAsync: createCollectionMeta, isPending: isCreatingCollection } = useCreateCollectionMutation();
  const { mutateAsync: deleteCollectionMeta, isPending: isDeletingCollection } = useDeleteCollectionMutation();
  const { data: collection, isLoading, error } = useCollectionQuery();
  const { mutateAsync: createRequest, isPending: isCreating } = useCreateRequestMutation();
  const { mutateAsync: createFolder, isPending: isCreatingFolder } = useCreateFolderMutation();
  const { mutateAsync: renameItem } = useRenameItemMutation();
  const { mutateAsync: deleteItem } = useDeleteItemMutation();
  const { mutateAsync: duplicateItem } = useDuplicateItemMutation();
  const { mutateAsync: moveItem } = useMoveItemMutation();
  const { mutateAsync: saveLastResult } = useSaveLastResultMutation();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const flatItems = useFlattenedItems();
  const idToNode = useMemo(() => new Map(flatItems.map((f) => [f.id, f])), [flatItems]);
  const queryClient = useQueryClient();
  const { data: uiState } = useUiStateQuery();
  const { mutate: saveUiState } = useSaveUiStateMutation();
  const { setResult, setRequestRunning, setActiveRequestId } = useActiveRequestStore();
  const getConcurrencyForFolder = useRunSettingsStore((s) => s.getConcurrencyForFolder);
  const { data: lastResults } = useLastResultsQuery();
  // reserved for future visual indicator per-folder running
  const [runningFolderId, setRunningFolderId] = useState<string | null>(null); // eslint-disable-line @typescript-eslint/no-unused-vars
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  // Dialog states
  const [promptDialog, setPromptDialog] = useState<{
    open: boolean;
    title: string;
    message?: string;
    placeholder?: string;
    defaultValue: string;
    onConfirm: (value: string) => void;
  }>({ open: false, title: '', defaultValue: '', onConfirm: () => {} });

  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    message: string;
    variant?: 'default' | 'destructive';
    onConfirm: () => void;
  }>({ open: false, title: '', message: '', onConfirm: () => {} });
  const [banner, setBanner] = useState<{ message: string; tone: 'info' | 'error' | 'success' } | null>(null);
  const showBanner = (message: string, tone: 'info' | 'error' | 'success' = 'info') => {
    setBanner({ message, tone });
    window.setTimeout(() => setBanner(null), 2500);
  };
  const hoverExpandTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!activeId && collectionsMeta && collectionsMeta.length > 0) {
      setActiveId(collectionsMeta[0].id);
    }
  }, [activeId, collectionsMeta, setActiveId]);

  useEffect(() => {
    if (!collectionsMeta || collectionsMeta.length > 0) return;
    if (!isCreatingCollection) {
      createCollectionMeta({ name: 'Default' }).then((meta) => setActiveId(meta.id));
    }
  }, [collectionsMeta, createCollectionMeta, isCreatingCollection, setActiveId]);

  const isFolderOpen = useCallback((id: string) => !!uiState?.openFolders?.includes(id), [uiState?.openFolders]);
  const toggleFolder = useCallback((id: string) => {
    const current = new Set(uiState?.openFolders || []);
    if (current.has(id)) current.delete(id);
    else current.add(id);
    saveUiState({ openFolders: Array.from(current) });
  }, [saveUiState, uiState?.openFolders]);

  const getChildCount = (parentId: string | null) => {
    if (!collection) return 0;
    if (!parentId) return collection.items.length;
    const node = idToNode.get(parentId);
    if (node && 'items' in node.item) return node.item.items.length;
    return 0;
  };

  // Auto-expand a folder if dragging over while closed
  useEffect(() => {
    if (!dragOverId) {
      if (hoverExpandTimerRef.current) {
        window.clearTimeout(hoverExpandTimerRef.current);
        hoverExpandTimerRef.current = null;
      }
      return;
    }
    const node = idToNode.get(dragOverId);
    if (!node || !('items' in node.item)) return;
    if (isFolderOpen(node.id)) return;
    hoverExpandTimerRef.current = window.setTimeout(() => {
      toggleFolder(node.id);
    }, 350);
    return () => {
      if (hoverExpandTimerRef.current) {
        window.clearTimeout(hoverExpandTimerRef.current);
        hoverExpandTimerRef.current = null;
      }
    };
  }, [dragOverId, idToNode, isFolderOpen, toggleFolder]);

  const canMoveTo = (id: string, targetParentId: string | null) => {
    let cursor = targetParentId;
    while (cursor) {
      if (cursor === id) return false;
      const parentNode = idToNode.get(cursor);
      cursor = parentNode?.parentId || null;
    }
    return true;
  };

  const handleMove = async (id: string) => {
    const folderOptions = [
      { id: null as string | null, name: 'Root' },
      ...flatItems
        .filter((f) => 'items' in f.item)
        .map((f) => ({ id: f.id, name: (f.item as CollectionFolder).name })),
    ];
    const names = folderOptions.map((f) => f.name).join(', ');

        setPromptDialog({
          open: true,
          title: 'Move Item',
          message: `Available folders: ${names}`,
          placeholder: 'Enter folder name',
      defaultValue: 'Root',
      onConfirm: async (chosen) => {
        setPromptDialog((prev) => ({ ...prev, open: false }));
        const target = folderOptions.find(
          (f) => f.name.toLowerCase() === chosen.toLowerCase(),
        );
        if (!target) {
          showBanner('Folder not found', 'error');
          return;
        }
        if (!canMoveTo(id, target.id)) {
          showBanner('Cannot move a folder into itself or its descendants', 'error');
          return;
        }
        const index = getChildCount(target.id);
        await moveItem({ id, targetParentId: target.id, index });
        showBanner('Item moved', 'success');
      },
    });
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setDragOverId(null);
    if (!over || active.id === over.id) return;
    const targetNode = idToNode.get(String(over.id));
    if (!targetNode) return;

    const targetItem = targetNode.item;
    const targetParentId = 'items' in targetItem ? targetItem.id : targetNode.parentId;
    const targetIndex = 'items' in targetItem ? targetItem.items.length : targetNode.index;

    // Prevent moving into itself or its descendants
    let cursor = targetParentId;
    while (cursor) {
      if (cursor === active.id) return;
      const parentNode = idToNode.get(cursor);
      cursor = parentNode?.parentId || null;
    }

    await moveItem({
      id: String(active.id),
      targetParentId,
      index: targetIndex,
    });
  };

  const flattenRequests = (node: CollectionFolder): HttpRequest[] => {
    const result: HttpRequest[] = [];
    node.items.forEach((item) => {
      if ('items' in item) {
        result.push(...flattenRequests(item));
      } else {
        result.push(item as HttpRequest);
      }
    });
    return result;
  };

  const runFolder = async (folderId: string) => {
    if (!activeId) {
      showBanner('Select a collection first', 'error');
      return;
    }
    const node = idToNode.get(folderId);
    if (!node || !('items' in node.item)) {
      showBanner('Folder not found', 'error');
      return;
    }
    const requests = flattenRequests(node.item as CollectionFolder);
    if (requests.length === 0) {
      showBanner('Folder has no requests', 'info');
      return;
    }
    setRunningFolderId(folderId);
    const concurrency = getConcurrencyForFolder(folderId);
    const report = await executeBulkRun(
      requests.map((req) => ({
        requestId: req.id,
        execute: async () => {
          setActiveRequestId(req.id);
          return LiteAPI.runRequest(activeId, req);
        },
      })),
      concurrency,
      {
        onItemStart: (requestId) => setRequestRunning(requestId, true),
        onItemDone: async (requestId, res) => {
          setResult(res, requestId);
          await saveLastResult({ result: res });
          setRequestRunning(requestId, false);
        },
        onItemError: (requestId, error) => {
          console.error(error);
          setRequestRunning(requestId, false);
        },
      },
    );
    queryClient.invalidateQueries({ queryKey: ['environment', activeId] }); // refresh env after folder run
    setRunningFolderId(null);
    showBanner(
      `Folder run complete (${concurrency}x): ${report.passed} passed, ${report.failed} failed`,
      report.failed ? 'error' : 'success',
    );
  };

  if (!activeId) {
    return (
      <div className="h-full flex flex-col bg-muted border-r border-border">
        <div className="p-3 border-b border-border bg-muted space-y-2">
          <h2 className="font-semibold text-sm text-muted-foreground">Explorer</h2>
          <p className="text-xs text-muted-foreground">No collection selected</p>
          <button
            className="w-full text-xs px-2 py-1.5 border border-border rounded bg-white hover:bg-secondary transition-colors flex items-center justify-center gap-1.5 font-medium"
              onClick={() => {
                setPromptDialog({
                  open: true,
                  title: 'New Collection',
                  placeholder: 'Enter collection name',
                  defaultValue: 'New Collection',
                  onConfirm: async (name) => {
                    setPromptDialog((prev) => ({ ...prev, open: false }));
                    const meta = await createCollectionMeta({ name });
                    setActiveId(meta.id);
                    showBanner(`Created collection "${meta.name}"`, 'success');
                  },
                });
              }}
            disabled={isCreatingCollection}
            type="button"
          >
            <Plus size={14} /> Create Collection
          </button>
        </div>

        <PromptDialog
          open={promptDialog.open}
          title={promptDialog.title}
          message={promptDialog.message}
          placeholder={promptDialog.placeholder}
          defaultValue={promptDialog.defaultValue}
          onConfirm={promptDialog.onConfirm}
          onCancel={() => setPromptDialog((prev) => ({ ...prev, open: false }))}
        />

        <ConfirmDialog
          open={confirmDialog.open}
          title={confirmDialog.title}
          message={confirmDialog.message}
          variant={confirmDialog.variant}
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog((prev) => ({ ...prev, open: false }))}
        />
        {banner && (
          <div
            className={`px-3 py-2 text-[11px] ${
              banner.tone === 'error'
                ? 'bg-destructive/10 text-destructive'
                : banner.tone === 'success'
                ? 'bg-success/10 text-success'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            {banner.message}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-muted border-r border-border">
      {/* Explorer Header with Collection Management */}
      <div className="p-3 border-b border-border bg-muted space-y-2">
        <h2 className="font-semibold text-sm text-muted-foreground">Explorer</h2>

        {/* Collection Selector & Actions */}
        <div className="flex items-center gap-2">
          <select
            className="text-xs bg-white border border-border rounded px-2 py-1 flex-1 min-w-0"
            value={activeId || ''}
            onChange={(e) => setActiveId(e.target.value || null)}
          >
            <option value="" disabled>
              Select collection
            </option>
            {(collectionsMeta || []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <button
            className="text-xs px-2 py-1 border border-border rounded bg-white hover:bg-secondary shrink-0"
            onClick={() => {
              setPromptDialog({
                open: true,
                title: 'New Collection',
                placeholder: 'Enter collection name',
                defaultValue: 'New Collection',
                  onConfirm: async (name) => {
                    setPromptDialog((prev) => ({ ...prev, open: false }));
                    const meta = await createCollectionMeta({ name });
                    queryClient.invalidateQueries({ queryKey: ['collection', meta.id] });
                    setActiveId(meta.id);
                    showBanner(`Created collection "${meta.name}"`, 'success');
                  },
                });
              }}
              disabled={isCreatingCollection}
            type="button"
            title="Create new collection"
          >
            <Plus size={14} />
          </button>
          {activeId && activeId !== 'default' && (
            <button
              className="text-xs px-2 py-1 border border-destructive text-destructive rounded bg-white hover:bg-destructive/10 shrink-0"
              onClick={() => {
                const name = collectionsMeta?.find((m) => m.id === activeId)?.name || activeId;
                setConfirmDialog({
                  open: true,
                  title: 'Delete Collection',
                  message: `Delete collection "${name}"? This cannot be undone.`,
                  variant: 'destructive',
                  onConfirm: async () => {
                    setConfirmDialog((prev) => ({ ...prev, open: false }));
                    await deleteCollectionMeta(activeId);
                    queryClient.removeQueries({ queryKey: ['collection', activeId] });
                    const remaining = (collectionsMeta || []).filter((m) => m.id !== activeId);
                    setActiveId(remaining[0]?.id || null);
                    showBanner(`Deleted collection "${name}"`, 'info');
                  },
                });
              }}
              disabled={isDeletingCollection}
              type="button"
              title="Delete collection"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>

        {/* Request/Folder Actions */}
        <div className="flex items-center gap-2 pt-1">
          <button
            className="flex-1 text-xs px-2 py-1.5 border border-border rounded bg-white hover:bg-secondary transition-colors flex items-center justify-center gap-1.5 font-medium"
            onClick={async () => {
              const req = await createRequest({});
              setActiveRequestId(req.id);
            }}
            disabled={isCreating || !activeId}
            type="button"
          >
            <Plus size={14} /> Request
          </button>
          <button
            className="flex-1 text-xs px-2 py-1.5 border border-border rounded bg-white hover:bg-secondary transition-colors flex items-center justify-center gap-1.5 font-medium"
            onClick={async () => {
              await createFolder({});
            }}
            disabled={isCreatingFolder || !activeId}
            type="button"
          >
            <FolderPlus size={14} /> Folder
          </button>
        </div>
      </div>
      {banner && (
        <div
          className={`px-3 py-2 text-[11px] ${
            banner.tone === 'error'
              ? 'bg-destructive/10 text-destructive'
              : banner.tone === 'success'
              ? 'bg-success/10 text-success'
              : 'bg-muted text-muted-foreground'
          }`}
        >
          {banner.message}
        </div>
      )}
      <div className="flex-1 overflow-y-auto py-2">
        <DndContext
          sensors={sensors}
          collisionDetection={(args) => {
            // Prefer the element directly under the pointer (better folder nesting target)
            const pointerOver = pointerWithin(args)[0];
            if (pointerOver) return [pointerOver];
            return closestCenter(args);
          }}
          onDragOver={(event) => setDragOverId(event.over ? String(event.over.id) : null)}
          onDragCancel={() => setDragOverId(null)}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={flatItems.map((f) => f.id)}
            strategy={verticalListSortingStrategy}
          >
            {collection?.items.map((item, idx) => (
              <TreeItem
                key={item.id}
                item={item}
                parentId={null}
                depth={0}
                index={idx}
                onNewRequest={(parentId) => createRequest({ parentId })}
                onNewFolder={(parentId) => createFolder({ parentId })}
                onRename={(id, currentName) => {
                  setPromptDialog({
                    open: true,
                    title: 'Rename Item',
                    placeholder: 'Enter new name',
                    defaultValue: currentName,
                    onConfirm: (name) => {
                      setPromptDialog((prev) => ({ ...prev, open: false }));
                      renameItem({ id, name });
                    },
                  });
                }}
                onDelete={(id) => {
                  setConfirmDialog({
                    open: true,
                    title: 'Delete Item',
                    message: 'Delete this item? This cannot be undone.',
                    variant: 'destructive',
                    onConfirm: () => {
                      setConfirmDialog((prev) => ({ ...prev, open: false }));
                      deleteItem(id);
                    },
                  });
                }}
                onDuplicate={(id) => duplicateItem(id)}
                isFolderOpen={isFolderOpen}
                onToggleFolder={toggleFolder}
                onRunFolder={runFolder}
                lastResults={lastResults || {}}
                onMove={handleMove}
                dragOverId={dragOverId}
              />
            ))}
          </SortableContext>
        </DndContext>
        {isLoading && <div className="text-center text-xs text-muted-foreground mt-10">Loading...</div>}
        {error && (
          <div className="text-center text-xs text-red-500 mt-10">
            Failed to load collection
          </div>
        )}
      </div>

      <PromptDialog
        open={promptDialog.open}
        title={promptDialog.title}
        message={promptDialog.message}
        placeholder={promptDialog.placeholder}
        defaultValue={promptDialog.defaultValue}
        onConfirm={promptDialog.onConfirm}
        onCancel={() => setPromptDialog((prev) => ({ ...prev, open: false }))}
      />

      <ConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.title}
        message={confirmDialog.message}
        variant={confirmDialog.variant}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog((prev) => ({ ...prev, open: false }))}
      />
    </div>
  );
};
