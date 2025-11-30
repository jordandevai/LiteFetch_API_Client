import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { CollectionFolder, HttpRequest } from '../../lib/api';

type SortableTreeItemProps = {
  id: string;
  item: CollectionFolder | HttpRequest;
  parentId: string | null;
  index: number;
  render: (style: React.CSSProperties, attributes: any, listeners: any) => React.ReactNode;
};

export const SortableTreeItem = ({ id, item, parentId, index, render }: SortableTreeItemProps) => {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id,
    data: { parentId, index, isFolder: 'items' in item },
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return (
    <div ref={setNodeRef} style={style}>
      {render(style, attributes, listeners)}
    </div>
  );
};
