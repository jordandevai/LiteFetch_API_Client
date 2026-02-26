import { create } from 'zustand';
import {
  cloneRevisionSnapshot,
  getRevisionSnapshotHash,
  MAX_REVISIONS_PER_REQUEST,
  type RequestRevisionSnapshot,
} from '../lib/history/requestRevisions';

type RevisionEntry = {
  snapshot: RequestRevisionSnapshot;
  hash: string;
  timestamp: number;
};

type RequestRevisionState = {
  entries: RevisionEntry[];
  index: number;
};

type RevisionStore = {
  byRequest: Record<string, RequestRevisionState>;
  initRequestHistory: (requestId: string, snapshot: RequestRevisionSnapshot) => void;
  captureSnapshot: (requestId: string, snapshot: RequestRevisionSnapshot) => void;
  canUndo: (requestId: string) => boolean;
  canRedo: (requestId: string) => boolean;
  undo: (requestId: string) => RequestRevisionSnapshot | null;
  redo: (requestId: string) => RequestRevisionSnapshot | null;
  clearRequestHistory: (requestId: string) => void;
};

const createEntry = (snapshot: RequestRevisionSnapshot): RevisionEntry => ({
  snapshot: cloneRevisionSnapshot(snapshot),
  hash: getRevisionSnapshotHash(snapshot),
  timestamp: Date.now(),
});

export const useRequestRevisionStore = create<RevisionStore>((set, get) => ({
  byRequest: {},

  initRequestHistory: (requestId, snapshot) =>
    set((state) => {
      const entry = createEntry(snapshot);
      return {
        byRequest: {
          ...state.byRequest,
          [requestId]: {
            entries: [entry],
            index: 0,
          },
        },
      };
    }),

  captureSnapshot: (requestId, snapshot) =>
    set((state) => {
      const current = state.byRequest[requestId];
      if (!current) {
        const entry = createEntry(snapshot);
        return {
          byRequest: {
            ...state.byRequest,
            [requestId]: { entries: [entry], index: 0 },
          },
        };
      }

      const hash = getRevisionSnapshotHash(snapshot);
      const active = current.entries[current.index];
      if (active && active.hash === hash) return state;

      const truncated = current.entries.slice(0, current.index + 1);
      const appended = [...truncated, createEntry(snapshot)];
      const capped = appended.length > MAX_REVISIONS_PER_REQUEST ? appended.slice(appended.length - MAX_REVISIONS_PER_REQUEST) : appended;
      return {
        byRequest: {
          ...state.byRequest,
          [requestId]: {
            entries: capped,
            index: capped.length - 1,
          },
        },
      };
    }),

  canUndo: (requestId) => {
    const current = get().byRequest[requestId];
    return Boolean(current && current.index > 0);
  },

  canRedo: (requestId) => {
    const current = get().byRequest[requestId];
    return Boolean(current && current.index < current.entries.length - 1);
  },

  undo: (requestId) => {
    const current = get().byRequest[requestId];
    if (!current || current.index <= 0) return null;
    const nextIndex = current.index - 1;
    const entry = current.entries[nextIndex];
    set((state) => ({
      byRequest: {
        ...state.byRequest,
        [requestId]: { ...current, index: nextIndex },
      },
    }));
    return cloneRevisionSnapshot(entry.snapshot);
  },

  redo: (requestId) => {
    const current = get().byRequest[requestId];
    if (!current || current.index >= current.entries.length - 1) return null;
    const nextIndex = current.index + 1;
    const entry = current.entries[nextIndex];
    set((state) => ({
      byRequest: {
        ...state.byRequest,
        [requestId]: { ...current, index: nextIndex },
      },
    }));
    return cloneRevisionSnapshot(entry.snapshot);
  },

  clearRequestHistory: (requestId) =>
    set((state) => {
      const next = { ...state.byRequest };
      delete next[requestId];
      return { byRequest: next };
    }),
}));
