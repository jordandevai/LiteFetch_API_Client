import { create } from 'zustand';
import type { RequestResult } from '../lib/api';

interface ActiveRequestState {
  activeRequestId: string | null;
  result: RequestResult | null;
  runningByRequest: Record<string, boolean>;
  runningCount: number;
  resultsByRequest: Record<string, RequestResult>;
  sentByRequest: Record<string, any>;
  requestSelectionGuard: ((nextId: string | null) => boolean) | null;

  setActiveRequestId: (id: string | null) => void;
  setRequestSelectionGuard: (guard: ((nextId: string | null) => boolean) | null) => void;
  setResult: (res: RequestResult | null, requestId?: string) => void;
  setRequestRunning: (requestId: string, val: boolean) => void;
  setSentRequest: (requestId: string, sent: any) => void;
}

export const useActiveRequestStore = create<ActiveRequestState>((set) => ({
  activeRequestId: null,
  result: null,
  runningByRequest: {},
  runningCount: 0,
  resultsByRequest: {},
  sentByRequest: {},
  requestSelectionGuard: null,

  setActiveRequestId: (id) =>
    set((state) => {
      if (id !== state.activeRequestId && state.requestSelectionGuard && !state.requestSelectionGuard(id)) {
        return state;
      }
      if (!id) return { activeRequestId: null, result: null };
      const existing = state.resultsByRequest[id] || null;
      return { activeRequestId: id, result: existing };
    }),
  setRequestSelectionGuard: (guard) => set({ requestSelectionGuard: guard }),
  setResult: (res, requestId) =>
    set((state) => {
      const nextMap = { ...state.resultsByRequest };
      if (res && (requestId || res.request_id)) {
        nextMap[requestId || res.request_id] = res;
      }
      return { result: res, resultsByRequest: nextMap };
    }),
  setRequestRunning: (requestId, val) =>
    set((state) => {
      const next = { ...state.runningByRequest };
      if (val) next[requestId] = true;
      else delete next[requestId];
      return { runningByRequest: next, runningCount: Object.keys(next).length };
    }),
  setSentRequest: (requestId, sent) =>
    set((state) => ({
      sentByRequest: { ...state.sentByRequest, [requestId]: sent },
    })),
}));
